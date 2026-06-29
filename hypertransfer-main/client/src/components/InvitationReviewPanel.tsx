/**
 * InvitationReviewPanel — 准入审批(Access Request, staff/casino-ops 用)。process v1 §A 第一步。
 *
 * RM 登录后台, 提交已获取的 patron 资料(Member ID/姓名/年龄/电话/护照/邮箱) → Submit access request;
 * Int'l Marketing 用外部系统核查后, 在本系统 Approve → 签发 single-use+72h 二维码+链接, 邮件发给客户。
 * 调后端 /api/invitations*; list 限 marketing/compliance/admin, create 限 rm, 审批/签发限 marketing。
 * 按 useAuth 角色显隐, 后端 require_role 才是真守卫。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus2, Check, X, LinkIcon, Send } from "lucide-react";
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

const EMPTY_FORM = { patronEmail: "", patronName: "", memberId: "", age: "", phone: "", passport: "" };

export default function InvitationReviewPanel() {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [issued, setIssued] = useState<Record<string, { link: string; qr: string }>>({});
  const [form, setForm] = useState({ ...EMPTY_FORM });
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
      setError(status === 403 ? "Your staff role cannot view the access-request queue (needs marketing / compliance)." : apiError(err));
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
      // RM 提交已获取的 patron 资料: 邮箱/姓名为顶层字段, 其余进 details(后端透传存储)。
      await invitationApi.create({
        patronEmail: form.patronEmail.trim(),
        patronName: form.patronName.trim() || undefined,
        details: {
          memberId: form.memberId.trim(),
          age: form.age.trim(),
          phone: form.phone.trim(),
          passport: form.passport.trim(),
        },
      });
      toast.success("Access request submitted for review");
      setForm({ ...EMPTY_FORM });
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
      setIssued({ ...issued, [id]: { link: data.inviteLink, qr: data.qrPngBase64 } });
      toast.success("QR + link issued (single-use, 72h) and emailed to patron");
      await load();
    } catch (err) {
      toast.error("Issue failed", { description: apiError(err) });
    } finally {
      setBusyId("");
    }
  };

  const inputCls = "rounded-lg border border-border/60 bg-background px-3 py-2 text-sm";

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm">
      <PanelHeader
        icon={UserPlus2}
        eyebrow="Access Requests — Live /api/invitations"
        title="RM submit patron → Int'l Marketing approve → issue QR + link (email to patron)"
        onRefresh={canList ? () => void load() : undefined}
        refreshing={loading}
      />
      <p className="mb-3 text-[11px] text-muted-foreground">Your roles: {(user?.roles ?? []).join(", ") || "—"}</p>

      {canCreate && (
        <div className="mb-4 rounded-lg border border-border/50 bg-secondary/20 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Relationship Manager — submit patron details (already collected)
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} placeholder="Member ID" className={inputCls} />
            <input value={form.patronName} onChange={(e) => setForm({ ...form, patronName: e.target.value })} placeholder="Full name" className={inputCls} />
            <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="Age" className={inputCls} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" className={inputCls} />
            <input value={form.passport} onChange={(e) => setForm({ ...form, passport: e.target.value })} placeholder="Passport number" className={inputCls} />
            <input value={form.patronEmail} onChange={(e) => setForm({ ...form, patronEmail: e.target.value })} placeholder="Email (required)" className={inputCls} />
          </div>
          <div className="mt-2">
            <ActionBtn icon={Send} tone="neutral" disabled={creating || !form.patronEmail.trim()} onClick={() => void createInvite()}>
              {creating ? "Submitting…" : "Submit access request"}
            </ActionBtn>
          </div>
        </div>
      )}

      {!canList && (
        <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
          Your role can submit access requests but not view the review queue (needs marketing / compliance).
        </p>
      )}
      {error && <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{error}</p>}
      {canList && !error && invitations.length === 0 && (
        <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
          {loading ? "Loading access requests…" : "No access requests yet."}
        </p>
      )}

      <div className="space-y-3">
        {invitations.map((inv) => {
          const busy = busyId === inv.id;
          const d = (inv.details ?? {}) as Record<string, unknown>;
          const show = issued[inv.id];
          return (
            <div key={inv.id} className="rounded-lg border border-border/50 bg-secondary/20 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{inv.patronName || inv.patronEmail}</span>
                <Pill tone={statusTone(inv.status)}>{inv.status}</Pill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <Field label="Member ID">{String(d.memberId || "—")}</Field>
                <Field label="Email">{inv.patronEmail}</Field>
                <Field label="Phone">{String(d.phone || "—")}</Field>
                <Field label="Passport">{String(d.passport || "—")}</Field>
                <Field label="Age">{String(d.age || "—")}</Field>
                <Field label="Expires">{inv.expiresAt ? new Date(inv.expiresAt * 1000).toLocaleString("en-US") : "—"}</Field>
                <Field label="Created">{new Date(inv.createdAt * 1000).toLocaleDateString("en-US")}</Field>
              </div>

              {show && (
                <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-success/30 bg-success/5 p-3">
                  <img src={show.qr} alt="invite QR" className="h-28 w-28 rounded-lg border border-border/50 bg-white p-1" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Single-use link (72h) · emailed to patron</p>
                    <p className="mt-1 flex items-start gap-1.5 break-all text-[11px] text-success">
                      <LinkIcon className="mt-0.5 h-3 w-3 shrink-0" />
                      {show.link}
                    </p>
                  </div>
                </div>
              )}

              {canReview && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {inv.status === "submitted" && (
                    <ActionBtn icon={Check} tone="success" disabled={busy}
                      onClick={() => void act(inv.id, () => invitationApi.approve(inv.id), "Access request approved")}>
                      Approve access request
                    </ActionBtn>
                  )}
                  {inv.status === "approved" && (
                    <ActionBtn icon={LinkIcon} tone="warning" disabled={busy} onClick={() => void issue(inv.id)}>
                      Issue QR + link (email)
                    </ActionBtn>
                  )}
                  {(inv.status === "submitted" || inv.status === "approved") && (
                    <ActionBtn icon={X} tone="danger" disabled={busy}
                      onClick={() => void act(inv.id, () => invitationApi.reject(inv.id), "Access request rejected")}>
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
