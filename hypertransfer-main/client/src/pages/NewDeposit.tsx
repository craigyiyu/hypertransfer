/**
 * NewDeposit — Start a new deposit session. Select asset and network.
 * Each deposit is treated as a session containing test + main deposit.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Check, AlertTriangle } from "lucide-react";
import {
  TRAVEL_RULE_THRESHOLD_USD,
  ACTIVE_PHASE_ONE_ASSETS,
  formatNetworkRail,
  requiresTravelRule,
} from "@/lib/compliance";
import { getHKDEquivalent } from "@/lib/currency";
import { depositApi, type HexSafeNetwork } from "@/lib/api";

// USDC 项保留备 Phase 2；当前仅显示 ACTIVE_PHASE_ONE_ASSETS（最终流程 v1：仅 USDT）。
const ASSETS = [
  { id: "USDT", name: "Tether", symbol: "USDT", color: "#26A17B" },
  { id: "USDC", name: "USD Coin", symbol: "USDC", color: "#2775CA" },
];
const ACTIVE_ASSETS = ASSETS.filter((asset) =>
  (ACTIVE_PHASE_ONE_ASSETS as readonly string[]).includes(asset.id),
);

export default function NewDeposit() {
  const [, navigate] = useLocation();
  const { updateState, resetSession } = useDemo();
  const [selectedAsset, setSelectedAsset] = useState("USDT");
  const [selectedChainId, setSelectedChainId] = useState("");
  const [networks, setNetworks] = useState<HexSafeNetwork[]>([]);
  const [netLoading, setNetLoading] = useState(true);
  const [netConfigured, setNetConfigured] = useState(false);
  const [amount, setAmount] = useState("");

  // 网络选项真实取自 Hex Safe(supported_chains); 未配置/取不到 → 空, 不回退硬编码。
  useEffect(() => {
    let alive = true;
    depositApi.networks()
      .then(({ data }) => {
        if (!alive) return;
        setNetworks(data.networks ?? []);
        setNetConfigured(Boolean(data.configured));
      })
      .catch(() => { if (alive) { setNetworks([]); setNetConfigured(false); } })
      .finally(() => { if (alive) setNetLoading(false); });
    return () => { alive = false; };
  }, []);

  const selectedNet = networks.find((n) => n.chainId === selectedChainId);
  const selectedNetwork = selectedNet?.rail ?? "";
  const plannedAmount = parseFloat(amount.replace(/,/g, "")) || 0;
  const travelRuleRequired = requiresTravelRule(selectedAsset, plannedAmount);

  const handleContinue = async () => {
    resetSession();
    const cleanAmount = amount.replace(/,/g, "");
    updateState({
      selectedAsset,
      selectedNetwork,
      selectedMinConfirmations: selectedNet?.minConfirmations ?? null,
      mainDepositAmount: cleanAmount,
    });
    // 在后端建入金编排单(②KYC 闸门锚点 + ③真实发址)。失败(未部署/未登录/未过 KYC)→ 纯 demo 继续。
    try {
      const { data } = await depositApi.create({
        network: selectedNetwork,
        asset: selectedAsset,
        amountDecimal: cleanAmount,
      });
      updateState({ depositRequestId: data.requestId });
    } catch {
      updateState({ depositRequestId: "" });
    }
    navigate("/wallet-screening");
  };

  // DEMO ONLY: 没有 Hex Safe 实链时也能演示 —— 占位网络 + 默认金额, 直接进下一步。仅 DEV。
  const demoContinue = async () => {
    resetSession();
    const cleanAmount = amount.replace(/,/g, "") || "1000";
    updateState({
      selectedAsset,
      selectedNetwork: "tron",
      selectedMinConfirmations: null,
      mainDepositAmount: cleanAmount,
    });
    try {
      const { data } = await depositApi.create({ network: "tron", asset: selectedAsset, amountDecimal: cleanAmount });
      updateState({ depositRequestId: data.requestId });
    } catch {
      updateState({ depositRequestId: "" });
    }
    navigate("/wallet-screening");
  };

  const handleAmountChange = (value: string) => {
    const normalized = value.replace(/,/g, "");
    if (normalized === "") {
      setAmount("");
      return;
    }
    if (/^\d*\.?\d{0,6}$/.test(normalized)) {
      const [whole, decimal] = normalized.split(".");
      const formattedWhole = Number(whole || "0").toLocaleString("en-US");
      setAmount(decimal !== undefined ? `${formattedWhole}.${decimal}` : formattedWhole);
    }
  };

  return (
    <Shell showBack backTo="/dashboard" title="New Deposit" subtitle="Select asset and network for this transfer">
      <div className="space-y-6">
        {/* Asset Selection */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Select Asset</p>
          <div className="grid grid-cols-2 gap-2">
            {ACTIVE_ASSETS.map((asset) => (
              <button
                key={asset.id}
                onClick={() => {
                  setSelectedAsset(asset.id);
                  setSelectedChainId("");
                }}
                className={`rounded-xl p-3 flex items-center gap-3 border transition-all duration-200 ${
                  selectedAsset === asset.id
                    ? "border-gold/50 bg-gold/5"
                    : "border-border hover:border-border/80"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: asset.color }}
                >
                  {asset.symbol.charAt(0)}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">{asset.symbol}</p>
                  <p className="text-[10px] text-muted-foreground">{asset.name}</p>
                </div>
                {selectedAsset === asset.id && (
                  <Check className="w-4 h-4 text-gold ml-auto" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Network Selection — 真实来自 Hex Safe supported_chains(确认数为 Hex Safe 实际值) */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Network · provisioned by Hex Safe</p>
          {netLoading ? (
            <div className="rounded-xl border border-border/50 bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
              Loading supported networks from Hex Safe…
            </div>
          ) : networks.length === 0 ? (
            <div className="card-wine rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Deposit networks are provisioned by the custody provider (Hex Safe).{" "}
                {netConfigured
                  ? "No eligible network is currently available."
                  : "None are available in this environment yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {networks.map((net) => (
                <button
                  key={net.chainId}
                  onClick={() => setSelectedChainId(net.chainId)}
                  className={`w-full rounded-xl px-4 py-3 flex items-center justify-between border transition-all duration-200 ${
                    selectedChainId === net.chainId
                      ? "border-gold/50 bg-gold/5"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="text-left">
                    <p className="text-sm text-foreground">{formatNetworkRail(net.rail)} &middot; {net.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {net.minConfirmations != null ? `${net.minConfirmations} confirmations` : "confirmations per chain"} &middot; USDT token only
                    </p>
                    <p className="text-[10px] text-gold/70 mt-0.5">Chain ID {net.chainId} &middot; live from Hex Safe</p>
                  </div>
                  {selectedChainId === net.chainId && (
                    <Check className="w-4 h-4 text-gold" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Expected amount */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Expected Deposit Amount</Label>
          <div className="relative">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className="bg-input border-border h-12 rounded-xl text-base font-semibold pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gold font-medium">
              {selectedAsset}
            </span>
          </div>
          {plannedAmount > 0 && (
            <p className="text-xs text-muted-foreground">
              ≈ {getHKDEquivalent(plannedAmount, selectedAsset)}
            </p>
          )}
        </div>

        {/* Travel Rule notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${
            travelRuleRequired
              ? "bg-warning/10 border-warning/30"
              : "bg-secondary/20 border-border/40"
          }`}
        >
          <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${travelRuleRequired ? "text-warning" : "text-gold"}`} />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {travelRuleRequired ? (
              <>
                <span className="text-warning font-medium">Travel Rule required:</span> This deposit is at or above USD {TRAVEL_RULE_THRESHOLD_USD.toLocaleString()}. Compliance details must be accepted before Hex Safe address issuance.
              </>
            ) : (
              <>
                <span className="text-gold font-medium">Travel Rule adapter ready:</span> This session can proceed without Travel Rule unless policy changes, but the audit record is still kept by HyperTransfer.
              </>
            )}
          </p>
        </motion.div>

        {/* Network warning */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card-wine rounded-xl px-4 py-3 flex items-start gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-warning font-medium">Important:</span> Phase 1 is limited to Hex Trust recommended stablecoin routes. Unsupported networks stop before address issuance unless a manual exception is approved.
          </p>
        </motion.div>
      </div>

      <div className="mt-8">
        <button
          onClick={handleContinue}
          disabled={!selectedChainId || plannedAmount <= 0}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Continue to Wallet Screening
        </button>
        {/* DEMO ONLY: 无 Hex Safe 实链时也能往下走。仅 DEV 显示。 */}
        {import.meta.env.DEV && (
          <button
            onClick={() => void demoContinue()}
            className="w-full mt-3 rounded-xl py-3 text-xs font-semibold border border-dashed border-gold/40 bg-gold/5 text-gold hover:bg-gold/10 transition-all"
          >
            Demo: skip &amp; continue (no Hex Safe network needed)
          </button>
        )}
      </div>
    </Shell>
  );
}
