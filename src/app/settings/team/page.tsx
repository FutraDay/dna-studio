"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  Plus,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface WorkspaceMember {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface Workspace {
  id: string;
  name: string;
  role: string;
  isOwner: boolean;
  brandCount: number;
  members: WorkspaceMember[];
}

export default function TeamSettingsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"member" | "admin">("member");
  const [renameValue, setRenameValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      return items[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    let active = true;

    loadWorkspaces()
      .catch(() => {
        if (active) setError("Couldn’t load team workspaces.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadWorkspaces]);

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      null,
    [workspaces, activeWorkspaceId]
  );

  useEffect(() => {
    if (activeWorkspace) {
      setRenameValue(activeWorkspace.name);
    }
  }, [activeWorkspace]);

  const canManage =
    activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";

  const runMutation = async (
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

      await loadWorkspaces();
      setMessage(successMessage);
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Request failed"
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const createWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    const created = await runMutation(
      () =>
        fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newWorkspaceName.trim() }),
        }),
      "Workspace created."
    );

    if (created) setNewWorkspaceName("");
  };

  const renameWorkspace = async () => {
    if (!activeWorkspace || !renameValue.trim()) return;

    await runMutation(
      () =>
        fetch(`/api/workspaces/${activeWorkspace.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: renameValue.trim() }),
        }),
      "Workspace renamed."
    );
  };

  const addMember = async () => {
    if (!activeWorkspace || !memberEmail.trim()) return;

    const added = await runMutation(
      () =>
        fetch(`/api/workspaces/${activeWorkspace.id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: memberEmail.trim(),
            role: memberRole,
          }),
        }),
      "Team member added."
    );

    if (added) setMemberEmail("");
  };

  const removeMember = async (member: WorkspaceMember) => {
    if (!activeWorkspace) return;

    await runMutation(
      () =>
        fetch(`/api/workspaces/${activeWorkspace.id}/members`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId: member.id }),
        }),
      "Team member removed."
    );
  };

  return (
    <div>
      <div className="mb-7">
        <div className="flex items-center gap-2 text-xs text-accent mb-3">
          <Users className="w-4 h-4" />
          Collaboration
        </div>
        <h1 className="text-2xl font-[family-name:var(--font-heading)] italic mb-2">
          Team workspaces
        </h1>
        <p className="text-sm text-muted max-w-2xl">
          Share brands and campaigns with registered DNA Studio users. Social
          connections stay personal, so publishing uses the account connected
          by the member who publishes or schedules the post.
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

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-sm font-semibold mb-3">Workspaces</h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={activeWorkspaceId}
                onChange={(event) => setActiveWorkspaceId(event.target.value)}
                aria-label="Select workspace"
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} · {workspace.role}
                  </option>
                ))}
              </select>

              <input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="New workspace name"
                aria-label="New workspace name"
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
              />
              <Button
                size="sm"
                onClick={createWorkspace}
                disabled={!newWorkspaceName.trim() || saving}
              >
                <Plus className="w-3.5 h-3.5" />
                Create
              </Button>
            </div>
          </Card>

          {activeWorkspace && (
            <>
              <Card className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold">
                      Workspace details
                    </h2>
                    <p className="text-xs text-muted mt-1">
                      {activeWorkspace.brandCount} shared brand
                      {activeWorkspace.brandCount === 1 ? "" : "s"} · Your role:{" "}
                      {activeWorkspace.role}
                    </p>
                  </div>
                  {activeWorkspace.isOwner && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-accent">
                      <Shield className="w-3.5 h-3.5" />
                      Owner
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    disabled={!canManage}
                    aria-label="Workspace name"
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-60"
                  />
                  {canManage && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={renameWorkspace}
                      disabled={
                        saving ||
                        !renameValue.trim() ||
                        renameValue.trim() === activeWorkspace.name
                      }
                    >
                      <Check className="w-3.5 h-3.5" />
                      Save
                    </Button>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold">Members</h2>
                  <p className="text-xs text-muted mt-1">
                    Members can work on shared brands and campaigns. Admins can
                    also manage the workspace and its team.
                  </p>
                </div>

                {canManage && (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_auto] gap-2 mb-5">
                    <input
                      type="email"
                      value={memberEmail}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      placeholder="teammate@example.com"
                      aria-label="Team member email"
                      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
                    />
                    <select
                      value={memberRole}
                      onChange={(event) =>
                        setMemberRole(
                          event.target.value as "member" | "admin"
                        )
                      }
                      aria-label="Team member role"
                      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      size="sm"
                      onClick={addMember}
                      disabled={!memberEmail.trim() || saving}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </Button>
                  </div>
                )}

                <div className="divide-y divide-border">
                  {activeWorkspace.members.map((member) => {
                    const isOwner = member.role === "owner";
                    const canRemove =
                      canManage &&
                      !isOwner &&
                      !(
                        activeWorkspace.role === "admin" &&
                        member.role === "admin"
                      );

                    return (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 py-3"
                      >
                        <div className="w-9 h-9 rounded-full bg-card-hover flex items-center justify-center text-xs font-semibold">
                          {(member.user.name || member.user.email)
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {member.user.name || member.user.email}
                          </p>
                          <p className="text-[11px] text-muted truncate">
                            {member.user.email}
                          </p>
                        </div>
                        <span className="text-[11px] capitalize text-muted">
                          {member.role}
                        </span>
                        {canRemove && (
                          <button
                            type="button"
                            aria-label={`Remove ${member.user.email}`}
                            onClick={() => removeMember(member)}
                            disabled={saving}
                            className="p-2 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
