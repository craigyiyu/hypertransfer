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

/** 把后端/网络错误规整成可读消息。 */
export function apiError(err: unknown): string {
  const ax = err as AxiosError<{ detail?: string }>;
  if (ax?.response?.data?.detail) return ax.response.data.detail;
  if (ax?.code === "ECONNABORTED") return "请求超时，请重试";
  if (ax?.message === "Network Error") return "无法连接服务器，请确认后端已启动";
  return "操作失败，请重试";
}

// ---------- 类型 ----------
export interface AuthUser {
  phone: string;
  name: string;
  email: string;
  status: string;
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
