/**
 * ops-ui — casino-ops 后台面板共用的小型展示组件(Pill / Field / ActionBtn / 头部)。
 * 黑金风, 与 HexSafeLivePanel / RefundQueuePanel 视觉一致。
 */
import type { ComponentType, InputHTMLAttributes, ReactNode } from "react";
import { RefreshCw } from "lucide-react";

export type Tone = "success" | "warning" | "danger" | "neutral";

/**
 * LabeledInput — 表单输入框 + **上方字段名标签**(取代只把字段名放进 placeholder 的写法)。
 * `containerClassName` 用于 grid col-span 等布局; `className` 透传到 <input>。
 */
export function LabeledInput({
  label,
  className = "",
  containerClassName = "",
  ...props
}: { label: string; containerClassName?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`flex flex-col gap-1 ${containerClassName}`}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        {...props}
        className={`rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/50 ${className}`}
      />
    </label>
  );
}

export function Pill({ children, tone = "neutral" }: { children: string; tone?: Tone }) {
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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-background/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-foreground">{children}</p>
    </div>
  );
}

export function ActionBtn({
  children,
  onClick,
  disabled,
  icon: Icon,
  tone = "neutral",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
}) {
  const cls =
    tone === "success"
      ? "border-success/40 text-success hover:bg-success/10"
      : tone === "warning"
      ? "border-warning/40 text-warning hover:bg-warning/10"
      : tone === "danger"
      ? "border-destructive/40 text-destructive hover:bg-destructive/10"
      : "border-border/60 text-muted-foreground hover:border-gold/30 hover:text-gold";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

export function PanelHeader({
  icon: Icon,
  eyebrow,
  title,
  onRefresh,
  refreshing,
}: {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2>
        </div>
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-gold/30 hover:text-gold disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      )}
    </div>
  );
}

export function shortAddr(a: string | null | undefined) {
  if (!a) return "—";
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}
