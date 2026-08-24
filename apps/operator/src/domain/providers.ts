import type {
  DepositAddress,
  DepositRequest,
  PayoutRequest,
  ScreeningDecision,
  TransactionScreening,
  TravelRuleSubmission,
  WalletScreening,
} from "./types";

export type ScreeningProvider = {
  screenWallet(deposit: DepositRequest): WalletScreening;
};

export type TransactionKytProvider = {
  screenTransaction(deposit: DepositRequest, txHash: string): TransactionScreening;
};

export type TravelRuleProvider = {
  submitTravelRule(deposit: DepositRequest, submission: TravelRuleSubmission): TravelRuleSubmission;
};

export type AddressProvider = {
  issueAddress(deposit: DepositRequest): DepositAddress;
};

export type ChainMonitorProvider = {
  getMonitoringState(deposit: DepositRequest): "awaiting_funds" | "confirming" | "confirmed" | "exception";
};

export type PayoutProvider = {
  submitWithdrawal(payout: PayoutRequest): { traceId: string; status: string };
};

/**
 * Hex Safe REST API 真实端点映射（正式接入时替换 mock 实现）
 *
 * Base URL: https://api.hexsafe.hextrust.com
 * Auth: x-api-key: hsk_xxx  +  Authorization: Bearer <ES256-signed JWT>
 * JWT claims: api-key, nonce, uri, exp, digest（POST/PUT 时）
 *
 * 核心端点：
 *   GET  /vaults                              → 列出所有 vault（WTA vault 列表）
 *   GET  /vaults/{vaultId}                    → 查询单个 vault
 *   POST /vaults/{vaultId}/address            → 生成入金地址（单次/永久/BTC 多类型）
 *   GET  /vaults/{vaultId}/addresses          → 列出 vault 所有地址
 *   GET  /vaults/{vaultId}/whitelist          → 出金白名单地址
 *   GET  /transactions                        → 列出交易
 *   GET  /transactions/{traceId}              → 查询单笔交易（到账监听）
 *   POST /transactions/withdrawal             → 发起出金（payout/refund）
 *   POST /transactions/{chain}                → 链上转账（EVM/BTC/TRON/COSMOS/XRPL/Solana/TON）
 *   GET  /deposit/{txHash}                    → 按 txHash 查询入金
 *   POST /deposit/submit_travel_rule_details  → 提交 Travel Rule 信息
 *   GET  /deposit/travel_rule/{traceId}       → 查询 Travel Rule 状态
 *   GET  /travel_rule/vasp                    → VASP 目录（counterparty VASP 查询）
 *   GET  /supported_chains                    → 支持的区块链
 *   GET  /supported_assets                    → 支持的资产
 *   GET  /counterparty                        → Counterparty Book（出金白名单管理）
 *   POST /counterparty                        → 新增 counterparty
 *   POST /counterparty/address/verify         → 验证 counterparty 地址
 *
 * 幂等性: POST 发起交易时加 x-request-id 头（UUID），重发同一值返回原结果
 */
export type HexSafeProvider = AddressProvider &
  PayoutProvider & {
    getVaults(): { vaultId: string; name: string; asset: string; network: string; balance: number }[];
    getTransaction(traceId: string): { traceId: string; status: string; amount: number; txHash?: string };
    submitTravelRuleDetails(
      txHash: string,
      originatorName: string,
      originatorAccount: string,
      beneficiaryName: string,
      beneficiaryVasp: string,
    ): { traceId: string; status: string };
  };

function inferDecision(walletAddress: string): ScreeningDecision {
  const normalized = walletAddress.toLowerCase();

  if (normalized.includes("fail") || normalized.includes("sanction")) {
    return "fail";
  }

  if (normalized.includes("edd") || normalized.includes("review")) {
    return "edd";
  }

  return "pass";
}

