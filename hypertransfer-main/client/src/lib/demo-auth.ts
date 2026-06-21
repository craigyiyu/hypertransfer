import type { AuthUser } from "@/lib/api";

export const DEMO_AUTH_TOKEN = "demo-local-session";

export const DEMO_AUTH_USER: AuthUser = {
  phone: "+852 9876 5432",
  name: "Demo User",
  email: "demo.user@hypercrypto.com",
  status: "active",
};

export const DEMO_AUTH_PASSWORD = "Demo@12345";

export function isDemoAuthToken(token: string | null) {
  return token === DEMO_AUTH_TOKEN;
}

export function isDemoCredential(email: string, password: string) {
  return email.trim().toLowerCase() === DEMO_AUTH_USER.email && password === DEMO_AUTH_PASSWORD;
}
