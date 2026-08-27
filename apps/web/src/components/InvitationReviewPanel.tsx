/**
 * InvitationReviewPanel — 准入审批(Access Request, staff/casino-ops 用)。process v1 §A 第一步。
 *
 * RM 登录后台, 提交已获取的 patron 资料(Member ID/姓名/邮箱) → Submit access request;
 * Int'l Marketing 用外部系统核查后, 在本系统 Approve → 签发 single-use+6h 二维码+链接, 邮件发给客户。
 * 调后端 /api/invitations*; list 限 marketing/compliance/admin, create 限 rm, 审批/签发限 marketing。
 * 按 useAuth 角色显隐, 后端 require_role 才是真守卫。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus2, Check, X, LinkIcon, Send, MailCheck, Copy, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { DEMO_AUTOFILL_EVENT, useDemoMode } from "@/contexts/DemoModeContext";
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

// 字段简化(2026-07 口径): 隐私 + 宿主拿不到敏感信息 → 只留 Member ID / First+Last name / Email。
const EMPTY_FORM = { patronEmail: "", firstName: "", lastName: "", memberId: "" };
const PAGE_SIZE = 5;

export default function InvitationReviewPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { isDemoMode, getDemoValue } = useDemoMode();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [issued, setIssued] = useState<Record<string, { link: string; qr: string }>>({});
  // demo: "查看 VIP 邮件"预览(内容与实发一致, 后端 /email-preview)
  const [emailPreview, setEmailPreview] = useState<Record<string, { to: string; subject: string; text: string; link: string }>>({});
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [rejectDraft, setRejectDraft] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const roles = useMemo(() => new Set(user?.roles ?? []), [user]);
  const isAdmin = roles.has("admin");
  const canCreate = isAdmin || roles.has("rm");
  const canReview = isAdmin || roles.has("marketing");
  const canList = isAdmin || roles.has("marketing") || roles.has("compliance");

  const applyDemoForm = useCallback(() => {
    setForm({
      memberId: getDemoValue("memberId"),
      firstName: getDemoValue("firstName"),
      lastName: getDemoValue("lastName"),
      patronEmail: getDemoValue("patronEmail"),
    });
  }, [getDemoValue]);

  useEffect(() => {
    if (isDemoMode) applyDemoForm();
    window.addEventListener(DEMO_AUTOFILL_EVENT, applyDemoForm);
    return () => window.removeEventListener(DEMO_AUTOFILL_EVENT, applyDemoForm);
  }, [applyDemoForm, isDemoMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const queueInvitations = useMemo(
    () =>
      canList && !isAdmin
        ? invitations.filter((i) => !["approved", "issued", "consumed"].includes(i.status))
        : invitations,
    [canList, invitations, isAdmin],
  );
  const pageCount = Math.max(1, Math.ceil(queueInvitations.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedInvitations = queueInvitations.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

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
      // 姓名拆 First/Last, 顶层 patronName 用 "First Last" 拼接(卡片/History 展示用)。
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
      await invitationApi.create({
        patronEmail: form.patronEmail.trim(),
        patronName: fullName || undefined,
        details: {
          memberId: form.memberId.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
        },
      });
      toast.success(t("invitationPanel.submittedToast"));
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (err) {
      toast.error(t("invitationPanel.submitFailed"), { description: apiError(err) });
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

  const resend = (id: string) => runIssue(id, () => invitationApi.resend(id), t("invitationPanel.emailResent"));
  const emailInvite = (id: string) => runIssue(id, () => invitationApi.email(id), t("invitationPanel.emailSent"));

  // demo: 查看该邀请实际发出的邮件内容(主题+正文, 含链接)。再点收起。
  const viewEmail = async (id: string) => {
    if (previewOpen[id]) {
      setPreviewOpen((prev) => ({ ...prev, [id]: false }));
      return;
    }
    if (!emailPreview[id]) {
      try {
        const { data } = await invitationApi.emailPreview(id);
        setEmailPreview((prev) => ({ ...prev, [id]: data }));
      } catch (err) {
        toast.error("Email preview failed", { description: apiError(err) });
        return;
      }
    }
    setPreviewOpen((prev) => ({ ...prev, [id]: true }));
  };
  // RM 把被拒申请直接重新提交(rejected → submitted)
  const resubmit = (id: string) => act(id, () => invitationApi.resubmit(id), t("invitationPanel.resubmittedToast"));
  // 把相对邀请链接补成绝对 URL(便于 RM 直接交给客户)
  const fullLink = (link: string) => (link.startsWith("/") ? window.location.origin + link : link);
  const copyLink = (link: string) => {
    void navigator.clipboard.writeText(fullLink(link));
    toast.success(t("invitationPanel.copyLink"));
  };

  const expiryInfo = (inv: Invitation) => {
    const expMs = (inv.expiresAt ?? 0) * 1000;
    const expired = expMs > 0 && expMs <= nowMs;
    const minsLeft = Math.max(0, Math.round((expMs - nowMs) / 60000));
    return {
      expired,
      label: expired
        ? t("invitationPanel.expired")
        : expMs > 0
          ? `Valid · ${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m left`
          : t("invitationPanel.noExpiry"),
    };
  };

  const renderDeliveryBox = (inv: Invitation, link: string, qr: string) => {
    const { expired, label } = expiryInfo(inv);
    const busy = busyId === inv.id;
    return (
      <div
        className={`mt-3 rounded-lg border p-3 transition-colors ${
          expired
            ? "border-border/50 bg-secondary/20 opacity-75"
            : "border-success/30 bg-success/5"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Single-use link (6h) · emailed to patron
          </p>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              expired
                ? "border-border/60 bg-background/40 text-muted-foreground"
                : "border-success/40 bg-success/10 text-success"
            }`}
          >
            {label}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <img
            src={qr}
            alt="invite QR"
            className={`h-28 w-28 rounded-lg border border-border/50 bg-white p-1 ${expired ? "grayscale opacity-40" : ""}`}
          />
          <div className="min-w-0 flex-1">
            <p className={`flex items-start gap-1.5 break-all text-[11px] ${expired ? "text-muted-foreground" : "text-success"}`}>
              <LinkIcon className="mt-0.5 h-3 w-3 shrink-0" />
              {fullLink(link)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => copyLink(link)}
                disabled={expired}
                className="flex items-center gap-1 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/10 disabled:border-border/50 disabled:text-muted-foreground disabled:opacity-50"
              >
                <Copy className="h-3 w-3" /> Copy link
              </button>
              <button
                onClick={() => void emailInvite(inv.id)}
                disabled={expired || busy}
                className="flex items-center gap-1 rounded-lg border border-success/40 px-2.5 py-1.5 text-[11px] font-semibold text-success transition-colors hover:bg-success/10 disabled:border-border/50 disabled:text-muted-foreground disabled:opacity-50"
              >
                <MailCheck className="h-3 w-3" /> Email customer
              </button>
              <button
                onClick={() => void viewEmail(inv.id)}
                disabled={expired}
                className="flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-50"
              >
                <Eye className="h-3 w-3" /> {previewOpen[inv.id] ? "Hide VIP email" : "View VIP email"}
              </button>
              {expired && (
                <button
                  onClick={() => void resend(inv.id)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg border border-gold/40 px-2.5 py-1.5 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/10 disabled:opacity-50"
                >
                  <Send className="h-3 w-3" /> Send new 6h link
                </button>
              )}
            </div>
          </div>
        </div>

        {/* demo: VIP 收到的邮件预览(与实发一致) */}
        {(() => {
          const pv = emailPreview[inv.id];
          if (!previewOpen[inv.id] || !pv) return null;
          return (
            <div className="mt-3 space-y-2 rounded-lg border border-border/50 bg-background/60 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  VIP email preview · sent to {pv.to}
                </p>
                <MailCheck className="h-3.5 w-3.5 text-gold" />
              </div>
              <p className="text-xs font-semibold text-foreground">{pv.subject}</p>
              <pre className="whitespace-pre-wrap break-all rounded-md bg-secondary/20 p-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {pv.text}
              </pre>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm">
      <PanelHeader
        icon={UserPlus2}
        eyebrow={t("invitationPanel.title")}
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
            <LabeledInput name="memberId" label="Member ID" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} placeholder="e.g. VIP-1234" />
            <LabeledInput name="firstName" label="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="As shown on ID" />
            <LabeledInput name="lastName" label="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="As shown on ID" />
            <LabeledInput name="patronEmail" label="Email (required)" type="email" value={form.patronEmail} onChange={(e) => setForm({ ...form, patronEmail: e.target.value })} placeholder="name@example.com" />
          </div>
          <div className="mt-2">
            <ActionBtn icon={Send} tone="neutral" disabled={creating || !form.patronEmail.trim()} onClick={() => void createInvite()}>
              {creating ? t("opsUi.loading") : t("invitationPanel.submit")}
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
          {loading ? t("opsUi.loading") : canList ? t("invitationPanel.empty") : t("invitationPanel.myEmpty")}
        </p>
      )}

      <div className="space-y-3">
        {/* 审批页(Marketing): 批准后(approved/issued/consumed)不再显示 —— 已转到 RM 页交付。
            admin 看全量便于总览; RM 用 mine() 看自己全部(含 issued 的交付链接)。 */}
        {pagedInvitations.map((inv) => {
          const busy = busyId === inv.id;
          const d = (inv.details ?? {}) as Record<string, unknown>;
          const show = issued[inv.id];
          return (
            <div key={inv.id} className="rounded-lg border border-border/50 bg-secondary/20 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{inv.patronName || inv.patronEmail}</span>
                <Pill tone={statusTone(inv.status)}>{displayStatus(inv.status)}</Pill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Member ID">{String(d.memberId || "—")}</Field>
                <Field label="Email">{inv.patronEmail}</Field>
                <Field label="Expires">{inv.expiresAt ? new Date(inv.expiresAt * 1000).toLocaleString("en-US") : "—"}</Field>
                <Field label="Created">{new Date(inv.createdAt * 1000).toLocaleString("en-US")}</Field>
              </div>

              {show && renderDeliveryBox(inv, show.link, show.qr)}

              {/* issued: 可交付给客户的邀请链接 + 二维码 + 时效状态(RM 页持久展示)。避免与刚签发的 transient QR 块重复。 */}
              {!show && inv.status === "issued" && inv.inviteLink && inv.qrPngBase64
                ? renderDeliveryBox(inv, inv.inviteLink, inv.qrPngBase64)
                : null}

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
                      onClick={() => void runIssue(inv.id, () => invitationApi.approve(inv.id), t("invitationPanel.approve"))}>
                      Approve access request
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
                          onClick={() => void act(inv.id, () => invitationApi.reject(inv.id, (rejectDraft[inv.id] ?? "").trim()), t("invitationPanel.rejectedToast"))}>
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

      {queueInvitations.length > PAGE_SIZE && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
          <p className="text-[11px] text-muted-foreground">
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, queueInvitations.length)} of {queueInvitations.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
              className="flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-gold/30 hover:text-gold disabled:opacity-40"
            >
              <ChevronLeft className="h-3 w-3" /> Prev
            </button>
            <span className="rounded-lg border border-border/50 bg-secondary/20 px-2.5 py-1.5 text-[11px] font-semibold text-foreground">
              Page {safePage} / {pageCount}
            </span>
            <button
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              disabled={safePage >= pageCount}
              className="flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-gold/30 hover:text-gold disabled:opacity-40"
            >
              Next <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
