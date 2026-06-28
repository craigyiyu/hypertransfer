/**
 * api.ts — 统一的后端 API 客户端 (axios)。
 * baseURL 走 /api，由 vite dev proxy 转发到 FastAPI(localhost:8000);
 * 生产由同源网关 / 反代转发。token 自动注入,401 自动清理本地会话。
 */
import axios, { AxiosError } from "axios";

const TOKEN_KEY = "ht_token";

export const api = axios.create({
  baseURL: "/api",
  timeout: 25000,
  headers: { "Content-Type": "application/json" },
});

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ detail?: string }>) => {
    if (error.response?.status === 401) clearToken();
    return Promise.reject(error);
  }
);

const ERROR_MESSAGE_MAP: Record<string, string> = {
  "账号或密码有误": "Incorrect email or password.",
  "验证码错误或已过期": "The verification code is incorrect or expired.",
  "验证码错误次数过多, 请重新登录": "Too many incorrect attempts. Please sign in again.",
  "登录会话已过期, 请重新登录": "Your sign-in session expired. Please sign in again.",
  "会话已过期, 请重新登录": "Your session expired. Please sign in again.",
  "尝试次数过多, 请重新登录": "Too many attempts. Please sign in again.",
  "恢复码无效或已被使用": "The recovery code is invalid or has already been used.",
  "请先注册": "Please create an account first.",
  "绑定已超时，请返回重新获取二维码": "The setup session expired. Please generate a new QR code.",
  "该账户已激活, 请直接登录": "This account is already active. Please sign in.",
  "该邮箱已被注册, 请更换或直接登录": "This email is already registered. Please use another email or sign in.",
  "该手机号已注册, 请直接登录": "This mobile number is already registered. Please sign in.",
  "该手机号未注册": "This mobile number is not registered.",
  "短信验证码错误": "The SMS verification code is incorrect.",
  "验证码已过期, 请重新获取": "The verification code expired. Please request a new one.",
  "请先获取短信验证码": "Please request an SMS verification code first.",
  "验证码错误次数过多, 请重新获取": "Too many incorrect attempts. Please request a new code.",
  "今日验证码发送次数已达上限": "You have reached today's verification code limit.",
  "手机号或区号无效": "Invalid mobile number or country/region code.",
};

function normalizeApiMessage(message: string) {
  const waitMatch = message.match(/^请 (\d+) 秒后再获取验证码$/);
  if (waitMatch) return `Please wait ${waitMatch[1]} seconds before requesting another code.`;
  if (message.startsWith("短信网关 HTTP")) return message.replace("短信网关", "SMS gateway");
  if (message.startsWith("短信网关不可达")) return "SMS gateway is unavailable. Please try again later.";
  if (message.startsWith("短信发送失败")) return "SMS delivery failed. Please try again later.";
  return ERROR_MESSAGE_MAP[message] || message;
}

/** Normalize backend and network errors into user-facing English copy. */
export function apiError(err: unknown): string {
  const ax = err as AxiosError<{ detail?: string }>;
  if (ax?.response?.data?.detail) return normalizeApiMessage(ax.response.data.detail);
  if (ax?.code === "ECONNABORTED") return "The request timed out. Please try again.";
  if (ax?.message === "Network Error") return "Cannot connect to the server. Please confirm the backend is running.";
  return "Something went wrong. Please try again.";
}

// ---------- 类型 ----------
export interface AuthUser {
  phone: string;
  name: string;
  email: string;
  status: string;
  userType?: string;      // 'patron' | 'staff'（RBAC，PR①）
  roles?: string[];       // staff 细分角色：rm/marketing/compliance/ops/custodian/admin
  totpEnabled?: boolean;  // PR③ 2FA 可选：是否已启用 TOTP（登录/step-up 是否验码）
}

// 启用/确认 2FA 后返回的 TOTP 绑定信息（已登录用户补启用）。
export interface Enable2faResult {
  ok: boolean;
  otpauth_uri: string;
  secret: string;
  qr_png_base64: string;
}
export interface RegisterResult {
  phone: string;
  otpauth_uri: string;
  secret: string;
  qr_png_base64: string;
  expires_at: number; // 绑定会话截止(Unix 秒)
  expires_in: number; // 绑定会话总时长(秒)
}

// 邀请注册返回的 TOTP 绑定信息（无 phone，用 email 定位）。
export interface RegisterInviteResult {
  email: string;
  otpauth_uri: string;
  secret: string;
  qr_png_base64: string;
  expires_at: number;
  expires_in: number;
}

