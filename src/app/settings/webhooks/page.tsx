"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENTS,
  type WebhookProvider,
  type WebhookSubscriptionEvent,
} from "@/lib/webhooks/events";

interface Workspace {
  id: string;
  name: string;
  role: string;
  isOwner: boolean;
}

interface Delivery {
  id: string;
  event: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

interface WebhookEndpoint {
  id: string;
  workspaceId: string;
  name: string;
  provider: WebhookProvider;
  url: string;
  events: WebhookSubscriptionEvent[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  deliveries: Delivery[];
}

const PROVIDERS: Array<{
  id: WebhookProvider;
  name: string;
  hint: string;
}> = [
  {
    id: "zapier",
    name: "Zapier",
    hint: "Use a Zapier Catch Hook URL.",
  },
  {
    id: "n8n",
    name: "n8n",
    hint: "Use a production Webhook node URL.",
  },
  {
    id: "custom",
    name: "Custom",
    hint: "Use any public HTTPS endpoint.",
  },
];

const DEFAULT_EVENTS = [...WEBHOOK_EVENTS];

export default function WebhooksSettingsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<WebhookProvider>("zapier");
  const [url, setUrl] = useState("");
  const [events, setEvents] =
    useState<WebhookSubscriptionEvent[]>(DEFAULT_EVENTS);
  const [latestSecret, setLatestSecret] = useState<string | null>(null);
  const [latestSecretLabel, setLatestSecretLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      null,
    [workspaces, activeWorkspaceId]
  );

  const canManage =
    activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";

  const loadWorkspaces = useCallback(async () => {
    const response = await fetch("/api/workspaces");
    if (!response.ok) {
      throw new Error("Couldn’t load workspaces");
    }

    const items = (await response.json()) as Workspace[];
    setWorkspaces(items);
    setActiveWorkspaceId((current) => {
      if (current && items.some((workspace) => workspace.id === current)) {
        return current;
      }

      const manageable = items.find(
        (workspace) =>
          workspace.role === "owner" || workspace.role === "admin"
      );
      return manageable?.id ?? items[0]?.id ?? "";
    });
  }, []);

