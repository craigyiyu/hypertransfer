/**
 * RefundPlaceholder.tsx — v1.1 Q6
 * 客户决议: Refund 不在 v1.1 scope, 仅占位 "under development"。
 * 保留 RefundProcess 组件(便于 Phase 2 复用); 后端 /api/refunds*  全部保留(可逆)。
 */
"use client";
import { Construction } from "lucide-react";

export default function RefundPlaceholder() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold">
          <Construction className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Refund Request</h1>
        <p className="mt-2 text-sm text-muted-foreground">Under development.</p>
        <p className="mt-4 text-xs text-muted-foreground/80">
          This feature is planned for Phase 2. Until then, please contact your Host for for
          refund requests.
        </p>
      </div>
    </div>
  );
}
