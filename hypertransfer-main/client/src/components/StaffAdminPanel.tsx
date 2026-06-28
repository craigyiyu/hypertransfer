/**
 * StaffAdminPanel — 员工账号管理(admin 限定, casino-ops 用)。
 *
 * 调后端 POST /api/admin/staff(require_role admin): 建 staff 账号 + 分配角色, 返回 TOTP 绑定
 * (otpauth/secret/qr)。新员工 status=pending_totp, 需用 confirm-totp(email) 激活后方可登录。
 * 无 list 端点 → 仅"创建 + 展示本次结果"。按 useAuth 角色显隐, 后端 require_role 才是真守卫。
 */
import { useMemo, useState } from "react";
import { UserCog, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { adminApi, apiError } from "@/lib/api";
import { ActionBtn, Pill } from "@/components/ops-ui";

const ASSIGNABLE_ROLES = ["rm", "marketing", "compliance", "ops", "custodian", "admin"] as const;

interface CreatedStaff {
  userId: string;
  email: string;
  roles: string[];
  secret: string;
  qr_png_base64: string;
  expires_in: number;
}

export default function StaffAdminPanel() {
  const { user } = useAuth();
  const isAdmin = useMemo(() => (user?.roles ?? []).includes("admin"), [user]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [roles, setRoles] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedStaff | null>(null);

  const toggleRole = (r: string) => {
    const next = new Set(roles);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    setRoles(next);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password || roles.size === 0) {
      toast.error("Name, email, password and at least one role are required.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await adminApi.createStaff({
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password,
        roles: Array.from(roles),
      });
      setCreated({
        userId: data.userId,
        email: data.email,
        roles: data.roles,
        secret: data.secret,
        qr_png_base64: data.qr_png_base64,
        expires_in: data.expires_in,
      });
      toast.success("Staff account created", { description: `${data.email} · ${data.roles.join(", ")}` });
      setForm({ name: "", email: "", password: "" });
      setRoles(new Set());
    } catch (err) {
      toast.error("Create failed", { description: apiError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
          <UserCog className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Staff Admin — Live /api/admin/staff</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">Provision staff accounts &amp; roles (admin only)</h2>
        </div>
      </div>

      {!isAdmin ? (
        <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
          Staff provisioning requires the <span className="font-semibold text-foreground">admin</span> role. Your roles:{" "}
          {(user?.roles ?? []).join(", ") || "—"}.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email"
              className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Temp password"
              className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ASSIGNABLE_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRole(r)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  roles.has(r) ? "border-gold/70 bg-gold/10 text-gold" : "border-border/60 text-muted-foreground hover:border-gold/30"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <ActionBtn icon={UserPlus} tone="success" disabled={busy} onClick={() => void submit()}>
            {busy ? "Creating…" : "Create staff account"}
          </ActionBtn>

          {created && (
            <div className="rounded-lg border border-success/30 bg-success/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{created.email}</span>
                {created.roles.map((r) => (
                  <Pill key={r} tone="neutral">{r}</Pill>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Account is <span className="font-semibold text-warning">pending 2FA</span>. The new staff must scan this QR
                and confirm the TOTP code (via email) within {Math.round(created.expires_in / 60)} min to activate.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <img src={created.qr_png_base64} alt="TOTP QR" className="h-32 w-32 rounded-lg border border-border/50 bg-white p-1" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Secret (manual entry)</p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground">{created.secret}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