export interface InvitationVerifyResult {
  ok: boolean;
  patronEmail: string;
  patronName: string;
  expiresAt: number;
}

// ---------- 认证 API ----------
export const authApi = {
  sendOtp: (areaCode: string, phoneNumber: string) =>
    api.post<{ ok: boolean; phone: string; cooldown: number }>("/send-otp", {
      areaCode,
      phoneNumber,
    }),

  register: (p: {
    areaCode: string;
    phoneNumber: string;
    otp: string;
    name: string;
    email: string;
    password: string;
  }) => api.post<RegisterResult>("/register", p),

  confirmTotp: (areaCode: string, phoneNumber: string, code: string) =>
    api.post<{ ok: boolean; token: string; user: AuthUser; recovery_codes?: string[] }>("/confirm-totp", {
      areaCode,
      phoneNumber,
      code,
    }),

  // 邀请注册的客户无手机号 → 用 email 定位 pending 用户激活 TOTP。
  confirmTotpByEmail: (email: string, code: string) =>
    api.post<{ ok: boolean; token: string; user: AuthUser; recovery_codes?: string[] }>("/confirm-totp", {
      email,
      code,
    }),

  // 绑定会话超时后,免短信重新签发 TOTP 二维码
  regenerateTotp: (areaCode: string, phoneNumber: string) =>
    api.post<RegisterResult>("/regenerate-totp", { areaCode, phoneNumber }),

  loginStart: (p: {
    method: "mobile" | "email";
    areaCode?: string;
    phoneNumber?: string;
    email?: string;
    password: string;
    // PR③: next='done' 时（用户未启用 2FA）直接带回 token+user，无需第二步
  }) => api.post<{ ok: boolean; challenge?: string; next: string; token?: string; user?: AuthUser }>("/login/start", p),

  loginVerify: (challenge: string, code: string) =>
    api.post<{ ok: boolean; token: string; user: AuthUser }>("/login/verify", {
      challenge,
      code,
    }),

  me: () => api.get<{ user: AuthUser }>("/me"),

  logout: () => api.post("/logout"),

  // 忘记密码:发重置短信
  passwordSendOtp: (areaCode: string, phoneNumber: string) =>
    api.post<{ ok: boolean; cooldown: number }>("/password/send-otp", {
      areaCode,
      phoneNumber,
    }),

  // 忘记密码:校验短信码 + 设新密码
  passwordReset: (p: {
    areaCode: string;
    phoneNumber: string;
    otp: string;
    newPassword: string;
  }) => api.post<{ ok: boolean }>("/password/reset", p),

  // PR③: 2FA 可选 —— 跳过 TOTP 直接激活（手机用 areaCode+phoneNumber，邀请用 email）
  activateSkip: (p: { areaCode?: string; phoneNumber?: string; email?: string }) =>
    api.post<{ ok: boolean; token: string; user: AuthUser }>("/register/activate-skip", p),

  // PR③: 已登录用户补启用 2FA（出二维码 → confirm 验码激活）
  enable2fa: () => api.post<Enable2faResult>("/2fa/enable", {}),
  confirm2fa: (code: string) =>
    api.post<{ ok: boolean; user: AuthUser; recovery_codes?: string[] }>("/2fa/confirm", { code }),
  disable2fa: (code: string) =>
    api.post<{ ok: boolean; user: AuthUser }>("/2fa/disable", { code }),

  // PR③: 资金动作（入金/退款）前 step-up 二次验证 TOTP
  stepupVerify: (code: string) =>
    api.post<{ ok: boolean; verifiedAt: number; ttl: number }>("/stepup/verify", { code }),
};

// ---------- 邀请制 / Email OTP / 员工管理 (PR②-2) ----------
export interface Invitation {
  id: string;
  patronEmail: string;
  patronName: string;
  status: string;
  expiresAt: number | null;
  createdBy: string;
  reviewedBy: string;
  consumedBy: string;
  createdAt: number;
  updatedAt: number;
  token?: string;
  details?: Record<string, unknown> | null;
}

