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

/** 员工(staff)判定: 登录后路由到后台 /casino-ops 而非客户 /dashboard。 */
export function isStaffUser(u: { userType?: string; roles?: string[] }): boolean {
  return u.userType === "staff" || (u.roles?.length ?? 0) > 0;
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
  demo?: boolean;   // demo: Setup2FA 据此自动填 6 位码(confirm-totp 接受任意 6 位)
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

  // 邀请制: 开放自助注册(手机/邮箱)已移除; 注册仅走 inviteAuthApi.registerInvite(/invite 落地)。

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
  }) => api.post<{ ok: boolean; challenge?: string; next: string; token?: string; user?: AuthUser; demo?: boolean }>("/login/start", p),

  loginVerify: (challenge: string, code: string) =>
    api.post<{ ok: boolean; token: string; user: AuthUser }>("/login/verify", {
      challenge,
      code,
    }),

  me: () => api.get<{ user: AuthUser }>("/me"),

  logout: () => api.post("/logout"),

  // 忘记密码:发重置短信
  passwordSendOtp: (areaCode: string, phoneNumber: string) =>
    api.post<{ ok: boolean; cooldown: number; demo?: boolean }>("/password/send-otp", {
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
  inviteLink?: string;      // 仅 issued: 可交付给客户的单次链接(RM 页展示/复制)
  qrPngBase64?: string;     // 仅 issued: 邀请链接二维码(data URI, RM 页展示/扫码)
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

  // RM 查自己提交的申请(看审批进度)
  mine: () => api.get<{ ok: boolean; invitations: Invitation[] }>("/invitations/mine"),

  // 审批通过即自动签发 QR+link 并发邮件(决策: 去掉单独 issue 步骤/状态), 故返回 inviteLink/qr。
  approve: (id: string, note = "") =>
    api.post<{ ok: boolean; invitation: Invitation; inviteLink: string; qrPngBase64: string; emailChannel?: string; emailTo?: string }>(`/invitations/${id}/approve`, { note }),

  reject: (id: string, note = "") =>
    api.post<{ ok: boolean; invitation: Invitation }>(`/invitations/${id}/reject`, { note }),

  issue: (id: string) =>
    api.post<{ ok: boolean; invitation: Invitation; inviteLink: string; qrPngBase64: string; emailChannel?: string; emailTo?: string }>(`/invitations/${id}/issue`, {}),

  // 对已 issued 的邀请重发邮件(后端重新签发 token + 6h, 旧链接失效)
  resend: (id: string) =>
    api.post<{ ok: boolean; invitation: Invitation; inviteLink: string; qrPngBase64: string; emailChannel?: string; emailTo?: string }>(`/invitations/${id}/resend`, {}),

  // 对当前有效 issued 链接重新发送邮件(不旋转 token)
  email: (id: string) =>
    api.post<{ ok: boolean; invitation: Invitation; inviteLink: string; qrPngBase64: string; emailChannel?: string; emailTo?: string }>(`/invitations/${id}/email`, {}),

  // RM 把被拒申请直接重新提交(rejected → submitted, 清除拒绝原因)
  resubmit: (id: string) =>
    api.post<{ ok: boolean; invitation: Invitation }>(`/invitations/${id}/resubmit`, {}),
};

export const emailApi = {
  // 邀请注册第一因子:仅对已 issued 邀请的 email 发码(后端防枚举)
  sendOtp: (email: string) =>
    api.post<{ ok: boolean; cooldown: number; demo?: boolean }>("/email/send-otp", { email }),
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

// ---------- 入金编排 API(②KYC 硬阻断 + ③真实发址 / 1 USDT 验证) ----------
// patron 视角: create → screen → issue-address → confirm-test(1 USDT) → main。
// 后端在 create/screen/issue/main 强制 require_kyc; 1 USDT 到账写入 verified_wallets(供退款①)。
// 未配置 Hex Safe 且非 production 时后端走 demo 占位, 前端再叠一层 try/catch mock 回退保证演示不断。
export interface DepositRecord {
  id: string;
  userId: string;
  asset: string;
  network: string;
  chainId: string;
  amountDecimal: string | null;
  sourceWallet: string | null;
  screeningStatus: string | null;
  travelRuleRequired: boolean;
  travelRuleStatus: string;
  depositAddress: string | null;
  verifyTxHash: string | null;
  verifyStatus: string;
  verifiedWalletId: string | null;
  markerRef: string | null;
  fiatCurrency: string | null;
  fiatAmount: string | null;
  receiptRef: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface HexSafeNetwork {
  rail: string;            // ethereum / tron → 展示 ERC-20 / TRC-20
  chainId: string;         // Hex Safe 真实 chainId
  name: string;
  minConfirmations: number | null;
}

export const depositApi = {
  // 入金可选网络: 真实来自 Hex Safe supported_chains; 未配置→ configured:false + 空(不显示硬编码)
  networks: () =>
    api.get<{ configured: boolean; source: string; networks: HexSafeNetwork[] }>("/hexsafe/networks"),
  // 入金资格: KYC ok → active, 否则 hold(②)
  eligibility: () =>
    api.get<{ ok: boolean; kycOk: boolean; accountState: string; reason: string; travelRuleThresholdUsd: number }>(
      "/deposits/eligibility",
    ),
  create: (p: { network: string; asset?: string; amountDecimal?: string }) =>
    api.post<{ ok: boolean; requestId: string; status: string; chainId: string; travelRuleRequired: boolean }>(
      "/deposits",
      p,
    ),
  screen: (id: string, sourceWallet: string) =>
    api.post<{ ok: boolean; requestId: string; screeningStatus: string; status: string; provider: string; reference: string; riskScore: number; note: string }>(
      `/deposits/${id}/screen`,
      { sourceWallet },
    ),
  // travelRuleStatus: 前端 TR 步骤拿到的 gate 结果(≥USD1k 必须回填 'travel_rule_accepted' 才放行发址)
  issueAddress: (id: string, travelRuleStatus = "") =>
    api.post<{ ok: boolean; requestId: string; status: string; depositAddress: string; chainId: string; vaultId: string; provider: string }>(
      `/deposits/${id}/issue-address`,
      { travelRuleStatus },
    ),
  // 1 USDT 验证: 带 txHash 走真实(Hex Safe 查到账), 不带则非 prod demo 确认。写入 verified_wallets。
  confirmTest: (id: string, txHash = "") =>
    api.post<{ ok: boolean; requestId: string; status: string; verifiedWalletId: string; txHash: string; provider: string }>(
      `/deposits/${id}/confirm-test`,
      { txHash },
    ),
  main: (id: string, amountDecimal: string, travelRuleStatus = "") =>
    api.post<{ ok: boolean; requestId: string; status: string; travelRuleRequired: boolean; travelRuleStatus: string }>(
      `/deposits/${id}/main`,
      { amountDecimal, travelRuleStatus },
    ),
  mine: () => api.get<{ ok: boolean; deposits: DepositRecord[] }>("/deposits/mine"),
  get: (id: string) => api.get<{ ok: boolean; deposit: DepositRecord }>(`/deposits/${id}`),
  // staff: 入金队列(compliance/ops/custodian) + Marker 录回(marketing/ops, marker 即 settled)
  queue: (status?: string) =>
    api.get<{ ok: boolean; deposits: DepositRecord[] }>("/deposits", { params: status ? { status } : undefined }),
  marker: (id: string, markerRef: string) =>
    api.post<{ ok: boolean; requestId: string; status: string; markerRef: string }>(`/deposits/${id}/marker`, { markerRef }),
  settle: (id: string, fiatCurrency = "") =>
    api.post<{ ok: boolean; requestId: string; status: string; fiatCurrency: string; fiatAmount: string; receiptRef: string; forex: string }>(
      `/deposits/${id}/settle`,
      { fiatCurrency },
    ),
};

// ---------- 退款 API(①: 强制原路退回已验证原钱包) ----------
// 合规红线: 退款目标只能是 verified_wallets 里本人的原钱包(walletId), 不接受自由输入新地址。
export interface VerifiedWallet {
  id: string;
  address: string;
  chainId: string;
  asset: string;
  method: string | null;
  verifiedAt: number;
}
export interface RefundRecord {
  id: string;
  userId: string;
  walletId: string;
  toAddress: string;
  chainId: string;
  asset: string;
  amountDecimal: string;
  reason: string | null;
  status: string;
  kycOk: boolean;
  kytStatus: string | null;
  approvedBy: string | null;
  transferId: string | null;
  createdAt: number;
  updatedAt: number;
}

export const refundApi = {
  // 客户已验证原钱包 = 退款唯一可选目标
  wallets: () => api.get<{ ok: boolean; wallets: VerifiedWallet[] }>("/refunds/wallets"),
  create: (p: { walletId: string; amountDecimal: string; reason?: string }) =>
    api.post<{ ok: boolean; requestId: string; status: string; detail?: string }>("/refunds", p),
  mine: () => api.get<{ ok: boolean; refunds: RefundRecord[] }>("/refunds/mine"),
  // staff 队列(compliance/ops/custodian)
  queue: (status?: string) =>
    api.get<{ ok: boolean; refunds: RefundRecord[] }>("/refunds", { params: status ? { status } : undefined }),
  screen: (id: string, decision: "pass" | "manual_review" | "reject") =>
    api.post<{ ok: boolean; requestId: string; kytStatus: string; status: string }>(`/refunds/${id}/screen`, { decision }),
  approve: (id: string) => api.post<{ ok: boolean; requestId: string; status: string }>(`/refunds/${id}/approve`, {}),
  reject: (id: string) => api.post<{ ok: boolean; requestId: string; status: string }>(`/refunds/${id}/reject`, {}),
  execute: (id: string) =>
    api.post<{ ok: boolean; requestId: string; status: string; transferId: string }>(`/refunds/${id}/execute`, {}),
};

// ---------- Host-led VIP admission (2026-08-21) ----------
export interface HostProfile {
  userId: string;
  employeeId: string | null;
  department: string | null;
  operatingTeam: string | null;
  location: string | null;
  phone: string | null;
  status: "pending" | "active" | "disabled";
  acknowledgedAt: number | null;
  updatedAt: number;
}

export const hostApi = {
  // Host 通过现有 staff 会话(企业 Okta 身份的边界)激活 profile
  activate: (p: {
    employeeId?: string;
    department?: string;
    operatingTeam?: string;
    location?: string;
    phone?: string;
    acknowledged: boolean;
  }) => api.post<{ ok: boolean; profile: HostProfile }>("/host/profile/activate", p),
  profile: () => api.get<{ ok: boolean; profile: HostProfile }>("/host/profile"),
};

export interface AdmissionInvitationView {
  emailExpiresAt: string;
  qrExpiresAt: string;
}

export interface AdmissionCase {
  id: string;
  hostName: string;
  patronEmailMasked: string;
  status: AdmissionCaseStatus;
  memberReference?: string | null;
  servicePurpose?: string | null;
  preferredLanguage?: string | null;
  route?: "complete_dossier" | "kyc_first";
  kycHostMessage?: string;
  kycValidUntil?: number;
  invitation?: AdmissionInvitationView | null;
}

export type AdmissionCaseStatus =
  | "draft"
  | "invitation_open"
  | "vip_claimed"
  | "kyc_in_progress"
  | "kyc_passed"
  | "payment_precheck"
  | "leader_pending"
  | "service_enabled"
  | "kyc_failed"
  | "compliance_review"
  | "rejected"
  | "expired"
  | "revoked";

export const admissionApi = {
  // 仅 active Host 可创建(后端强制)
  create: (p: {
    patronEmail: string;
    memberReference?: string;
    servicePurpose?: string;
    hostNotes?: string;
    preferredLanguage?: string;
    route?: "complete_dossier" | "kyc_first";
  }) => api.post<{ ok: boolean; case: AdmissionCase }>("/admission-cases", p),
  mine: () => api.get<{ ok: boolean; cases: AdmissionCase[] }>("/admission-cases/mine"),
  // VIP: 查看自己被绑定的 admission case(安全投影, 无 Host notes)
  patronMine: () => api.get<{ ok: boolean; case: AdmissionCase }>("/admission-cases/patron/mine"),
  get: (id: string) => api.get<{ ok: boolean; case: AdmissionCase }>(`/admission-cases/${id}`),
  revoke: (id: string) => api.post<{ ok: boolean; case: AdmissionCase }>(`/admission-cases/${id}/revoke`, {}),
  // 双通道邀请(2026-08-21): 同一 case 的 email link + 动态 QR session, 均须 Email OTP 认领
  inviteEmail: (id: string) =>
    api.post<{ ok: boolean; case: AdmissionCase; emailExpiresAt: string; qrExpiresAt: string }>(
      `/admission-cases/${id}/invite/email`,
      {},
    ),
  inviteQrSession: (id: string) =>
    api.post<{ ok: boolean; case: AdmissionCase; qrExpiresAt: string }>(
      `/admission-cases/${id}/invite/qr-session`,
      {},
    ),
};

// ---------- 双通道认领 (Task 4): email link / QR 均须 Email OTP 绑定 ----------
export interface AdmissionClaimVerifyResult {
  ok: boolean;
  patronEmailMasked: string;
  caseId: string;
  demo?: boolean;
}

export interface AdmissionClaimRegisterResult {
  userId: string;
  email: string;
  otpauth_uri: string;
  secret: string;
  qr_png_base64: string;
  expires_at: number;
  expires_in: number;
  demo?: boolean;
}

export const admissionClaimApi = {
  // 认领第 1 步: 校验 session + 邮箱匹配, 向该邮箱发 Email OTP(QR 扫描本身不认领 case)
  verifyEmail: (sessionToken: string, email: string) =>
    api.post<AdmissionClaimVerifyResult>("/admission-claims/verify-email", { sessionToken, email }),
  // 认领第 2 步: Email OTP 验真 -> 建 patron 账号 + 绑定 case(vip_claimed) + 返回 TOTP 绑定信息
  register: (p: { sessionToken: string; email: string; emailOtp: string; name: string; password: string }) =>
    api.post<AdmissionClaimRegisterResult>("/admission-claims/register", p),
};

// ---------- 单一领导审批 (Task 6) ----------
export interface LeaderIntendedPayment {
  asset: string;
  network: string;
  intendedAmount: string | null;
  sourceType: string | null;
  counterpartyName: string;
  status: string;
}

export interface LeaderCase {
  id: string;
  hostName: string;
  patronEmailMasked: string;
  servicePurpose: string | null;
  route: "complete_dossier" | "kyc_first";
  status: string;
  kycValidUntil: number | null;
  intendedPayment: LeaderIntendedPayment | null;
}

export const leaderApi = {
  // 只读 leader_pending 队列(仅 leader 角色; 生产需配置 HT_LEADER_USER_ID)
  cases: () => api.get<{ ok: boolean; cases: LeaderCase[] }>("/leader/admission-cases"),
  // approved -> service_enabled; rejected 必填业务原因
  decide: (caseId: string, decision: "approved" | "rejected", reason?: string) =>
    api.post<{ ok: boolean; case: LeaderCase }>(`/admission-cases/${caseId}/leader-decision`, {
      decision,
      reason,
    }),
};
