import { DepositIntake } from "@/src/components/deposit-intake";

export default function NewDepositPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Host Portal</p>
          <h1>Create deposit request</h1>
          <p className="muted">
            Capture customer, asset, network, amount, and source wallet, then run the mock compliance gate.
          </p>
        </div>
      </header>
      <DepositIntake />
    </>
  );
}
