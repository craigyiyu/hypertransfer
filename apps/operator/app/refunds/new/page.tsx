import { RefundPadApp } from "@/src/components/refund-pad-app";

export default function NewRefundPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Refund / Payout</p>
          <h1>New payout request</h1>
          <p className="muted">
            Screen destination wallet → Compliance approval → Submit to Hex Safe for withdrawal.
          </p>
        </div>
      </header>
      <RefundPadApp />
    </>
  );
}
