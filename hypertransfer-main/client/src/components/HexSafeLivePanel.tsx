/**
 * HexSafeLivePanel — 真实 Hex Safe(Hex Trust) sandbox 托管面板(staff/casino-ops 用)。
 *
 * 调后端 /api/hexsafe/*(staff/custodian 角色守卫): health / vaults / transactions /
 * 生成入金地址 / 提现。边界: Hex Safe 只做托管/发址/到账/提现; KYC + Travel Rule 走 Sumsub。
 * 自包含(自带样式), 由 CasinoOpsPortal 直接渲染, 不污染其内部组件。
 */
import { useCallback, useEffect, useState } from "react";
import { RadioTower, RefreshCw, KeyRound, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  apiError,
  hexsafeApi,
  type HexSafeHealth,
  type HexSafeVault,
  type HexSafeAddress,
} from "@/lib/api";

// Phase 1 稳定币 rail 的 sandbox testnet 链(chainId 来自 GET /supported_chains)
const CHAIN_OPTIONS = [
  { id: "11155111", label: "Sepolia (EVM, ERC-20)" },
  { id: "tron:nile", label: "Tron Nile (TRC-20)" },
  { id: "80002", label: "Amoy (EVM, ERC-20)" },
];

function Pill({ children, tone = "neutral" }: { children: string; tone?: "success" | "warning" | "danger" | "neutral" }) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "warning"
      ? "border-warning/30 bg-warning/10 text-warning"
      : tone === "danger"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-border/50 bg-secondary/30 text-muted-foreground";
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function healthTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "live") return "success";
  if (status === "configured" || status === "configured_but_unreachable") return "warning";
  if (status === "missing_credentials") return "danger";
  return "neutral";
}

export default function HexSafeLivePanel() {
  const [health, setHealth] = useState<HexSafeHealth | null>(null);
  const [vaults, setVaults] = useState<HexSafeVault[]>([]);
  const [txCount, setTxCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 生成入金地址
  const [chainId, setChainId] = useState<string>("11155111");
  const [addr, setAddr] = useState<HexSafeAddress | null>(null);
  const [addrBusy, setAddrBusy] = useState(false);

  // 提现(真实资金动作)
  const [wd, setWd] = useState({ ticker: "USDT", chainId: "11155111", amountDecimal: "", fromAddress: "", toAddress: "" });
  const [wdBusy, setWdBusy] = useState(false);
  const [wdMsg, setWdMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const h = await hexsafeApi.health();
      setHealth(h.data);
      if (h.data.configured && h.data.status === "live") {
        const [v, t] = await Promise.all([hexsafeApi.vaults(), hexsafeApi.transactions()]);
        setVaults(v.data.vaultList ?? []);
        setTxCount((t.data.transactionList ?? []).length);
      } else {
        setVaults([]);
        setTxCount(null);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generateAddress = async () => {
    setAddrBusy(true);
    try {
      const res = await hexsafeApi.createDepositAddress({ chainId });
      setAddr(res.data);
      toast.success("Deposit address issued", { description: res.data.address });
    } catch (err) {
      toast.error("Issue address failed", { description: apiError(err) });
    } finally {
      setAddrBusy(false);
    }
  };

  const submitWithdrawal = async () => {
    if (!wd.amountDecimal || !wd.fromAddress || !wd.toAddress) {
      setWdMsg("Amount, from, and to are required.");
      return;
    }
    setWdBusy(true);
    setWdMsg("");
    try {
      const res = await hexsafeApi.withdrawal(wd);
      setWdMsg(`Submitted (idempotencyKey ${res.data.idempotencyKey}). Release awaits Hex Safe approval/quorum.`);
      toast.success("Withdrawal submitted to Hex Safe");
    } catch (err) {
      // 余额不足/审批等业务层错误是预期的(测试 vault 余额 0)
      setWdMsg(apiError(err));
    } finally {
      setWdBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
            <RadioTower className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Hex Safe — Live Custody (Sandbox)
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">Real /api/hexsafe · address · transactions · payout</h2>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-gold/30 hover:text-gold disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Health */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {health ? (
          <>
            <Pill tone={healthTone(health.status)}>{health.status}</Pill>
            <span className="text-muted-foreground">{health.baseUrl}</span>
            {typeof health.vaultCount === "number" && (
              <span className="text-muted-foreground">· {health.vaultCount} vault(s)</span>
            )}
            {health.defaultVaultId && (
              <span className="text-muted-foreground">· default vault {health.defaultVaultId.slice(0, 8)}…</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">{loading ? "Loading Hex Safe status…" : "—"}</span>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      {health && !health.configured && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Hex Safe credentials are not configured on the backend (set HEXSAFE_API_KEY + private key). Read/write actions are disabled.
        </p>
      )}

      {health?.configured && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Vaults + transactions */}
          <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">WTA Vaults</p>
            {vaults.length === 0 ? (
              <p className="text-muted-foreground">No vaults.</p>
            ) : (
              <ul className="space-y-1">
                {vaults.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="text-foreground">{v.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{v.type}</span>
                      <Pill tone={v.status === "active" ? "success" : "neutral"}>{v.status}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              On-chain monitoring = polling (sandbox has no webhook registration API). Transactions in vault:{" "}
              <span className="font-semibold text-foreground">{txCount ?? "—"}</span>
            </p>
          </div>

          {/* Generate deposit address */}
          <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4 text-sm">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5" /> Issue Deposit Address
            </p>
            <select
              value={chainId}
              onChange={(e) => setChainId(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground"
            >
              {CHAIN_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => void generateAddress()}
              disabled={addrBusy}
              className="w-full rounded-lg bg-gold/90 px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-gold disabled:opacity-50"
            >
              {addrBusy ? "Issuing…" : "Generate address"}
            </button>
            {addr && (
              <p className="break-all rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                {addr.chainId}: {addr.address}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Address is fixed per vault×chain (not single-use). Prod gating: KYC(Sumsub)+KYT+Travel Rule(Sumsub)+TK Team approval before issuance.
            </p>
          </div>

          {/* Withdrawal / payout */}
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm lg:col-span-2">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-destructive">
              <SendHorizontal className="h-3.5 w-3.5" /> Withdrawal / Refund (real fund action — release via Hex Safe approval/quorum)
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={wd.ticker}
                onChange={(e) => setWd({ ...wd, ticker: e.target.value })}
                placeholder="ticker (USDT)"
                className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              />
              <input
                value={wd.chainId}
                onChange={(e) => setWd({ ...wd, chainId: e.target.value })}
                placeholder="chainId (11155111)"
                className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              />
              <input
                value={wd.amountDecimal}
                onChange={(e) => setWd({ ...wd, amountDecimal: e.target.value })}
                placeholder="amount"
                className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              />
              <input
                value={wd.fromAddress}
                onChange={(e) => setWd({ ...wd, fromAddress: e.target.value })}
                placeholder="from (vault address)"
                className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm sm:col-span-3"
              />
              <input
                value={wd.toAddress}
                onChange={(e) => setWd({ ...wd, toAddress: e.target.value })}
                placeholder="to (customer's previously-verified wallet)"
                className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm sm:col-span-3"
              />
            </div>
            <button
              onClick={() => void submitWithdrawal()}
              disabled={wdBusy}
              className="rounded-lg border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              {wdBusy ? "Submitting…" : "Submit withdrawal"}
            </button>
            {wdMsg && <p className="break-all text-xs text-muted-foreground">{wdMsg}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
