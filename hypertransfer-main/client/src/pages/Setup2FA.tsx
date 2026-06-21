/**
 * Setup2FA — 第二因子绑定:展示后端签发的真实 TOTP 二维码 + 密钥。
 *
 * 设计要点(对齐主流最佳实践):
 *  - TOTP 二维码本身是静态的(secret 长期不变),**不**每 30 秒刷新。
 *  - 真正有时限的是"绑定会话":后端给 pending 注册 10 分钟 TTL。
 *    页面显示倒计时;归零 -> 灰掉二维码 + 一键「重新生成」(免短信,手机号已验真)。
 *  - 金色密钥串是二维码的手动输入备选(同机无法扫自己屏幕时用),按 4 位分组展示。
 *  - 列出兼容的验证器 App,提示用户可任选其一。
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import Shell from "@/components/Shell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Smartphone, Copy, Check, Loader2, Clock, RefreshCw, KeyRound } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { authApi, apiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { readPendingRegister, PendingRegister, PENDING_REGISTER_KEY } from "@/lib/authFlow";

// 兼容的验证器 App。生产环境如需用各家官方 Logo,须遵守对应品牌使用规范;
// 这里用统一风格的字母徽标做"兼容性提示",属合理指代,且不打包第三方版权图标。
const AUTHENTICATORS = [
  { name: "Google", mark: "G", color: "#4285F4" },
  { name: "Microsoft", mark: "M", color: "#00A4EF" },
  { name: "Authy", mark: "A", color: "#EC1C24" },
  { name: "1Password", mark: "1", color: "#3B66BC" },
  { name: "Apple", mark: "", color: "#A2AAAD" },
];

function fmtSecret(secret: string) {
  return (secret.match(/.{1,4}/g) || [secret]).join(" ");
}
function fmtClock(sec: number) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Setup2FA() {
  const [, navigate] = useLocation();
  const { setSession } = useAuth();
  const [pending, setPending] = useState<PendingRegister | null>(() => readPendingRegister());
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [remaining, setRemaining] = useState(0); // 绑定会话剩余秒数
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // 没有待绑定的注册态 -> 回注册页
  useEffect(() => {
    if (!pending) navigate("/register");
  }, [pending, navigate]);

  // 倒计时:每秒根据 expiresAt 重算(切后台再回来也准)
  useEffect(() => {
    if (!pending) return;
    const update = () => setRemaining(Math.max(0, pending.expiresAt - Math.floor(Date.now() / 1000)));
    update();
    tickRef.current = setInterval(update, 1000);
    return () => clearInterval(tickRef.current);
  }, [pending]);

  const expired = remaining <= 0;
  const formattedSecret = useMemo(() => (pending ? fmtSecret(pending.secret) : ""), [pending]);

  if (!pending) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(pending.secret);
    setCopied(true);
    toast.success("Secret key copied.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const { data } = await authApi.regenerateTotp(pending.areaCode, pending.phoneNumber);
      const next: PendingRegister = {
        ...pending,
        qr: data.qr_png_base64,
        secret: data.secret,
        otpauth: data.otpauth_uri,
        expiresAt: data.expires_at,
      };
      sessionStorage.setItem(PENDING_REGISTER_KEY, JSON.stringify(next));
      setPending(next);
      setCode("");
      toast.success("New QR code generated. Please scan it again.");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setRegenerating(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6 || verifying || expired) return;
    setVerifying(true);
    try {
      const { data } = await authApi.confirmTotp(pending.areaCode, pending.phoneNumber, code);
      setSession(data.token, data.user);
      sessionStorage.removeItem(PENDING_REGISTER_KEY);
      toast.success("Two-factor authentication enabled.");
      navigate("/kyc");
    } catch (e) {
      toast.error(apiError(e));
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Shell showBack backTo="/register" title="Two-Factor Authentication" subtitle="Secure your account with an authenticator app">
      <div className="space-y-5">
        {/* 绑定会话倒计时 */}
        <div className={`flex items-center justify-center gap-2 text-xs rounded-lg py-2 px-3
          ${expired ? "bg-destructive/10 text-destructive" : remaining <= 60 ? "bg-warning/10 text-warning" : "bg-secondary/40 text-muted-foreground"}`}>
          <Clock className="w-3.5 h-3.5" />
          {expired ? "Setup session expired. Generate a new QR code." : <>Complete setup within <span className="font-mono font-semibold tabular-nums">{fmtClock(remaining)}</span></>}
        </div>

        {/* 二维码卡片 */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card-gold rounded-xl p-6 flex flex-col items-center">
          <div className="relative w-44 h-44 bg-white rounded-xl p-3 mb-4">
            <img src={pending.qr} alt="TOTP QR" className={`w-full h-full object-contain transition-all ${expired ? "blur-sm opacity-40" : ""}`} />
            {expired && (
              <button onClick={handleRegenerate} disabled={regenerating}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-background font-medium text-xs">
                <span className="bg-gold rounded-full px-3 py-2 flex items-center gap-1.5 shadow-lg">
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Regenerate
                </span>
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3 text-center">
            Scan this QR code with your authenticator app
          </p>

          {/* 兼容验证器图标提示 */}
          <div className="flex items-center justify-center gap-3 mb-1">
            {AUTHENTICATORS.map((a) => (
              <div key={a.name} className="flex flex-col items-center gap-1" title={a.name}>
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold text-white shadow"
                  style={{ background: a.color }}>{a.mark}</span>
                <span className="text-[9px] text-muted-foreground/70">{a.name}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 手动输入备选 */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="w-3.5 h-3.5" />
            Can't scan? Choose manual entry in your app and paste this secret key.
          </div>
          <div className="flex items-center gap-2 bg-input rounded-lg px-3 py-2.5">
            <code className="flex-1 font-mono text-sm text-gold tracking-wider break-all">{formattedSecret}</code>
            <button onClick={handleCopy} className="text-muted-foreground hover:text-gold transition-colors shrink-0">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 验证码输入 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Smartphone className="w-3.5 h-3.5" />
            Enter the 6-digit code from your app
          </div>
          <div className={`flex justify-center transition-opacity ${expired ? "opacity-40 pointer-events-none" : ""}`}>
            <InputOTP maxLength={6} value={code} onChange={setCode} disabled={expired}>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="w-11 h-12 border-border bg-input text-foreground rounded-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        </div>
      </div>

      <div className="mt-8">
        {expired ? (
          <button onClick={handleRegenerate} disabled={regenerating}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2">
            {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Regenerate QR Code
          </button>
        ) : (
          <button onClick={handleVerify} disabled={code.length < 6 || verifying}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
            Verify &amp; Continue
          </button>
        )}
        <p className="text-[10px] text-muted-foreground/50 text-center mt-3">
          Two-factor authentication is required for account security.
        </p>
      </div>
    </Shell>
  );
}
