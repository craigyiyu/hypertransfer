/**
 * NewDeposit — Start a USDT deposit session and verify the source wallet in one flow.
 * Phase 1 only accepts USDT; wallet KYT and Travel Rule gates clear before address issuance.
 */
import { useEffect, useState } from "react";
import { useLocation } from "@/lib/wouter";
import { useDemo } from "@/contexts/DemoContext";
import { DEMO_AUTOFILL_EVENT } from "@/contexts/DemoModeContext";
import { useI18n } from "@/contexts/I18nContext";
import Shell from "@/components/Shell";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Scale,
  Search,
  Shield,
  XCircle,
} from "lucide-react";
import {
  TRAVEL_RULE_THRESHOLD_USD,
  formatNetworkRail,
  getPhaseOneNetworks,
  requiresTravelRule,
  type ActivePhaseOneAsset,
} from "@/lib/compliance";
import { getHKDEquivalent } from "@/lib/currency";
import { depositApi, paymentApi, transactionPackApi, type HexSafeNetwork } from "@/lib/api";
import {
  canPassTravelRuleGate,
  createTravelRuleRecord,
  mockTravelRuleProvider,
} from "@/lib/travel-rule";
import { depthExplanation, travelRuleDepthForHkd } from "@/lib/transaction-compliance";
import { sumsubApi } from "@/lib/sumsub";
import { toast } from "sonner";

type ScreeningState = "idle" | "scanning" | "passed" | "failed";

const SYSTEM_BENEFICIARY_ROUTE = "HyperTransfer custody deposit account";
const SYSTEM_PROVIDER_STRATEGY = "Sumsub Travel Rule adapter";

// Brand names (Binance / Coinbase / OKX / Crypto.com / Kraken) are kept as-is per
// project policy; the rest of the dropdown labels are translated via i18n keys.
// We render both value and label from this list so brand names and translated
// names stay aligned in the same Select menu.
const WALLET_PROVIDER_OPTIONS: { value: string; labelKey?: string }[] = [
  { value: "Customer self-hosted wallet", labelKey: "newDeposit.customerSelfHosted" },
  { value: "Binance" },
  { value: "Coinbase" },
  { value: "OKX" },
  { value: "Crypto.com" },
  { value: "Kraken" },
  { value: "Other VASP", labelKey: "newDeposit.otherVasp" },
  { value: "Unknown VASP", labelKey: "newDeposit.unknownVasp" },
];

const TRAVEL_RULE_DEMO_VALUES = {
  address: "One Central, Macau",
  city: "Macau",
  country: "mo",
  sourceOfFunds: "employment",
  originatorVasp: "Customer self-hosted wallet",
  beneficiaryVasp: SYSTEM_BENEFICIARY_ROUTE,
  provider: SYSTEM_PROVIDER_STRATEGY,
};

function networkToCryptoChain(network: string): string {
  const n = (network || "").toLowerCase();
  if (n.includes("tron")) return "TRON";
  if (n.includes("eth")) return "ETH";
  return network.toUpperCase();
}

function formatAmountInput(value: string) {
  const normalized = value.replace(/,/g, "");
  if (normalized === "") return "";
  if (!/^\d*\.?\d{0,6}$/.test(normalized)) return null;
  const [whole, decimal] = normalized.split(".");
  const formattedWhole = Number(whole || "0").toLocaleString("en-US");
  return decimal !== undefined ? `${formattedWhole}.${decimal}` : formattedWhole;
}

