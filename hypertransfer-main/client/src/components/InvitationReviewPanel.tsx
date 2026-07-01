/**
 * InvitationReviewPanel — 准入审批(Access Request, staff/casino-ops 用)。process v1 §A 第一步。
 *
 * RM 登录后台, 提交已获取的 patron 资料(Member ID/姓名/年龄/电话/护照/邮箱) → Submit access request;
 * Int'l Marketing 用外部系统核查后, 在本系统 Approve → 签发 single-use+72h 二维码+链接, 邮件发给客户。
 * 调后端 /api/invitations*; list 限 marketing/compliance/admin, create 限 rm, 审批/签发限 marketing。
 * 按 useAuth 角色显隐, 后端 require_role 才是真守卫。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus2, Check, X, LinkIcon, Send, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { apiError, invitationApi, type Invitation } from "@/lib/api";
import { ActionBtn, Field, LabeledInput, PanelHeader, Pill, type Tone } from "@/components/ops-ui";

// 对外审批状态只剩三种(决策): submitted / approved / rejected。
// 底层 issued/consumed 是审批后签发的 token 机制(保证邀请链接可注册), 一律显示为 "approved"。
function displayStatus(s: string): "submitted" | "approved" | "rejected" {
  if (s === "rejected" || s === "revoked") return "rejected";
  if (s === "submitted" || s === "pending") return "submitted";
  return "approved"; // approved / issued / consumed / expired
}

function statusTone(s: string): Tone {
  const d = displayStatus(s);
  return d === "approved" ? "success" : d === "rejected" ? "danger" : "warning";
}

const EMPTY_FORM = { patronEmail: "", patronName: "", memberId: "", age: "", phone: "", passport: "" };

export default function InvitationReviewPanel() {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [issued, setIssued] = useState<Record<string, { link: string; qr: string }>>({});
  const [rejectDraft, setRejectDraft] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);

  const roles = useMemo(() => new Set(user?.roles ?? []), [user]);
  const isAdmin = roles.has("admin");
  const canCreate = isAdmin || roles.has("rm");
  const canReview = isAdmin || roles.has("marketing");
  const canList = isAdmin || roles.has("marketing") || roles.has("compliance");

  const load = useCallback(async () => {
    if (!canList && !canCreate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      // marketing/compliance/admin → 全审批队列; RM(仅 canCreate) → 只看自己提交的(看审批进度)
      const { data } = canList ? await invitationApi.list() : await invitationApi.mine();
      setInvitations(data.invitations ?? []);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 403 ? "Your staff role cannot view the access-request queue (needs marketing / compliance)." : apiError(err));
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, [canList, canCreate]);

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

  // 邮件投递渠道如实反馈(后端 send_email 返回 smtp/smtp_failed/console)
  const channelDesc = (d: { emailChannel?: string; emailTo?: string }) => {
    if (d.emailChannel === "smtp") return `Email sent to ${d.emailTo}`;
    if (d.emailChannel === "smtp_failed") return "SMTP send failed — invite printed to server console. Check SMTP config.";
    return "SMTP not configured — invite printed to server console.";
  };

  // issue 与 resend 共用: 调用 → 展示新 QR/链接 → 按投递渠道 toast。
  const runIssue = async (
    id: string,
    fn: () => Promise<{ data: { inviteLink: string; qrPngBase64: string; emailChannel?: string; emailTo?: string } }>,
    okTitle: string,
  ) => {
    setBusyId(id);
    try {
      const { data } = await fn();
      setIssued((prev) => ({ ...prev, [id]: { link: data.inviteLink, qr: data.qrPngBase64 } }));
      toast.success(okTitle, { description: channelDesc(data) });
      await load();
    } catch (err) {
      toast.error(`${okTitle} failed`, { description: apiError(err) });
    } finally {
      setBusyId("");
    }
  };

  const resend = (id: string) => runIssue(id, () => invitationApi.resend(id), "Invite email resent (new 72h link)");
  // RM 把被拒申请直接重新提交(rejected → submitted)
  const resubmit = (id: string) => act(id, () => invitationApi.resubmit(id), "Resubmitted for review");
  // 把相对邀请链接补成绝对 URL(便于 RM 直接交给客户)
  const fullLink = (link: string) => (link.startsWith("/") ? window.location.origin + link : link);
  const copyLink = (link: string) => {
    void navigator.clipboard.writeText(fullLink(link));
    toast.success("Invite link copied — send it to the customer");
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm">
      <PanelHeader
        icon={UserPlus2}
        eyebrow="Access Requests — Live /api/invitations"
        title="RM submit patron → Int'l Marketing approve → issue QR + link (email to patron)"
        onRefresh={canList || canCreate ? () => void load() : undefined}
        refreshing={loading}
      />
      <p className="mb-3 text-[11px] text-muted-foreground">Your roles: {(user?.roles ?? []).join(", ") || "—"}</p>

      {canCreate && (
        <div className="mb-4 rounded-lg border border-border/50 bg-secondary/20 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Relationship Manager — submit patron details (already collected)
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <LabeledInput label="Member ID" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} placeholder="e.g. VIP-1234" />
            <LabeledInput label="Full name" value={form.patronName} onChange={(e) => setForm({ ...form, patronName: e.target.value })} placeholder="As shown on ID" />
            <LabeledInput label="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="e.g. 35" />
            <LabeledInput label="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+852 …" />
            <LabeledInput label="Passport number" value={form.passport} onChange={(e) => setForm({ ...form, passport: e.target.value })} placeholder="Passport no." />
            <LabeledInput label="Email (required)" type="email" value={form.patronEmail} onChange={(e) => setForm({ ...form, patronEmail: e.target.value })} placeholder="name@example.com" />
          </div>
          <div className="mt-2">
            <ActionBtn icon={Send} tone="neutral" disabled={creating || !form.patronEmail.trim()} onClick={() => void createInvite()}>
              {creating ? "Submitting…" : "Submit access request"}
            </ActionBtn>
          </div>
        </div>
      )}

      {/* RM(仅提交者) 看到的是自己提交的申请 + 审批进度; marketing/compliance 看全队列 */}
      {!canList && canCreate && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Your submitted access requests — approval status
        </p>
      )}
      {error && <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{error}</p>}
      {(canList || canCreate) && !error && invitations.length === 0 && (
        <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
          {loading ? "Loading…" : canList ? "No access requests yet." : "You haven't submitted any access requests yet."}
        </p>
      )}

      <div className="space-y-3">
        {/* 审批页(Marketing): 批准后(approved/issued/consumed)不再显示 —— 已转到 RM 页交付。
            admin 看全量便于总览; RM 用 mine() 看自己全部(含 issued 的交付链接)。 */}
        {(canList && !isAdmin
          ? invitations.filter((i) => !["approved", "issued", "consumed"].includes(i.status))
          : invitations
        ).map((inv) => {
          const busy = busyId === inv.id;
          const d = (inv.details ?? {}) as Record<string, unknown>;
          const show = issued[inv.id];
          return (
            <div key={inv.id} className="rounded-lg border border-border/50 bg-secondary/20 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{inv.patronName || inv.patronEmail}</span>
                <Pill tone={statusTone(inv.status)}>{displayStatus(inv.status)}</Pill>
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

              {/* issued: 可交付给客户的邀请链接(RM 页持久展示 + 复制)。避免与刚签发的 transient QR 块重复。 */}
              {!show && inv.status === "issued" && inv.inviteLink ? (
                <div className="mt-3 rounded-lg border border-gold/30 bg-gold/5 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Invite link · give this to the customer (single-use · 72h)
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-gold">{fullLink(inv.inviteLink)}</code>
                    <button
                      onClick={() => copyLink(inv.inviteLink!)}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/10"
                    >
                      <LinkIcon className="h-3 w-3" /> Copy
                    </button>
                  </div>
                </div>
              ) : null}

              {/* 拒绝原因(所有能看到此卡的人可见) */}
              {inv.status === "rejected" && d.rejectReason ? (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-destructive">Reject reason</p>
                  <p className="mt-0.5 text-xs text-foreground">{String(d.rejectReason)}</p>
                </div>
              ) : null}

              {canReview && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  {inv.status === "submitted" && (
                    <ActionBtn icon={Check} tone="success" disabled={busy}
                      onClick={() => void runIssue(inv.id, () => invitationApi.approve(inv.id), "Approved — invite QR + link issued & emailed")}>
                      Approve access request
                    </ActionBtn>
                  )}
                  {inv.status === "issued" && (
                    <ActionBtn icon={MailCheck} tone="neutral" disabled={busy} onClick={() => void resend(inv.id)}>
                      Resend invite email
                    </ActionBtn>
                  )}
                  {(inv.status === "submitted" || inv.status === "approved") && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Reject reason (required)</span>
                      <div className="flex items-center gap-2">
                        <input
                          value={rejectDraft[inv.id] ?? ""}
                          onChange={(e) => setRejectDraft({ ...rejectDraft, [inv.id]: e.target.value })}
                          placeholder="Why is this rejected?"
                          className="w-56 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
                        />
                        <ActionBtn icon={X} tone="danger" disabled={busy || !(rejectDraft[inv.id] ?? "").trim()}
                          onClick={() => void act(inv.id, () => invitationApi.reject(inv.id, (rejectDraft[inv.id] ?? "").trim()), "Access request rejected")}>
                          Reject
                        </ActionBtn>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* RM(提交者) 可把被拒申请直接重新提交 */}
              {canCreate && inv.status === "rejected" && (
                <div className="mt-3">
                  <ActionBtn icon={Send} tone="neutral" disabled={busy} onClick={() => void resubmit(inv.id)}>
                    Resubmit for review
                  </ActionBtn>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
