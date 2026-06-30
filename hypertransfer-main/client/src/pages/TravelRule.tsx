/**
 * TravelRule — Collects FATF Travel Rule data (originator info).
 * Triggered before Hex Safe address issuance when threshold or policy requires it.
 * HyperTransfer owns this gate even when the external messaging provider changes.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scale, Info, ShieldCheck } from "lucide-react";
import {
  TRAVEL_RULE_PROVIDER_OPTIONS,
  TRAVEL_RULE_THRESHOLD_USD,
  requiresTravelRule,
} from "@/lib/compliance";
import { getHKDEquivalent } from "@/lib/currency";
import {
  canPassTravelRuleGate,
  createTravelRuleRecord,
  mockTravelRuleProvider,
} from "@/lib/travel-rule";
import { sumsubApi } from "@/lib/sumsub";
import { toast } from "sonner";

// 客户端网络代号 → Sumsub cryptoParams.cryptoChain（Phase 1 仅稳定币 rail）
function networkToCryptoChain(network: string): string {
  const n = (network || "").toLowerCase();
  if (n.includes("tron")) return "TRON";
  if (n.includes("eth")) return "ETH";
  return network.toUpperCase();
}

export default function TravelRule() {
  const [, navigate] = useLocation();
  const { state, updateState } = useDemo();
  const [address, setAddress] = useState(state.travelRuleInfo.address);
  const [city, setCity] = useState(state.travelRuleInfo.city);
  const [country, setCountry] = useState(state.travelRuleInfo.country);
  const [sourceOfFunds, setSourceOfFunds] = useState(state.travelRuleInfo.sourceOfFunds);
  const [originatorVasp, setOriginatorVasp] = useState(state.travelRuleInfo.originatorVasp);
  const [beneficiaryVasp, setBeneficiaryVasp] = useState(state.travelRuleInfo.beneficiaryVasp);
  const [provider, setProvider] = useState(state.travelRuleInfo.provider);
  const [submitting, setSubmitting] = useState(false);
  const plannedAmount = parseFloat(state.mainDepositAmount) || 0;
  const travelRuleRequired = requiresTravelRule(state.selectedAsset, plannedAmount);

  const canSubmit = address && city && country && sourceOfFunds && originatorVasp && beneficiaryVasp && provider;

  const handleSubmit = async () => {
    setSubmitting(true);
    const baseRecord = createTravelRuleRecord({
      patronName: state.patronName,
      sourceWallet: state.sourceWallet,
      address,
      city,
      country,
      sourceOfFunds,
      originatorVasp,
      beneficiaryVasp,
      provider,
      asset: state.selectedAsset,
      network: state.selectedNetwork,
      amount: plannedAmount,
    });

    updateState({
      travelRuleStatus: baseRecord.required ? "travel_rule_submitted" : "not_required",
      travelRuleRecord: baseRecord,
    });

    // 口径: TR 走 Sumsub。优先调真实 Sumsub Travel Rule;若账户未启用 TR 模块
    // (provider_not_enabled) 或后端报错, 回退到本地 demo adapter 并如实提示, 保证 demo 不中断。
    let status = baseRecord.status;
    let providerReference = baseRecord.providerReference;
    let rejectionReason = baseRecord.rejectionReason ?? "";
    let usedFallback = false;
    let fallbackNote = "";

    try {
      const { data } = await sumsubApi.travelRuleSubmit({
        direction: "out",
        amount: plannedAmount,
        currencyCode: state.selectedAsset,
        cryptoChain: networkToCryptoChain(state.selectedNetwork),
        originatorWallet: state.sourceWallet,
        counterpartyName: beneficiaryVasp,
        counterpartyWallet: state.depositAddress || "",
        counterpartyVasp: beneficiaryVasp,
      });
      if (data.status === "provider_not_enabled") {
        usedFallback = true;
        fallbackNote = "Sumsub Travel Rule module not enabled on the account; used demo adapter.";
      } else {
        status = data.status;
        providerReference = data.submittedTxnId || data.txnId;
      }
    } catch {
      usedFallback = true;
      fallbackNote = "Sumsub Travel Rule call failed; used demo adapter.";
    }

    if (usedFallback) {
      const providerRecord = await mockTravelRuleProvider.submit(baseRecord);
      status = providerRecord.status;
      providerReference = providerRecord.providerReference;
      rejectionReason = providerRecord.rejectionReason ?? "";
    }

    const canPass = canPassTravelRuleGate(status, baseRecord.required);

    updateState({
      travelRuleComplete: canPass,
      travelRuleStatus: status,
      travelRuleRecord: { ...baseRecord, status, providerReference, rejectionReason },
      travelRuleInfo: {
        address,
        city,
        country,
        sourceOfFunds,
        originatorVasp,
        beneficiaryVasp,
        provider,
        providerReference,
      },
    });

    setSubmitting(false);

    if (usedFallback) {
      toast.message("Travel Rule (demo adapter)", { description: fallbackNote });
    }

    if (canPass) {
      toast.success("Travel Rule gate accepted", { description: providerReference });
      // 若已发址 / 已过 1 USDT 验证步骤(从 main_input 的"Proceed"绕到 TR 这里), 直接回主入金,
      // 不要再弹回 /deposit-address 那个"先发 1 USDT"说明页 —— 用户已经验证过了。
      const alreadyInDepositSession = state.testPaymentConfirmed || Boolean(state.depositAddress);
      navigate(alreadyInDepositSession ? "/main-deposit" : "/deposit-address");
      return;
    }

    toast.error(status === "manual_review" ? "Manual review required" : "Travel Rule rejected", {
      description: rejectionReason,
    });
  };

  return (
    <Shell
      showBack
      backTo="/wallet-screening"
      title="Travel Rule Information"
      subtitle={travelRuleRequired ? "Required before custody address issuance" : "Optional audit record for this deposit session"}
    >
      <div className="space-y-5">
        <div className="card-gold rounded-xl px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            DepositRequest Gate
          </p>
          <p className="text-sm font-semibold text-foreground mt-1">
            {plannedAmount.toLocaleString()} {state.selectedAsset} on {state.selectedNetwork}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            ≈ {getHKDEquivalent(plannedAmount, state.selectedAsset)}
          </p>
        </div>

        {/* Info */}
        <div className="card-wine rounded-xl px-4 py-3 flex items-start gap-3">
          <Scale className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            HyperTransfer collects and gates Travel Rule data before requesting a Hex Safe deposit address. Hex Trust has Sumsub-powered Travel Rule capability, but this gate remains controlled by WML / HyperTransfer for the current Hong Kong Hex Trust Limited setup.
          </p>
        </div>

        {!travelRuleRequired && (
          <div className="rounded-xl px-4 py-3 bg-secondary/20 border border-border/40 flex items-start gap-3">
            <Info className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              This amount is below USD {TRAVEL_RULE_THRESHOLD_USD.toLocaleString()}, so Travel Rule messaging may not be mandatory for this session. Completing the record still strengthens audit readiness.
            </p>
          </div>
        )}

        {state.travelRuleRecord && (
          <div className="rounded-xl px-4 py-3 bg-secondary/20 border border-border/40">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Travel Rule State Machine
            </p>
            <p className="text-sm text-foreground font-semibold mt-1">
              {state.travelRuleStatus.replaceAll("_", " ")}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Provider ref: {state.travelRuleRecord.providerReference || "pending"}
            </p>
            {state.travelRuleRecord.rejectionReason && (
              <p className="text-xs text-warning mt-2">
                {state.travelRuleRecord.rejectionReason}
              </p>
            )}
          </div>
        )}

        {/* Residential Address */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Residential Address</Label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address"
            className="bg-input border-border h-11 rounded-xl text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">City</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="bg-input border-border h-11 rounded-xl text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="hk">Hong Kong</SelectItem>
                <SelectItem value="cn">China</SelectItem>
                <SelectItem value="sg">Singapore</SelectItem>
                <SelectItem value="jp">Japan</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Originating VASP / Wallet Provider</Label>
          <Input
            value={originatorVasp}
            onChange={(e) => setOriginatorVasp(e.target.value)}
            placeholder="e.g. Binance, Coinbase, private wallet"
            className="bg-input border-border h-11 rounded-xl text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Beneficiary Route</Label>
          <Input
            value={beneficiaryVasp}
            onChange={(e) => setBeneficiaryVasp(e.target.value)}
            placeholder="WML Logistics via Hex Trust / Hex Safe"
            className="bg-input border-border h-11 rounded-xl text-sm"
          />
          <p className="text-[10px] text-muted-foreground/60">
            This should be system-configured in production, not typed by an operator.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            Provider Strategy
            <ShieldCheck className="w-3 h-3 text-muted-foreground/50" />
          </Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
              <SelectValue placeholder="Select provider route" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {TRAVEL_RULE_PROVIDER_OPTIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Source of Funds */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            Source of Funds
            <Info className="w-3 h-3 text-muted-foreground/50" />
          </Label>
          <Select value={sourceOfFunds} onValueChange={setSourceOfFunds}>
            <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
              <SelectValue placeholder="Select source of funds" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="employment">Employment Income</SelectItem>
              <SelectItem value="business">Business Revenue</SelectItem>
              <SelectItem value="investment">Investment Returns</SelectItem>
              <SelectItem value="savings">Personal Savings</SelectItem>
              <SelectItem value="inheritance">Inheritance</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting to Sumsub Travel Rule..." : "Accept Gate & Request Hex Safe Address"}
        </button>
      </div>
    </Shell>
  );
}
