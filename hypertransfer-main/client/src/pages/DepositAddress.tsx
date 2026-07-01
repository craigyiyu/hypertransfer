/**
 * DepositAddress — Explains the verification deposit rule before exposing the address.
 * The actual address is shown in the Step 1 deposit session only.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { getHKDEquivalent } from "@/lib/currency";
import { formatNetworkRail, requiresTravelRule } from "@/lib/compliance";
import { canPassTravelRuleGate } from "@/lib/travel-rule";
import { depositApi } from "@/lib/api";

// Generate a mock deposit address based on network
function generateAddress(network: string): string {
  const chars = "0123456789abcdef";
  const rand = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const tronChars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const randTron = (len: number) =>
    Array.from({ length: len }, () => tronChars[Math.floor(Math.random() * tronChars.length)]).join("");
  switch (network) {
    case "tron": return "T" + randTron(33);
    default: return "0x" + rand(40);
  }
}

export default function DepositAddress() {
  const [, navigate] = useLocation();
  const { state, updateState } = useDemo();
  const [loading, setLoading] = useState(true);
  const plannedAmount = parseFloat(state.mainDepositAmount) || 0;
  const travelRuleRequired = requiresTravelRule(state.selectedAsset, plannedAmount);
  const kycApproved = state.kyc.status === "approved";
  const travelRuleGatePassed = canPassTravelRuleGate(
    state.travelRuleStatus,
    travelRuleRequired,
  );
  const canIssueAddress = kycApproved && state.screeningPassed && travelRuleGatePassed;
  const nextGateRoute = !kycApproved
    ? "/kyc"
    : !state.screeningPassed
    ? "/wallet-screening"
    : travelRuleRequired && !travelRuleGatePassed
    ? "/travel-rule"
    : "/wallet-screening";

  useEffect(() => {
    if (!canIssueAddress) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      // 真实: 有后端入金单 → Hex Safe 签发(地址按 vault×链固定); 否则回退本地占位地址。
      let addr = "";
      if (state.depositRequestId) {
        try {
          // 回填前端 TR gate 结果: ≥USD1k 的单后端需要 'travel_rule_accepted' 才放行发址。
          const { data } = await depositApi.issueAddress(state.depositRequestId, state.travelRuleStatus);
          addr = data.depositAddress;
        } catch {
          /* 后端不可用 / gate 未过 → 回退本地占位 */
        }
      }
      if (!addr) {
        await new Promise((resolve) => setTimeout(resolve, 1500)); // demo: 模拟托管发址延时
        addr = generateAddress(state.selectedNetwork);
      }
      if (alive) {
        updateState({ depositAddress: addr });
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canIssueAddress, state.selectedNetwork]);

  return (
    <Shell showBack backTo="/wallet-screening" title="Deposit Verification" subtitle="Review the required first step">
      <div className="space-y-6">
        {/* Session info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="px-2 py-1 rounded-md bg-gold/10 text-gold font-mono text-[10px]">
            {state.selectedAsset}
          </div>
          <span>&middot;</span>
          <span>{formatNetworkRail(state.selectedNetwork)} rail</span>
          <span>&middot;</span>
          <span>{plannedAmount.toLocaleString()} expected</span>
        </div>

        {!canIssueAddress && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-wine rounded-xl px-4 py-4 border-warning/40"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-xs text-warning font-semibold uppercase tracking-wider">
                  Address blocked
                </p>
                <p className="text-sm text-foreground font-semibold">
                  Compliance gates must clear first
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Hex Safe address issuance is blocked until KYC is approved, source-wallet KYT passes, and the Travel Rule gate is accepted when required.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Important verification rule */}
        {canIssueAddress && <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-wine rounded-xl px-4 py-4 border-warning/40"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-xs text-warning font-semibold uppercase tracking-wider">
                Important
              </p>
              <p className="text-sm text-foreground font-semibold">
                Send only 1 {state.selectedAsset} first
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                For payment security, we ask you to make a <span className="text-gold font-medium">1 {state.selectedAsset}</span> verification deposit first (≈ {getHKDEquivalent("1", state.selectedAsset)}). Please do not send your full deposit amount until the verification transfer is confirmed.
              </p>
            </div>
          </div>
        </motion.div>}

        {/* Process rules */}
        {canIssueAddress && <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-gold rounded-xl p-5 space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-gold" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">How this deposit works</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                HyperTransfer requests the address through the Hex Safe API only after KYC, source-wallet KYT, and Travel Rule controls clear.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-gold/10 text-gold text-[10px] font-semibold flex items-center justify-center shrink-0">1</span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Send exactly <span className="text-foreground font-medium">1 {state.selectedAsset}</span> to verify the address and network.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-gold/10 text-gold text-[10px] font-semibold flex items-center justify-center shrink-0">2</span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Wait for confirmation. The 1 {state.selectedAsset} verification deposit will be credited to your account.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-gold/10 text-gold text-[10px] font-semibold flex items-center justify-center shrink-0">3</span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                After verification, enter and send your full deposit amount.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-secondary/20 px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <p className="text-[10px] text-muted-foreground">
              Address details are hidden until the next step to prevent accidental full-amount transfers.
            </p>
          </div>
        </motion.div>}
      </div>

      <div className="mt-8">
        {canIssueAddress ? (
          <button
            onClick={() => navigate("/main-deposit")}
            disabled={loading}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? "Preparing Hex Safe Address..." : "Continue to Verification Deposit"}
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => navigate(nextGateRoute)}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
            >
              Complete Required Gate
              <ArrowRight className="w-4 h-4" />
            </button>
            {/* DEMO: 跳过 KYC/KYT/Travel Rule 闸门放行发址。仅 demo 占位网络(NewDeposit demoContinue)显示, 线上 demo 也生效。 */}
            {state.selectedNetwork === "demo" && (
              <button
                onClick={() =>
                  updateState({
                    kyc: { ...state.kyc, status: "approved" },
                    screeningPassed: true,
                    travelRuleStatus: "travel_rule_accepted",
                  })
                }
                className="w-full rounded-xl py-3 text-xs font-semibold border border-dashed border-gold/40 bg-gold/5 text-gold hover:bg-gold/10 transition-all"
              >
                Demo: skip gates &amp; issue address
              </button>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
