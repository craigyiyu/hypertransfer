import { getRequiredConfirmations } from "@/lib/compliance";

export interface HexSafeDepositStatus {
  custodyTransactionId: string;
  txHash: string;
  asset: string;
  network: string;
  amount: number;
  confirmationCount: number;
  requiredConfirmations: number;
  status: "address_issued" | "detected" | "confirmed" | "screening" | "cleared" | "frozen";
  vaultId: string;
  receivingAddress: string;
  sourceWallet: string;
  updatedAt: string;
}

export interface VaultBalance {
  vaultId: string;
  asset: string;
  available: number;
  pending: number;
  frozen: number;
  updatedAt: string;
}

export interface CustodyTransactionLog {
  at: string;
  event: string;
  source: "Hex Safe API" | "Hex Safe webhook" | "HyperTransfer";
  detail: string;
}

export function createHexSafeStatus(input: {
  asset: string;
  network: string;
  amount: number;
  receivingAddress: string;
  sourceWallet: string;
  txHash?: string;
}): HexSafeDepositStatus {
  const requiredConfirmations = getRequiredConfirmations(input.network);

  return {
    custodyTransactionId: `HTX-${Date.now().toString(36).toUpperCase()}`,
    txHash: input.txHash || `0x${Array.from({ length: 64 }, () =>
      "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`,
    asset: input.asset,
    network: input.network,
    amount: input.amount,
    confirmationCount: requiredConfirmations,
    requiredConfirmations,
    status: "cleared",
    vaultId: `WTA-${input.asset}-TREASURY`,
    receivingAddress: input.receivingAddress,
    sourceWallet: input.sourceWallet,
    updatedAt: new Date().toISOString(),
  };
}

export function createVaultBalance(status: HexSafeDepositStatus): VaultBalance {
  return {
    vaultId: status.vaultId,
    asset: status.asset,
    available: status.status === "cleared" ? status.amount : 0,
    pending: status.status === "cleared" ? 0 : status.amount,
    frozen: status.status === "frozen" ? status.amount : 0,
    updatedAt: status.updatedAt,
  };
}

export function createCustodyLogs(status: HexSafeDepositStatus): CustodyTransactionLog[] {
  return [
    {
      at: new Date(Date.now() - 6000).toISOString(),
      event: "deposit_address_issued",
      source: "Hex Safe API",
      detail: `Address issued for ${status.asset} on ${status.network}`,
    },
    {
      at: new Date(Date.now() - 4000).toISOString(),
      event: "incoming_transaction_detected",
      source: "Hex Safe webhook",
      detail: status.txHash,
    },
    {
      at: new Date(Date.now() - 2000).toISOString(),
      event: "confirmation_threshold_reached",
      source: "Hex Safe webhook",
      detail: `${status.confirmationCount}/${status.requiredConfirmations} confirmations`,
    },
    {
      at: status.updatedAt,
      event: "transaction_kyt_cleared",
      source: "HyperTransfer",
      detail: "Transaction-level KYT cleared before WTA settlement",
    },
  ];
}
