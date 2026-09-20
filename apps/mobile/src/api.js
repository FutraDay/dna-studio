export function normalizeServerUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Server URL must start with http:// or https://");
  }
  return trimmed;
}

async function request(
  serverUrl,
  path,
  { token, method = "GET", body, timeoutMs = 60000 } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(normalizeServerUrl(serverUrl) + path, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));    if (!response.ok) {
      const error = new Error(payload.error || "Request failed");
      error.status = response.status;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("DNA Studio did not respond before the request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function login(serverUrl, email, password) {
  return request(serverUrl, "/api/mobile/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      deviceName: "DNA Studio mobile",
    },
  });
}

export function loadOverview(serverUrl, token) {
  return request(serverUrl, "/api/mobile/overview", { token });
}

export function analyzeBrand(serverUrl, token, url, workspaceId) {
  return request(serverUrl, "/api/mobile/brands/analyze", {
    token,
    method: "POST",
    body: {
      url,
      ...(workspaceId ? { workspaceId } : {}),
    },
    timeoutMs: 180000,
  });
}
export async function logout(serverUrl, token) {
  try {
    await request(serverUrl, "/api/mobile/auth/logout", {
      token,
      method: "POST",
    });
  } catch {
    // Local logout still clears the device token if the server is unavailable.
  }
}
