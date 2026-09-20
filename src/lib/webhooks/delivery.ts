import { createHmac } from "node:crypto";
import { promises as dns } from "node:dns";
import https from "node:https";
import { isIP } from "node:net";
import type { WebhookEnvelope } from "./events";

const DEFAULT_TIMEOUT_MS = 10_000;
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
];

export class WebhookHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "WebhookHttpError";
  }
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

function ipv4Parts(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some(
      (part) => !Number.isInteger(part) || part < 0 || part > 255
    )
  ) {
    return null;
  }
  return parts;
}

function isPrivateIpv4(address: string): boolean {
  const parts = ipv4Parts(address);
  if (!parts) return true;

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

export function isPrivateAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address).split("%")[0].toLowerCase();

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isPrivateIpv4(mapped);
  }

  const family = isIP(normalized);
  if (family === 4) {
    return isPrivateIpv4(normalized);
  }

  if (family === 6) {
    if (normalized === "::" || normalized === "::1") return true;

    const firstSegment = normalized.split(":")[0] ?? "";
    if (/^f[cd]/.test(firstSegment)) return true;
    if (/^fe[89ab]/.test(firstSegment)) return true;
    if (normalized.startsWith("2001:db8:")) return true;

    return false;
  }

  return true;
}

export function validateWebhookUrl(input: string): URL {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error("Webhook URL must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
  }

  if (url.username || url.password) {
    throw new Error("Webhook URL must not contain embedded credentials");
  }

  const hostname = stripIpv6Brackets(url.hostname).toLowerCase();

  if (
    hostname === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error("Webhook URL must use a public hostname");
  }

  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error("Webhook URL must not target a private or reserved address");
  }

  return url;
}

async function resolvePublicAddress(hostname: string) {
  const normalized = stripIpv6Brackets(hostname);

  if (isIP(normalized)) {
    if (isPrivateAddress(normalized)) {
      throw new Error(
        "Webhook URL resolved to a private or reserved address"
      );
    }
    return {
      address: normalized,
      family: isIP(normalized) as 4 | 6,
    };
  }

  const addresses = await dns.lookup(normalized, {
    all: true,
    verbatim: true,
  });

  if (addresses.length === 0) {
    throw new Error("Webhook hostname could not be resolved");
  }

  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(
      "Webhook URL resolved to a private or reserved address"
    );
  }

  return addresses[0];
}

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string
): string {
  return createHmac("sha256", secret)
    .update(timestamp + "." + body)
    .digest("hex");
}

export interface WebhookSendResult {
  statusCode: number;
}

export async function sendWebhook(
  urlValue: string,
  secret: string,
  payload: WebhookEnvelope,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WebhookSendResult> {
  const target = validateWebhookUrl(urlValue);
  const hostname = stripIpv6Brackets(target.hostname);
  const resolved = await resolvePublicAddress(hostname);
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signWebhookPayload(secret, timestamp, body);

  return new Promise<WebhookSendResult>((resolve, reject) => {
    const request = https.request(
      {
        protocol: "https:",
        hostname,
        port: target.port ? Number(target.port) : 443,
        path: target.pathname + target.search,
        method: "POST",
        servername: isIP(hostname) ? undefined : hostname,
        lookup: (_lookupHostname, _options, callback) => {
          callback(null, resolved.address, resolved.family);
        },
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "DNA-Studio-Webhooks/1.0",
          "X-DNA-Studio-Event": payload.event,
          "X-DNA-Studio-Delivery": payload.id,
          "X-DNA-Studio-Timestamp": timestamp,
          "X-DNA-Studio-Signature": "sha256=" + signature,
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        response.resume();
        response.on("end", () => {
          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new WebhookHttpError(
                "Webhook returned HTTP " + statusCode,
                statusCode
              )
            );
            return;
          }

          resolve({ statusCode });
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Webhook request timed out"));
    });
    request.write(body);
    request.end();
  });
}