export const invitationApi = {
  // 公开:客户 token+email 校验邀请
  verify: (token: string, email: string) =>
    api.post<InvitationVerifyResult>("/invitations/verify", { token, email }),

  // RM 提交邀请
  create: (p: { patronEmail: string; patronName?: string; details?: Record<string, unknown> }) =>
    api.post<{ ok: boolean; invitation: Invitation }>("/invitations", p),

  // marketing/compliance/admin 列队列(可按 status 过滤)
  list: (status?: string) =>
    api.get<{ ok: boolean; invitations: Invitation[] }>("/invitations", {
      params: status ? { status } : undefined,
    }),

  approve: (id: string, note = "") =>
    api.post<{ ok: boolean; invitation: Invitation }>(`/invitations/${id}/approve`, { note }),

  reject: (id: string, note = "") =>
    api.post<{ ok: boolean; invitation: Invitation }>(`/invitations/${id}/reject`, { note }),

  issue: (id: string) =>
    api.post<{ ok: boolean; invitation: Invitation; inviteLink: string }>(`/invitations/${id}/issue`, {}),
};

export const emailApi = {
  // 邀请注册第一因子:仅对已 issued 邀请的 email 发码(后端防枚举)
  sendOtp: (email: string) =>
    api.post<{ ok: boolean; cooldown: number }>("/email/send-otp", { email }),
};

export const inviteAuthApi = {
  // 邀请注册:token+email+emailOtp+name+password → 返回 TOTP 绑定信息
  registerInvite: (p: {
    token: string;
    email: string;
    emailOtp: string;
    name: string;
    password: string;
  }) => api.post<RegisterInviteResult>("/register/invite", p),
};

export const adminApi = {
  // admin 预置员工账号(邮箱+密码+角色+强制绑定 TOTP)
  createStaff: (p: { email: string; name: string; password: string; roles: string[] }) =>
    api.post<{
      ok: boolean;
      userId: string;
      email: string;
      roles: string[];
      otpauth_uri: string;
      secret: string;
      qr_png_base64: string;
      expires_at: number;
      expires_in: number;
    }>("/admin/staff", p),
};

// ---------- Hex Safe 托管 API (staff/custodian) ----------
// 边界: Hex Safe 只做托管/发址/到账/提现/webhook; KYC + Travel Rule 走 Sumsub。
// 这些端点后端是 staff/custodian 角色守卫的, 仅供 casino-ops 后台调用, 客户端不要直连。
export interface HexSafeHealth {
  ok: boolean;
  provider: string;
  configured: boolean;
  baseUrl: string;
  defaultVaultId: string | null;
  // missing_credentials | configured | live | configured_but_unreachable
  status: string;
  vaultCount?: number;
  error?: string;
}
export interface HexSafeVault {
  id: string;
  name: string;
  type: string;
  status: string;
  assetList: unknown[] | null;
}
export interface HexSafeAddress {
  ok: boolean;
  provider: string;
  chainId: string;
  address: string;
}
export interface HexSafeTransactions {
  transactionList: Array<Record<string, unknown>>;
  paging: { limit: number; offset: number; sort: string };
}
export interface HexSafeWithdrawalResult {
  ok: boolean;
  provider: string;
  idempotencyKey: string;
  [k: string]: unknown;
}

export const hexsafeApi = {
  health: () => api.get<HexSafeHealth>("/hexsafe/health"),
  vaults: () =>
    api.get<{ vaultList: HexSafeVault[]; currentCount: number; totalCount: number }>("/hexsafe/vaults"),
  // 生成入金地址(链级, Hex Safe 地址按 vault×链固定)。chainId 如 11155111(Sepolia)/ tron:nile。
  createDepositAddress: (p: { chainId: string; vaultId?: string }) =>
    api.post<HexSafeAddress>("/hexsafe/deposit-address", p),
  transactions: (p: { vaultId?: string; limit?: number; offset?: number; sort?: string } = {}) =>
    api.get<HexSafeTransactions>("/hexsafe/transactions", { params: p }),
  transaction: (traceId: string) =>
    api.get<Record<string, unknown>>(`/hexsafe/transactions/${encodeURIComponent(traceId)}`),
  depositByTxHash: (txHash: string) =>
    api.get<{ ok: boolean; provider: string; found: boolean; deposit: unknown }>(
      `/hexsafe/deposit/${encodeURIComponent(txHash)}`,
    ),
  // ⚠️ 真实资金动作: 放行由 Hex Safe 审批/quorum 决定; 退款 to 须是客户已验证过的原钱包。
  withdrawal: (p: {
    ticker: string;
    chainId: string;
    amountDecimal: string;
    fromAddress: string;
    toAddress: string;
    enterpriseId?: string;
    idempotencyKey?: string;
  }) => api.post<HexSafeWithdrawalResult>("/hexsafe/withdrawal", p),
};
