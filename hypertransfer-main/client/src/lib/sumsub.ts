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

// Travel Rule（口径: TR 走 Sumsub）。提交建在 KYC 阶段创建的 applicant 上。
// status: provider_not_enabled 表示 Sumsub 账户尚未启用 TR 模块（需在 Cockpit 开通）。
export type SumsubTravelRuleStatus =
  | "travel_rule_submitted"
  | "travel_rule_accepted"
  | "travel_rule_rejected"
  | "manual_review"
  | "provider_not_enabled";

export interface SumsubTravelRulePayload {
  direction?: "in" | "out";
  amount: number;
  currencyCode?: string;
  cryptoChain?: string;
  originatorWallet?: string;
  counterpartyName?: string;
  counterpartyWallet?: string;
  counterpartyVasp?: string;
}

export interface SumsubTravelRuleResult {
  ok: boolean;
  provider: "sumsub";
  submittedTxnId: string;
  status: SumsubTravelRuleStatus;
  providerStatus: string;
  reviewAnswer: string;
  txnId: string;
  detail: string;
}

export const sumsubApi = {
  config: () => api.get<SumsubConfig>("/sumsub/config"),
  health: () => api.get<SumsubHealth>("/sumsub/health"),
  kycStart: (payload: SumsubKycStartPayload) =>
    api.post<SumsubKycStart>("/sumsub/kyc/start", payload),
  kycStatus: () => api.get<SumsubKycStatus>("/sumsub/kyc/status"),
  // 演示快捷键: 直接把当前用户 KYC 标 approved(仅非 production 后端放行)
  kycDemoApprove: () => api.post<SumsubKycStatus>("/sumsub/kyc/demo-approve", {}),
  accessToken: (payload: { levelName?: string; ttlInSecs?: number } = {}) =>
    api.post<SumsubAccessToken>("/sumsub/access-token", payload),
  connectionTest: (payload: { levelName?: string; ttlInSecs?: number } = {}) =>
    api.post<SumsubConnectionTest>("/sumsub/connection-test", payload),
  travelRuleSubmit: (payload: SumsubTravelRulePayload) =>
    api.post<SumsubTravelRuleResult>("/sumsub/travel-rule/submit", payload),
  travelRuleTransactions: (limit = 20) =>
    api.get<{ ok: boolean; provider: "sumsub"; result: unknown }>("/sumsub/travel-rule/transactions", {
      params: { limit },
    }),
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
