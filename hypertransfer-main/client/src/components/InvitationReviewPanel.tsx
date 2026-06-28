/**
 * InvitationReviewPanel — 邀请制审核(staff/casino-ops 用)。
 *
 * RM 提交(create) → Marketing 审核(approve/reject) → Marketing 签发 single-use+72h link(issue)。
 * 调后端 /api/invitations*; list 限 marketing/compliance/admin, create 限 rm, 审批/签发限 marketing。
 * 按 useAuth 角色显隐, 后端 require_role 才是真守卫。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { MailPlus, Check, X, LinkIcon, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { apiError, invitationApi, type Invitation } from "@/lib/api";
import { ActionBtn, Field, PanelHeader, Pill, type Tone } from "@/components/ops-ui";

function statusTone(s: string): Tone {
  if (s === "issued" || s === "consumed") return "success";
  if (s === "rejected" || s === "expired" || s === "revoked") return "danger";
  if (s === "approved") return "warning";
  return "neutral";
}

export default function InvitationReviewPanel() {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ patronEmail: "", patronName: "" });
  const [creating, setCreating] = useState(false);

  const roles = useMemo(() => new Set(user?.roles ?? []), [user]);
  const isAdmin = roles.has("admin");
  const canCreate = isAdmin || roles.has("rm");
  const canReview = isAdmin || roles.has("marketing");
  const canList = isAdmin || roles.has("marketing") || roles.has("compliance");

  const load = useCallback(async () => {
    if (!canList) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await invitationApi.list();
      setInvitations(data.invitations ?? []);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 403 ? "Your staff role cannot view the invitation queue (needs marketing / compliance)." : apiError(err));
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, [canList]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(okMsg);
      await load();
    } catch (err) {
      toast.error("Action failed", { description: apiError(err) });
    } finally {
      setBusyId("");
    }
  };

  const createInvite = async () => {
    if (!form.patronEmail.trim()) return;
    setCreating(true);
    try {
      await invitationApi.create({ patronEmail: form.patronEmail.trim(), patronName: form.patronName.trim() || undefined });
      toast.success("Invitation submitted for review");
      setForm({ patronEmail: "", patronName: "" });
      await load();
    } catch (err) {
      toast.error("Submit failed", { description: apiError(err) });
    } finally {
      setCreating(false);
    }
  };

  const issue = async (id: string) => {
    setBusyId(id);
    try {
      const { data } = await invitationApi.issue(id);
      setLinks({ ...links, [id]: data.inviteLink });
      toast.success("Invite link issued (single-use, 72h)");
      await load();
    } catch (err) {
      toast.error("Issue failed", { description: apiError(err) });
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm">
      <PanelHeader
        icon={MailPlus}
        eyebrow="Invitations — Live /api/invitations"
        title="RM submit → Marketing approve → issue single-use link"
        onRefresh={canList ? () => void load() : undefined}
        refreshing={loading}
      />
      <p className="mb-3 text-[11px] text-muted-foreground">Your roles: {(user?.roles ?? []).join(", ") || "—"}</p>

      {canCreate && (
        <div className="mb-4 rounded-lg border border-border/50 bg-secondary/20 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">RM — submit patron</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={form.patronEmail}
              onChange={(e) => setForm({ ...form, patronEmail: e.target.value })}
              placeholder="patron email"
              className="min-w-[200px] flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
            <input
              value={form.patronName}
              onChange={(e) => setForm({ ...form, patronName: e.target.value })}
              placeholder="patron name (optional)"
              className="min-w-[160px] flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
            <ActionBtn icon={Send} tone="neutral" disabled={creating || !form.patronEmail.trim()} onClick={() => void createInvite()}>
              {creating ? "Submitting…" : "Submit"}
            </ActionBtn>
          </div>
        </div>
      )}

      {!canList && (
        <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
          Your role can submit invitations but not view the review queue (needs marketing / compliance).
        </p>
      )}
      {error && <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{error}</p>}
      {canList && !error && invitations.length === 0 && (
        <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
          {loading ? "Loading invitations…" : "No invitations yet."}
        </p>
      )}

      <div className="space-y-3">
        {invitations.map((inv) => {
          const busy = busyId === inv.id;
          return (
            <div key={inv.id} className="rounded-lg border border-border/50 bg-secondary/20 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{inv.patronEmail}</span>
                <Pill tone={statusTone(inv.status)}>{inv.status}</Pill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Field label="Patron name">{inv.patronName || "—"}</Field>
                <Field label="Expires">{inv.expiresAt ? new Date(inv.expiresAt * 1000).toLocaleString("en-US") : "—"}</Field>
                <Field label="Created">{new Date(inv.createdAt * 1000).toLocaleDateString("en-US")}</Field>
              </div>

              {links[inv.id] && (
                <p className="mt-2 flex items-start gap-1.5 break-all rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-success">
                  <LinkIcon className="mt-0.5 h-3 w-3 shrink-0" />
                  {links[inv.id]}
                </p>
              )}

              {canReview && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {inv.status === "submitted" && (
                    <ActionBtn icon={Check} tone="success" disabled={busy}
                      onClick={() => void act(inv.id, () => invitationApi.approve(inv.id), "Invitation approved")}>
                      Approve
                    </ActionBtn>
                  )}
                  {inv.status === "approved" && (
                    <ActionBtn icon={LinkIcon} tone="warning" disabled={busy} onClick={() => void issue(inv.id)}>
                      Issue link
                    </ActionBtn>
                  )}
                  {(inv.status === "submitted" || inv.status === "approved") && (
                    <ActionBtn icon={X} tone="danger" disabled={busy}
                      onClick={() => void act(inv.id, () => invitationApi.reject(inv.id), "Invitation rejected")}>
                      Reject
                    </ActionBtn>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
