/**
 * authFlow — 注册/登录两步流程之间的临时态(sessionStorage 键 + 类型)。
 * 仅在跨页跳转的短暂窗口存在,完成或失败后清除。
 */
export const PENDING_REGISTER_KEY = "ht_pending_register";
export const LOGIN_CHALLENGE_KEY = "ht_login_challenge";

export interface PendingRegister {
  areaCode: string;
  phoneNumber: string;
  name: string;
  email: string;
  qr: string;
  secret: string;
  otpauth: string;
  expiresAt: number; // 绑定会话截止(Unix 秒)
  // 邀请注册无手机号 → Setup2FA 用 email 激活 TOTP，且不提供「免短信重生成」入口。
  viaEmail?: boolean;
  demo?: boolean;   // demo: Setup2FA 自动填 6 位码(confirm-totp 接受任意 6 位)
}

export interface LoginChallenge {
  challenge: string;
  label: string; // 展示用:登录的账号
  demo?: boolean; // demo: Verify2FA 自动填 6 位码(login/verify 接受任意 6 位)
}

export function readPendingRegister(): PendingRegister | null {
  if (typeof window === "undefined") return null; // SSR 安全
  const raw = sessionStorage.getItem(PENDING_REGISTER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingRegister;
  } catch {
    return null;
  }
}

export function readLoginChallenge(): LoginChallenge | null {
  if (typeof window === "undefined") return null; // SSR 安全
  const raw = sessionStorage.getItem(LOGIN_CHALLENGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginChallenge;
  } catch {
    return null;
  }
}
