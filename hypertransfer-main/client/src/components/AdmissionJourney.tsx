/**
 * AdmissionJourney — VIP 端统一旅程条(B1)。
 * 准入阶段里程碑 + 服务启用后的结算阶段(Verification → Main → Cage → Reconciled),
 * 外加"下一步"引导文案。只展示客户安全信息。
 */
import { CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import type { AdmissionCaseStatus } from "@/lib/admission-case";
import type { CasePaymentView } from "@/lib/api";
import { admissionJourney, settlementJourney } from "@/lib/admission-journey";
import { useI18n } from "@/contexts/I18nContext";

function MilestoneRow({
  steps,
  done,
  currentIndex,
  showCheck,
  labelFor,
}: {
  steps: { key: string; label: string }[];
  done?: Record<string, boolean>;
  currentIndex?: number;
  showCheck?: boolean;
  labelFor: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const isDone = done ? Boolean(done[s.key]) : showCheck ? i < (currentIndex ?? 0) : i <= (currentIndex ?? 0);
        const isCurrent = !done && i === currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                isDone
                  ? "border-success/30 bg-success/10 text-success"
                  : isCurrent
                    ? "border-gold/40 bg-gold/10 text-gold"
                    : "border-border/50 bg-secondary/20 text-muted-foreground/60"
              }`}
            >
              {(isDone || (isCurrent && showCheck)) && <CheckCircle2 className="h-3 w-3" />}
              {labelFor(s.key)}
            </span>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-border" />}
          </div>
        );
      })}
    </div>
  );
}

export default function AdmissionJourney({
  status,
  payments = [],
}: {
  status: AdmissionCaseStatus;
  payments?: CasePaymentView[];
}) {
  const { t } = useI18n();
  const admission = admissionJourney(status);
  const settlement = settlementJourney(payments);
  const showSettlement = status === "service_enabled";
  const admissionLabel = (key: string) => t(`journey.step.${key}`);
  const settlementLabel = (key: string) => t(`journey.settlement.${key}`);

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-gold" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("journey.admission")}
        </p>
      </div>

      <MilestoneRow steps={admission.steps} currentIndex={admission.currentIndex} showCheck labelFor={admissionLabel} />

      {showSettlement && (
        <div className="space-y-2 border-t border-border/40 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("journey.deposits")}
          </p>
          <MilestoneRow steps={settlement.steps} done={settlement.done} labelFor={settlementLabel} />
        </div>
      )}

      <p className="rounded-lg bg-gold/5 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-semibold text-gold">{t("journey.next")} </span>
        {t(`journey.action.${status}`)}
      </p>
    </div>
  );
}
