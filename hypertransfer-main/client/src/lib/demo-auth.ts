import type { AuthUser } from "@/lib/api";

export const DEMO_AUTH_TOKEN = "demo-local-session";
export const DEMO_STAFF_TOKEN = "demo-local-staff-session";

export const DEMO_AUTH_USER: AuthUser = {
  phone: "+852 9876 5432",
  name: "Demo User",
  email: "demo.user@hypercrypto.com",
  status: "active",
  userType: "patron",   // demo 是客户视角；后台 /casino-ops 需 staff 账号
  roles: [],
};

// demo 后台账号：方便演示 /casino-ops（staff 视角）。
export const DEMO_STAFF_USER: AuthUser = {
  phone: "",
  name: "Demo Ops Staff",
  email: "ops.staff@hypercrypto.com",
  status: "active",
  userType: "staff",
  roles: ["admin"],
};

export const DEMO_AUTH_PASSWORD = "Demo@12345";

export function isDemoAuthToken(token: string | null) {
  return token === DEMO_AUTH_TOKEN || token === DEMO_STAFF_TOKEN;
}

export function isDemoStaffToken(token: string | null) {
  return token === DEMO_STAFF_TOKEN;
}

export function isDemoCredential(email: string, password: string) {
  return email.trim().toLowerCase() === DEMO_AUTH_USER.email && password === DEMO_AUTH_PASSWORD;
}