export const mockScreeningProvider: ScreeningProvider = {
  screenWallet(deposit) {
    const decision = inferDecision(deposit.walletAddress);
    const profile = {
      pass: {
        score: 18,
        level: "low" as const,
        sanctionedHit: false,
        hopCount: 1,
        taintedExposurePercent: 0.2,
        summary: "No sanctions exposure detected. Minor exchange cluster exposure only.",
      },
      edd: {
        score: 64,
        level: "medium" as const,
        sanctionedHit: false,
        hopCount: 3,
        taintedExposurePercent: 4.8,
        summary: "Indirect mixer exposure detected within three hops. EDD review required.",
      },
      fail: {
        score: 92,
        level: "critical" as const,
        sanctionedHit: true,
        hopCount: 1,
        taintedExposurePercent: 18.5,
        summary: "Sanctions or high-risk cluster proximity detected. Deposit must be blocked.",
      },
    }[decision];

    return {
      id: `screen-${deposit.id}`,
      depositId: deposit.id,
      walletAddress: deposit.walletAddress,
      network: deposit.network,
      decision,
      ...profile,
    };
  },
};

export const mockTravelRuleProvider: TravelRuleProvider = {
  submitTravelRule(deposit, submission) {
    return {
      ...submission,
      id: `tr-${deposit.id}`,
      depositId: deposit.id,
      status: "submitted",
      submittedAt: new Date().toISOString(),
    };
  },
};

export const mockAddressProvider: AddressProvider = {
  issueAddress(deposit) {
    const suffix = deposit.id.replace(/[^a-z0-9]/gi, "").slice(-8).padStart(8, "0");
    const prefix = deposit.network === "TRON" ? "T" : deposit.network === "Bitcoin" ? "bc1q" : "0x";

    return {
      id: `addr-${deposit.id}`,
      depositId: deposit.id,
      address: `${prefix}${suffix}operatorvaonetimeaddress`,
      provider: "Mock HT Custody Adapter",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
      voided: false,
    };
  },
};

export const mockChainMonitorProvider: ChainMonitorProvider = {
  getMonitoringState(deposit) {
    if (deposit.status === "settled") {
      return "confirmed";
    }

    if (deposit.status === "exception") {
      return "exception";
    }

    return deposit.status === "monitoring" ? "confirming" : "awaiting_funds";
  },
};

// MOCK: 到账后 Transaction KYT（Step 5）
// 真实接入时：POST /deposit/submit_travel_rule_details，再轮询 GET /transactions/{traceId} 结果
// 决策逻辑与 pre-deposit 独立；此 mock 用 deposit.id 尾数奇偶模拟 Clear / Dirty 两种路径
export const mockTransactionKytProvider: TransactionKytProvider = {
  screenTransaction(deposit, txHash) {
    const lastChar = deposit.id.slice(-1);
    const isDirty = lastChar === "3" || lastChar === "7";

    return {
      id: `txkyt-${deposit.id}`,
      depositId: deposit.id,
      txHash,
      fromAddress: deposit.walletAddress,
      toAddress: deposit.depositAddress?.address ?? "unknown",
      amount: deposit.amount,
      asset: deposit.asset,
      riskScore: isDirty ? 88 : 12,
      sanctionedHit: isDirty,
      taintedExposurePercent: isDirty ? 22.4 : 0.1,
      decision: isDirty ? "dirty" : "clear",
      reason: isDirty
        ? "Incoming transaction contains high tainted exposure. Funds must be blocked."
        : "Transaction cleared. No sanctions hit, minimal tainted exposure.",
      screenedAt: new Date().toISOString(),
    };
  },
};

// MOCK: 出金 / Payout（Step: Refund flow）
// 真实接入时：POST /transactions/withdrawal，返回 traceId，再轮询 GET /transactions/{traceId}
export const mockPayoutProvider: PayoutProvider = {
  submitWithdrawal(payout) {
    return {
      traceId: `ht-payout-${payout.id}`,
      status: "pending_approval",
    };
  },
};
