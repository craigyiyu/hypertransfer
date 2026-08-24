import { DepositTable } from "@/src/components/deposit-table";
import { deposits } from "@/src/data/seed";

export default function OpsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations Dashboard</p>
          <h1>Deposit queue</h1>
          <p className="muted">Track status, risk decisions, address issuance, and exceptions from a single queue.</p>
        </div>
      </header>
      <DepositTable deposits={deposits} />
    </>
  );
}
