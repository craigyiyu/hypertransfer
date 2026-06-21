import { api } from "@/lib/api";

export interface SumsubConfig {
  configured: boolean;
  environment: string;
  baseUrl: string;
  kycLevelName: string;
  travelRuleLevelName: string;
  webSdkTtlInSecs: number;
  webSdkScriptUrl: string;
  webhookVerificationConfigured: boolean;
  capabilities: string[];
}

export interface SumsubHealth {
  ok: boolean;
  provider: "sumsub";
  configured: boolean;
  environment: string;
  baseUrl: string;
  kycLevelName: string;
  status: "ready_to_call_sumsub" | "missing_credentials";
}

export interface SumsubAccessToken {
  ok: boolean;
  provider: "sumsub";
  environment: string;
  levelName: string;
  userId: string;
  token: string;
  expiresIn: number;
}

export interface SumsubConnectionTest {
  ok: boolean;
  provider: "sumsub";
  connected: boolean;
  environment: string;
  levelName: string;
  userId: string;
}

export type SumsubKycStatusValue = "not_started" | "pending" | "approved" | "rejected";

export interface SumsubKycStartPayload {
  nationality: string;
  dob: string;
  idType: string;
  idNumber: string;
  address?: string;
  city?: string;
  levelName?: string;
  ttlInSecs?: number;
  apiOnly?: boolean;
}

export interface SumsubKycStatus {
  ok: boolean;
  provider: "sumsub";
  configured: boolean;
  status: SumsubKycStatusValue;
  reviewStatus: string;
  reviewAnswer: string;
  rejectionReason: string;
  externalUserId: string;
  applicantId: string;
  levelName: string;
  updatedAt: number | null;
}

export interface SumsubKycStart extends SumsubKycStatus {
  environment: string;
  token: string;
  expiresIn: number;
  mode?: "api_only" | "websdk";
}

type SumsubPayload = Record<string, unknown>;
type SumsubHandler = (payload?: SumsubPayload) => void;

interface SumsubSdkInstance {
  launch: (selector: string) => void;
}

interface SumsubSdkBuilder {
  withConf: (config: Record<string, unknown>) => SumsubSdkBuilder;
  withOptions: (options: Record<string, unknown>) => SumsubSdkBuilder;
  on: (event: string, handler: SumsubHandler) => SumsubSdkBuilder;
  build: () => SumsubSdkInstance;
}

interface SumsubSdkGlobal {
  init: (accessToken: string, refreshAccessToken: () => Promise<string>) => SumsubSdkBuilder;
}

declare global {
  interface Window {
    snsWebSdk?: SumsubSdkGlobal;
  }
}

const DEFAULT_SCRIPT_URL = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";

export const sumsubApi = {
  config: () => api.get<SumsubConfig>("/sumsub/config"),
  health: () => api.get<SumsubHealth>("/sumsub/health"),
  kycStart: (payload: SumsubKycStartPayload) =>
    api.post<SumsubKycStart>("/sumsub/kyc/start", payload),
  kycStatus: () => api.get<SumsubKycStatus>("/sumsub/kyc/status"),
  accessToken: (payload: { levelName?: string; ttlInSecs?: number } = {}) =>
    api.post<SumsubAccessToken>("/sumsub/access-token", payload),
  connectionTest: (payload: { levelName?: string; ttlInSecs?: number } = {}) =>
    api.post<SumsubConnectionTest>("/sumsub/connection-test", payload),
};

export function loadSumsubWebSdk(scriptUrl = DEFAULT_SCRIPT_URL): Promise<SumsubSdkGlobal> {
  if (window.snsWebSdk) return Promise.resolve(window.snsWebSdk);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-sumsub-websdk]");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.snsWebSdk) resolve(window.snsWebSdk);
        else reject(new Error("Sumsub WebSDK script loaded without snsWebSdk global."));
      });
      existing.addEventListener("error", () => reject(new Error("Failed to load Sumsub WebSDK script.")));
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.dataset.sumsubWebsdk = "true";
    script.onload = () => {
      if (window.snsWebSdk) resolve(window.snsWebSdk);
      else reject(new Error("Sumsub WebSDK script loaded without snsWebSdk global."));
    };
    script.onerror = () => reject(new Error("Failed to load Sumsub WebSDK script."));
    document.head.appendChild(script);
  });
}

export async function launchSumsubWebSdk({
  accessToken,
  containerSelector,
  refreshAccessToken,
  scriptUrl,
  onReady,
  onInitialized,
  onApplicantLoaded,
  onApplicantSubmitted,
  onApplicantStatusChanged,
  onApplicantVerificationCompleted,
  onError,
}: {
  accessToken: string;
  containerSelector: string;
  refreshAccessToken: () => Promise<string>;
  scriptUrl?: string;
  onReady?: SumsubHandler;
  onInitialized?: SumsubHandler;
  onApplicantLoaded?: SumsubHandler;
  onApplicantSubmitted?: SumsubHandler;
  onApplicantStatusChanged?: SumsubHandler;
  onApplicantVerificationCompleted?: SumsubHandler;
  onError?: SumsubHandler;
}) {
  const snsWebSdk = await loadSumsubWebSdk(scriptUrl);
  const builder = snsWebSdk
    .init(accessToken, refreshAccessToken)
    .withConf({ lang: "en", theme: "dark" })
    .withOptions({ addViewportTag: false, adaptIframeHeight: true });

  builder
    .on("idCheck.onReady", (payload) => onReady?.(payload))
    .on("idCheck.onInitialized", (payload) => onInitialized?.(payload))
    .on("idCheck.onApplicantLoaded", (payload) => onApplicantLoaded?.(payload))
    .on("idCheck.onApplicantSubmitted", (payload) => onApplicantSubmitted?.(payload))
    .on("idCheck.onApplicantStatusChanged", (payload) => onApplicantStatusChanged?.(payload))
    .on("idCheck.onApplicantVerificationCompleted", (payload) =>
      onApplicantVerificationCompleted?.(payload),
    )
    .on("idCheck.onError", (payload) => onError?.(payload));

  const instance = builder.build();
  instance.launch(containerSelector);
  return instance;
}