export default function NewDeposit() {
  const [, navigate] = useLocation();
  const { state, updateState, resetSession } = useDemo();
  const { t } = useI18n();
  const [selectedChainId, setSelectedChainId] = useState("");
  const [networks, setNetworks] = useState<HexSafeNetwork[]>([]);
  const [netLoading, setNetLoading] = useState(true);
  const [netConfigured, setNetConfigured] = useState(false);
  const [amount, setAmount] = useState(state.mainDepositAmount ? Number(state.mainDepositAmount).toLocaleString("en-US") : "");
  const [walletAddress, setWalletAddress] = useState(state.sourceWallet);
  const [screening, setScreening] = useState<ScreeningState>(state.screeningPassed ? "passed" : "idle");
  const [trAddress, setTrAddress] = useState(state.travelRuleInfo.address);
  const [trCity, setTrCity] = useState(state.travelRuleInfo.city);
  const [trCountry, setTrCountry] = useState(state.travelRuleInfo.country);
  const [sourceOfFunds, setSourceOfFunds] = useState(state.travelRuleInfo.sourceOfFunds);
  const [originatorVasp, setOriginatorVasp] = useState(
    state.travelRuleInfo.originatorVasp || TRAVEL_RULE_DEMO_VALUES.originatorVasp,
  );
  const [selectedAsset, setSelectedAsset] = useState<ActivePhaseOneAsset>(
    state.selectedAsset === "USDC" ? "USDC" : "USDT",
  );
  const [selectedAssetNetwork, setSelectedAssetNetwork] = useState<string>(() =>
    getPhaseOneNetworks(state.selectedAsset === "USDC" ? "USDC" : "USDT")[0]?.id ?? "ethereum",
  );
  const [submittingTravelRule, setSubmittingTravelRule] = useState(false);

  useEffect(() => {
    let alive = true;
    depositApi.networks()
      .then(({ data }) => {
        if (!alive) return;
        const nextNetworks = data.networks ?? [];
        setNetworks(nextNetworks);
        setNetConfigured(Boolean(data.configured));
        if (nextNetworks[0]) {
          setSelectedChainId(nextNetworks[0].chainId);
        }
      })
      .catch(() => {
        if (alive) {
          setNetworks([]);
          setNetConfigured(false);
        }
      })
      .finally(() => {
        if (alive) setNetLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const applyDemoValues = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, string>>).detail || {};
      const formattedAmount = formatAmountInput(detail.amount || "10000");
      if (formattedAmount) setAmount(formattedAmount);
      setWalletAddress(detail.walletAddress || "0x742d35Cc6634C0532925a3b844Bc9e7595f8bEb0");
      setTrAddress(detail.residentialAddress || TRAVEL_RULE_DEMO_VALUES.address);
      setTrCity(detail.city || TRAVEL_RULE_DEMO_VALUES.city);
      setTrCountry(TRAVEL_RULE_DEMO_VALUES.country);
      setSourceOfFunds(TRAVEL_RULE_DEMO_VALUES.sourceOfFunds);
      setOriginatorVasp(detail.originatorVasp || TRAVEL_RULE_DEMO_VALUES.originatorVasp);
    };

    window.addEventListener(DEMO_AUTOFILL_EVENT, applyDemoValues);
    return () => window.removeEventListener(DEMO_AUTOFILL_EVENT, applyDemoValues);
  }, []);

  const assetNetworks = getPhaseOneNetworks(selectedAsset);
  const plannedAmount = parseFloat(amount.replace(/,/g, "")) || 0;
  const travelRuleRequired = requiresTravelRule(selectedAsset, plannedAmount);
  const useDemoNetwork = !netLoading && networks.length === 0;
  // 资产驱动网络: 配置了真实链时用所选资产支持的 rail; 否则 demo rail。
  const effectiveNetwork = netConfigured ? selectedAssetNetwork : useDemoNetwork ? "demo" : selectedAssetNetwork;
  const selectedConfirmations =
    assetNetworks.find((n) => n.id === selectedAssetNetwork)?.confirmations ?? null;
  const canScreen =
    plannedAmount > 0 &&
    walletAddress.trim().length > 0 &&
    !netLoading &&
    (netConfigured || useDemoNetwork || Boolean(networks.length));
  const canSubmitTravelRule = Boolean(trAddress && trCity && trCountry && sourceOfFunds && originatorVasp);
  const travelRuleGatePassed = canPassTravelRuleGate(state.travelRuleStatus, travelRuleRequired);

  const handleAmountChange = (value: string) => {
    const formatted = formatAmountInput(value);
    if (formatted !== null) setAmount(formatted);
  };

  const handleScreen = async () => {
    if (!canScreen) return;
    const cleanAmount = amount.replace(/,/g, "");
    const sourceWallet = walletAddress.trim();
    const nextNetwork = effectiveNetwork;

    resetSession();
    setScreening("scanning");
    updateState({
      selectedAsset: selectedAsset,
      selectedNetwork: nextNetwork,
      selectedMinConfirmations: selectedConfirmations,
      mainDepositAmount: cleanAmount,
      sourceWallet,
      depositRequestId: "",
      screeningPassed: false,
      travelRuleComplete: false,
      travelRuleStatus: "travel_rule_required",
    });

    let requestId = "";
    if (nextNetwork !== "demo") {
      try {
        const { data } = await depositApi.create({
          network: nextNetwork,
          asset: selectedAsset,
          amountDecimal: cleanAmount,
        });
        requestId = data.requestId;
        updateState({ depositRequestId: requestId });
      } catch {
        requestId = "";
      }
    }

    let decision: "pass" | "fail" = sourceWallet.toLowerCase().startsWith("bad") ? "fail" : "pass";
    if (requestId) {
      try {
        const { data } = await depositApi.screen(requestId, sourceWallet);
        decision = data.screeningStatus === "pass" ? "pass" : "fail";
      } catch {
        /* 后端不可用 → 回退 mock decision */
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (decision === "pass") {
      setScreening("passed");
      updateState({
        screeningPassed: true,
        travelRuleComplete: !travelRuleRequired,
        travelRuleStatus: "travel_rule_required",
      });
      // ⑦ Host-led admission: 后端 pack 流(创建 intent + 来源分类 + 实际确认 + verification pack)。
      // 未绑定 admission case / 后端不可用时静默回退 legacy flow。
      try {
        const intentRes = await paymentApi.createIntent({
          asset: selectedAsset,
          network: effectiveNetwork,
          intendedAmount: cleanAmount,
        });
        const intentId = intentRes.data.intent.id;
        await paymentApi.classifySource(intentId, {
          sourceType: "wallet",
          sourceIdentifier: sourceWallet,
          jurisdiction: "HK",
        });
        const confirm = await paymentApi.confirmActual(intentId, {
          asset: selectedAsset,
          network: effectiveNetwork,
          actualAmount: cleanAmount,
          sourceType: "wallet",
          sourceIdentifier: sourceWallet,
        });
        // 验证款(1 USDT)是独立的 basic pack —— 即使主款跨阈值。
        const packRes = await paymentApi.createPack(intentId, {
          transferLeg: "verification",
          actualAmount: "1",
          actualHkdAmount: "8",
        });
        updateState({
          paymentIntentId: intentId,
          compliancePackId: packRes.data.pack.id,
        });
        if (confirm.data.requiresRevalidation) {
          toast.info("The payment changed versus the pre-check — the compliance pack will be re-validated.");
        }
      } catch {
        /* 未绑定 case 或后端不可用: 沿用 legacy demo flow */
      }
    } else {
      setScreening("failed");
      updateState({ screeningPassed: false });
    }
  };

  const handleRetryWallet = () => {
    setScreening("idle");
    updateState({
      screeningPassed: false,
      travelRuleComplete: false,
      travelRuleStatus: "travel_rule_required",
    });
  };

  const handleTravelRuleSubmit = async () => {
    if (!canSubmitTravelRule || submittingTravelRule) return;
    setSubmittingTravelRule(true);
    const baseRecord = createTravelRuleRecord({
      patronName: state.patronName,
      sourceWallet: walletAddress.trim(),
      address: trAddress,
      city: trCity,
      country: trCountry,
      sourceOfFunds,
      originatorVasp,
      beneficiaryVasp: SYSTEM_BENEFICIARY_ROUTE,
      provider: SYSTEM_PROVIDER_STRATEGY,
      asset: selectedAsset,
      network: effectiveNetwork,
      amount: plannedAmount,
    });

    updateState({
      travelRuleStatus: "travel_rule_submitted",
      travelRuleRecord: baseRecord,
    });

    let status = baseRecord.status;
    let providerReference = baseRecord.providerReference;
    let rejectionReason = baseRecord.rejectionReason ?? "";
    let usedFallback = false;
    let fallbackNote = "";

    const demoRail = effectiveNetwork === "demo" || !netConfigured;
    let providerConfigured = false;
    if (!demoRail) {
      try {
        const { data } = await sumsubApi.config();
        providerConfigured = data.configured;
      } catch {
        providerConfigured = false;
      }
    }

    if (demoRail) {
      usedFallback = true;
      fallbackNote = "Local demo rail uses the Travel Rule demo adapter.";
    } else if (providerConfigured) {
      try {
        const { data } = await sumsubApi.travelRuleSubmit({
          direction: "out",
          amount: plannedAmount,
          currencyCode: selectedAsset,
          cryptoChain: networkToCryptoChain(effectiveNetwork),
          originatorWallet: walletAddress.trim(),
          counterpartyName: SYSTEM_BENEFICIARY_ROUTE,
          counterpartyWallet: state.depositAddress || "",
          counterpartyVasp: SYSTEM_BENEFICIARY_ROUTE,
        });
        if (data.status === "provider_not_enabled") {
          usedFallback = true;
          fallbackNote = "Travel Rule provider module is not enabled on the account; used demo adapter.";
        } else {
          status = data.status;
          providerReference = data.submittedTxnId || data.txnId;
        }
      } catch {
        usedFallback = true;
        fallbackNote = "Travel Rule provider call failed; used demo adapter.";
      }
    } else {
      usedFallback = true;
      fallbackNote = "Travel Rule provider is not configured; used demo adapter.";
    }

    if (usedFallback) {
      const providerRecord = await mockTravelRuleProvider.submit(baseRecord);
      status = providerRecord.status;
      providerReference = providerRecord.providerReference;
      rejectionReason = providerRecord.rejectionReason ?? "";
    }

    // ⑦ Host-led admission: 已有 compliance pack 时, 走 per-transfer pack 的 KYT + Travel Rule。
    if (state.paymentIntentId && state.compliancePackId) {
      try {
        const { data } = await transactionPackApi.screen(state.compliancePackId);
        const pack = data.pack;
        if (pack.travelRuleStatus === "accepted") {
          status = "travel_rule_accepted";
          providerReference = pack.notabeneReference;
        } else if (pack.travelRuleStatus === "manual_review") {
          status = "manual_review";
          rejectionReason = "The Travel Rule provider routed this transfer to manual review.";
        } else {
          status = "travel_rule_rejected";
          rejectionReason = "The Travel Rule provider rejected this transfer.";
        }
      } catch {
        /* 后端不可用 -> 保留 demo 结果 */
      }
    }

    const canPass = canPassTravelRuleGate(status, baseRecord.required);
    updateState({
      travelRuleComplete: canPass,
      travelRuleStatus: status,
      travelRuleRecord: { ...baseRecord, status, providerReference, rejectionReason },
      travelRuleInfo: {
        address: trAddress,
        city: trCity,
        country: trCountry,
        sourceOfFunds,
        originatorVasp,
        beneficiaryVasp: SYSTEM_BENEFICIARY_ROUTE,
        provider: SYSTEM_PROVIDER_STRATEGY,
        providerReference,
      },
    });

    setSubmittingTravelRule(false);
    if (usedFallback) {
      toast.message(t("newDeposit.demoAdapter"), { description: fallbackNote });
    }
    if (canPass) {
      toast.success(t("newDeposit.travelRuleAccepted"), { description: providerReference });
      navigate("/deposit-address");
    } else {
      toast.error(status === "manual_review" ? t("newDeposit.travelRuleManualReview") : t("newDeposit.travelRuleRejected"), {
        description: rejectionReason || t("newDeposit.contactSupport"),
      });
    }
  };

  const proceedAfterWalletApproval = () => {
    if (travelRuleRequired && !travelRuleGatePassed) return;
    navigate("/deposit-address");
  };

  return (
    <Shell showBack backTo="/dashboard" title={t("newDeposit.title")} subtitle={t("newDeposit.subtitle")}>
      <div className="space-y-5">
        <div className="card-gold rounded-xl p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("newDeposit.acceptedAsset")}</p>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-foreground">{t("newDeposit.selectAsset")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Phase 1 stablecoins: USDT (ERC-20 / TRC-20) and USDC (ERC-20). Deposit rails are provisioned by the custody provider.
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#26A17B] text-sm font-bold text-white">
              {selectedAsset === "USDT" ? "T" : "U"}
            </div>
          </div>

          <div className="flex gap-2">
            {(["USDT", "USDC"] as const).map((asset) => (
              <button
                key={asset}
                type="button"
                onClick={() => {
                  setSelectedAsset(asset);
                  setSelectedAssetNetwork(getPhaseOneNetworks(asset)[0]?.id ?? "ethereum");
                }}
                disabled={screening !== "idle"}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  selectedAsset === asset
                    ? "border-gold/50 bg-gold/10 text-gold"
                    : "border-border/60 bg-secondary/20 text-muted-foreground hover:border-gold/30"
                }`}
              >
                {asset}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("newDeposit.network")}</span>
            {assetNetworks.map((net) => (
              <button
                key={net.id}
                type="button"
                onClick={() => setSelectedAssetNetwork(net.id)}
                disabled={screening !== "idle"}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  selectedAssetNetwork === net.id
                    ? "border-gold/50 bg-gold/10 text-gold"
                    : "border-border/60 text-muted-foreground hover:border-gold/30"
                }`}
              >
                {formatNetworkRail(net.id)}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gold/70">
            {t("newDeposit.network")}: {netLoading ? "loading..." : formatNetworkRail(effectiveNetwork || "demo")}
            {!netLoading && !netConfigured && ` · ${t("newDeposit.demoRailNote")}`}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{t("newDeposit.depositAmount")}</Label>
          <div className="relative">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              disabled={screening !== "idle"}
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

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Search className="w-3 h-3" /> {t("newDeposit.sourceWalletAddress")}
          </Label>
          <Input
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder={t("newDeposit.walletPlaceholder")}
            disabled={screening !== "idle"}
            className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground/60">
            This is the wallet you will use to send your deposit. We verify it before issuing a deposit address.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {screening === "scanning" && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="card-gold rounded-xl p-5 flex flex-col items-center text-center"
            >
              <Loader2 className="w-8 h-8 text-gold animate-spin mb-3" />
              <p className="text-sm font-medium text-foreground">{t("newDeposit.screeningWallet")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("newDeposit.checking")}
              </p>
            </motion.div>
          )}

          {screening === "passed" && (
            <motion.div
              key="passed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-gold rounded-xl p-5 flex flex-col items-center text-center border-success/30"
            >
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
                <Shield className="w-6 h-6 text-success" />
              </div>
              <p className="text-sm font-semibold text-success">{t("newDeposit.walletApproved")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {travelRuleRequired ? t("newDeposit.travelRule") : " You may proceed to receive a deposit address."}
              </p>
              <div className="mt-3 px-3 py-1.5 rounded-lg bg-input">
                <code className="font-mono text-[10px] text-muted-foreground break-all">
                  {walletAddress}
                </code>
              </div>
            </motion.div>
          )}

          {screening === "failed" && (
            <motion.div
              key="failed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-gold rounded-xl p-5 flex flex-col items-center text-center border-destructive/30"
            >
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <XCircle className="w-6 h-6 text-destructive" />
              </div>
              <p className="text-sm font-semibold text-destructive">{t("newDeposit.screeningFailed")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("errors.screeningFailed")}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {screening === "passed" && travelRuleRequired && !travelRuleGatePassed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            <div className="card-gold rounded-xl px-4 py-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("newDeposit.travelRule")}</p>
              <p className="text-sm font-semibold text-foreground mt-1">
                {plannedAmount.toLocaleString()} USDT on {formatNetworkRail(effectiveNetwork)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                ≈ {getHKDEquivalent(plannedAmount, selectedAsset)}
              </p>
            </div>

            <div className="card-wine rounded-xl px-4 py-3 flex items-start gap-3">
              <Scale className="w-4 h-4 text-gold shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <p>
                  Every transfer — including the 1-unit verification transfer — carries its own
                  Travel Rule record. The exact final amount decides the field depth:{' '}
                  <span className="font-semibold text-foreground">
                    {travelRuleDepthForHkd(plannedAmount * 7.8) === "enhanced" ? t("newDeposit.travelRuleDepth.enhanced") : t("newDeposit.travelRuleDepth.basic")}
                  </span>{' '}
                  (HKD 8,000 threshold).
                </p>
                <p className="mt-1">
                  {depthExplanation(travelRuleDepthForHkd(plannedAmount * 7.8), plannedAmount * 7.8)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("newDeposit.residentialAddress")}</Label>
              <Input
                value={trAddress}
                onChange={(e) => setTrAddress(e.target.value)}
                placeholder={t("newDeposit.streetAddress")}
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("newDeposit.city")}</Label>
                <Input
                  value={trCity}
                  onChange={(e) => setTrCity(e.target.value)}
                  placeholder={t("newDeposit.city")}
                  className="bg-input border-border h-11 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("newDeposit.country")}</Label>
                <Select value={trCountry} onValueChange={(v) => setTrCountry(v ?? "")}>
                  <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                    <SelectValue placeholder={t("common.select")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="hk">{t("newDeposit.jurisdictions.hongKong")}</SelectItem>
                    <SelectItem value="mo">{t("newDeposit.jurisdictions.macau")}</SelectItem>
                    <SelectItem value="cn">{t("newDeposit.jurisdictions.china")}</SelectItem>
                    <SelectItem value="sg">{t("newDeposit.jurisdictions.singapore")}</SelectItem>
                    <SelectItem value="jp">{t("newDeposit.jurisdictions.japan")}</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("newDeposit.originatingVasp")}</Label>
              <Select value={originatorVasp} onValueChange={(v) => setOriginatorVasp(v ?? "")}>
                <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                  <SelectValue placeholder={t("newDeposit.selectWalletProvider")} />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {WALLET_PROVIDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.labelKey ? t(option.labelKey) : option.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                {t("newDeposit.sourceOfFunds")}
                <Info className="w-3 h-3 text-muted-foreground/50" />
              </Label>
              <Select value={sourceOfFunds} onValueChange={(v) => setSourceOfFunds(v ?? "")}>
                <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                  <SelectValue placeholder={t("newDeposit.selectSourceOfFunds")} />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="employment">{t("newDeposit.sourceFundsOptions.employment")}</SelectItem>
                  <SelectItem value="business">{t("newDeposit.sourceFundsOptions.business")}</SelectItem>
                  <SelectItem value="investment">{t("newDeposit.sourceFundsOptions.investment")}</SelectItem>
                  <SelectItem value="savings">{t("newDeposit.sourceFundsOptions.savings")}</SelectItem>
                  <SelectItem value="inheritance">{t("newDeposit.sourceFundsOptions.inheritance")}</SelectItem>
                  <SelectItem value="other">{t("newDeposit.sourceFundsOptions.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        )}
      </div>

      <div className="mt-8">
        {screening === "idle" && (
          <button
            onClick={handleScreen}
            disabled={!canScreen}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t("newDeposit.submitForScreening")}
          </button>
        )}
        {screening === "passed" && travelRuleRequired && !travelRuleGatePassed && (
          <button
            onClick={handleTravelRuleSubmit}
            disabled={!canSubmitTravelRule || submittingTravelRule}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submittingTravelRule ? t("newDeposit.submitting") : t("newDeposit.submitTravelRule")}
          </button>
        )}
        {screening === "passed" && (!travelRuleRequired || travelRuleGatePassed) && (
          <button
            onClick={proceedAfterWalletApproval}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
          >
            {t("newDeposit.getDepositAddress")}
            <CheckCircle2 className="w-4 h-4" />
          </button>
        )}
        {screening === "failed" && (
          <button
            onClick={handleRetryWallet}
            className="w-full rounded-xl py-4 text-sm font-medium border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all duration-200"
          >
            {t("newDeposit.tryDifferentWallet")}
          </button>
        )}
      </div>
    </Shell>
  );
}
