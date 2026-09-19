export const WEBHOOK_EVENTS = [
  "brand.created",
  "campaign.created",
  "post.scheduled",
  "post.published",
  "post.failed",
] as const;

export const WEBHOOK_EVENT_LABELS: Record<WebhookSubscriptionEvent, string> = {
  "brand.created": "Brand created",
  "campaign.created": "Campaign created",
  "post.scheduled": "Post scheduled",
  "post.published": "Post published",
  "post.failed": "Post failed",
};

export const WEBHOOK_PROVIDERS = ["zapier", "n8n", "custom"] as const;

export type WebhookSubscriptionEvent = (typeof WEBHOOK_EVENTS)[number];
export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number];
export type WebhookEvent = WebhookSubscriptionEvent | "webhook.test";

export interface WebhookEnvelope {
  id: string;
  version: "1";
  event: WebhookEvent;
  occurredAt: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

export interface WebhookDispatch {
  workspaceId: string;
  event: WebhookSubscriptionEvent;
  data: Record<string, unknown>;
}

export function isWebhookSubscriptionEvent(
  value: string
): value is WebhookSubscriptionEvent {
  return WEBHOOK_EVENTS.includes(value as WebhookSubscriptionEvent);
}
