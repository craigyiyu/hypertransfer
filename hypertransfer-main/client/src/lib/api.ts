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
}
export interface RegisterResult {
  phone: string;
  otpauth_uri: string;
  secret: string;
  qr_png_base64: string;
  expires_at: number; // 绑定会话截止(Unix 秒)
  expires_in: number; // 绑定会话总时长(秒)
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
    api.post<{ ok: boolean; token: string; user: AuthUser }>("/confirm-totp", {
      areaCode,
      phoneNumber,
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
  }) => api.post<{ ok: boolean; challenge: string; next: string }>("/login/start", p),

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
};