  const loadWebhooks = useCallback(async (workspaceId: string) => {
    if (!workspaceId) {
      setWebhooks([]);
      return;
    }

    setLoadingWebhooks(true);
    try {
      const response = await fetch(
        "/api/settings/webhooks?workspaceId=" +
          encodeURIComponent(workspaceId)
      );

      if (response.status === 403) {
        setWebhooks([]);
        return;
      }

      if (!response.ok) {
        throw new Error("Couldn’t load webhooks");
      }

      const items = (await response.json()) as WebhookEndpoint[];
      setWebhooks(Array.isArray(items) ? items : []);
    } finally {
      setLoadingWebhooks(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    loadWorkspaces()
      .catch(() => {
        if (active) setError("Couldn’t load webhook settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadWorkspaces]);

  useEffect(() => {
    setLatestSecret(null);
    setMessage(null);
    setError(null);

    if (!activeWorkspaceId || !canManage) {
      setWebhooks([]);
      return;
    }

    loadWebhooks(activeWorkspaceId).catch(() =>
      setError("Couldn’t load webhooks.")
    );
  }, [activeWorkspaceId, canManage, loadWebhooks]);

  const toggleEvent = (eventName: WebhookSubscriptionEvent) => {
    setEvents((current) =>
      current.includes(eventName)
        ? current.filter((item) => item !== eventName)
        : [...current, eventName]
    );
  };

  const createWebhook = async () => {
    if (
      !activeWorkspace ||
      !canManage ||
      !name.trim() ||
      !url.trim() ||
      events.length === 0
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    setLatestSecret(null);

    try {
      const response = await fetch("/api/settings/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          name: name.trim(),
          provider,
          url: url.trim(),
          events,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Couldn’t add webhook"
        );
      }

      setLatestSecret(
        typeof body.signingSecret === "string" ? body.signingSecret : null
      );
      setLatestSecretLabel(name.trim());
      setName("");
      setUrl("");
      setEvents(DEFAULT_EVENTS);
      setMessage("Webhook added.");
      await loadWebhooks(activeWorkspace.id);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Couldn’t add webhook"
      );
    } finally {
      setSaving(false);
    }
  };

  const mutateWebhook = async (
    endpoint: WebhookEndpoint,
    action: () => Promise<Response>,
    successMessage: string
  ) => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await action();
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Request failed"
        );
      }

      setMessage(successMessage);
      if (activeWorkspaceId) {
        await loadWebhooks(activeWorkspaceId);
      }
      return body;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Request failed"
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const toggleWebhook = async (endpoint: WebhookEndpoint) => {
    await mutateWebhook(
      endpoint,
      () =>
        fetch("/api/settings/webhooks/" + endpoint.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !endpoint.enabled }),
        }),
      endpoint.enabled ? "Webhook disabled." : "Webhook enabled."
    );
  };

  const sendTest = async (endpoint: WebhookEndpoint) => {
    await mutateWebhook(
      endpoint,
      () =>
        fetch("/api/settings/webhooks/" + endpoint.id + "/test", {
          method: "POST",
        }),
      "Test delivery queued. Refresh shortly to see the result."
    );
  };

  const rotateSecret = async (endpoint: WebhookEndpoint) => {
    const body = await mutateWebhook(
      endpoint,
      () =>
        fetch("/api/settings/webhooks/" + endpoint.id + "/secret", {
          method: "POST",
        }),
      "Signing secret rotated."
    );

    if (body && typeof body.signingSecret === "string") {
      setLatestSecret(body.signingSecret);
      setLatestSecretLabel(endpoint.name);
    }
  };

  const removeWebhook = async (endpoint: WebhookEndpoint) => {
    if (
      !window.confirm(
        "Delete " + endpoint.name + "? Existing delivery history will also be removed."
      )
    ) {
      return;
    }

    await mutateWebhook(
      endpoint,
      () =>
        fetch("/api/settings/webhooks/" + endpoint.id, {
          method: "DELETE",
        }),
      "Webhook deleted."
    );
  };

  const copySecret = async () => {
    if (!latestSecret) return;

    try {
      await navigator.clipboard.writeText(latestSecret);
      setMessage("Signing secret copied.");
    } catch {
      setError("Couldn’t copy the signing secret.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7">
        <div className="flex items-center gap-2 text-xs text-accent mb-3">
          <Webhook className="w-4 h-4" />
          Automation
        </div>
        <h1 className="text-2xl font-[family-name:var(--font-heading)] italic mb-2">
          Webhooks
        </h1>
        <p className="text-sm text-muted max-w-2xl">
          Send signed DNA Studio events to Zapier, n8n, or another public HTTPS
          endpoint. Delivery retries run in the background and never block the
          primary campaign workflow.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>
      )}

      {latestSecret && (
        <Card className="p-5 mb-5 border-accent/30 bg-accent/5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold mb-1">
                Save this signing secret now
              </h2>
              <p className="text-xs text-muted mb-3">
                Secret for {latestSecretLabel}. DNA Studio will not show it
                again. Use it to verify the X-DNA-Studio-Signature header.
              </p>
              <code className="block rounded-md border border-border bg-background px-3 py-2 text-xs break-all">
                {latestSecret}
              </code>
            </div>
            <Button size="sm" variant="secondary" onClick={copySecret}>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs text-muted mb-1.5">
              Workspace
            </label>
            <select
              value={activeWorkspaceId}
              onChange={(event) => setActiveWorkspaceId(event.target.value)}
              aria-label="Webhook workspace"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} · {workspace.role}
                </option>
              ))}
            </select>
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => loadWebhooks(activeWorkspaceId)}
              disabled={loadingWebhooks}
              className="sm:mt-6"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          )}
        </div>
      </Card>

      {activeWorkspace && !canManage ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-1">
            Owner or admin access required
          </h2>
          <p className="text-xs text-muted">
            Webhook URLs can contain automation credentials, so only workspace
            owners and admins can view or manage them.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold">Add webhook</h2>
              <p className="text-xs text-muted mt-1">
                Paste the public HTTPS webhook URL supplied by Zapier, n8n, or
                your own endpoint.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Lead automation"
                  aria-label="Webhook name"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
                />
              </div>

              <div>
                <label className="block text-xs text-muted mb-1.5">
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={(event) =>
                    setProvider(event.target.value as WebhookProvider)
                  }
                  aria-label="Webhook provider"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted mt-1">
                  {PROVIDERS.find((item) => item.id === provider)?.hint}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs text-muted mb-1.5">
                Webhook URL
              </label>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://hooks.example.com/..."
                aria-label="Webhook URL"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
              />
            </div>

            <div className="mt-4">
              <p className="text-xs text-muted mb-2">Events</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((eventName) => (
                  <label
                    key={eventName}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={events.includes(eventName)}
                      onChange={() => toggleEvent(eventName)}
                    />
                    <span>{WEBHOOK_EVENT_LABELS[eventName]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={createWebhook}
                disabled={
                  saving ||
                  !name.trim() ||
                  !url.trim() ||
                  events.length === 0
                }
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Add Webhook
              </Button>
            </div>
          </Card>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Configured webhooks</h2>
              {loadingWebhooks && (
                <Loader2 className="w-4 h-4 text-muted animate-spin" />
              )}
            </div>

            {!loadingWebhooks && webhooks.length === 0 ? (
              <Card className="p-5 text-sm text-muted">
                No webhooks configured for this workspace.
              </Card>
            ) : (
              <div className="space-y-3">
                {webhooks.map((endpoint) => (
                  <WebhookCard
                    key={endpoint.id}
                    endpoint={endpoint}
                    saving={saving}
                    onToggle={() => toggleWebhook(endpoint)}
                    onTest={() => sendTest(endpoint)}
                    onRotate={() => rotateSecret(endpoint)}
                    onDelete={() => removeWebhook(endpoint)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WebhookCard({
  endpoint,
  saving,
  onToggle,
  onTest,
  onRotate,
  onDelete,
}: {
  endpoint: WebhookEndpoint;
  saving: boolean;
  onToggle: () => void;
  onTest: () => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold">{endpoint.name}</h3>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              {endpoint.provider}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] " +
                (endpoint.enabled
                  ? "bg-success/10 text-success"
                  : "bg-card-hover text-muted")
              }
            >
              {endpoint.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p className="text-xs text-muted break-all">{endpoint.url}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {endpoint.events.map((eventName) => (
              <span
                key={eventName}
                className="rounded-md bg-card-hover px-2 py-1 text-[10px] text-muted"
              >
                {WEBHOOK_EVENT_LABELS[eventName] ?? eventName}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onTest}
            disabled={saving || !endpoint.enabled}
          >
            <Send className="w-3.5 h-3.5" />
            Test
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onToggle}
            disabled={saving}
          >
            {endpoint.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRotate}
            disabled={saving}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Rotate Secret
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={onDelete}
            disabled={saving}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h4 className="text-xs font-medium mb-2">Recent deliveries</h4>
        {endpoint.deliveries.length === 0 ? (
          <p className="text-[11px] text-muted">No deliveries yet.</p>
        ) : (
          <div className="space-y-2">
            {endpoint.deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px]"
              >
                {delivery.status === "delivered" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                ) : delivery.status === "failed" ? (
                  <XCircle className="w-3.5 h-3.5 text-danger" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 text-muted" />
                )}
                <div className="min-w-0">
                  <span className="font-medium">{delivery.event}</span>
                  {delivery.error && (
                    <span className="text-danger ml-2">{delivery.error}</span>
                  )}
                </div>
                <span className="text-muted">
                  {delivery.responseStatus
                    ? "HTTP " + delivery.responseStatus
                    : delivery.attempts + " attempt" +
                      (delivery.attempts === 1 ? "" : "s")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
