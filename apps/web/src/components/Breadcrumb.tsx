/**
 * Breadcrumb — Navigation breadcrumb showing current step in the flow.
 * Design: Minimal, gold accents, clickable steps.
 */
import { useLocation } from "@/lib/wouter";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  path: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  currentStep?: number;
  totalSteps?: number;
}

export default function Breadcrumb({
  items,
  currentStep,
  totalSteps,
}: BreadcrumbProps) {
  const [, navigate] = useLocation();

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 overflow-x-auto pb-2">
        {items.map((item, index) => (
          <div key={item.path} className="flex items-center gap-2 whitespace-nowrap">
            <button
              onClick={() => navigate(item.path)}
              className={`hover:text-gold transition-colors ${
                index === items.length - 1 ? "text-gold font-medium" : ""
              }`}
            >
              {item.label}
            </button>
            {index < items.length - 1 && (
              <ChevronRight className="w-3 h-3 text-border" />
            )}
          </div>
        ))}
      </div>
      {currentStep && totalSteps && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold to-gold/60 transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Step {currentStep} of {totalSteps}
          </span>
        </div>
      )}
    </div>
  );
}
