import Link from "next/link";
import { CaseStatusBadge } from "@/src/components/status-badge";
import { complianceCases, getCustomer, getDeposit } from "@/src/data/seed";
import { formatDateTime } from "@/src/lib/format";

export default function ComplianceCasesPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Compliance Queue</p>
          <h1>Open review cases</h1>
          <p className="muted">EDD and blocked-wallet scenarios raised by the mock wallet screening provider.</p>
        </div>
      </header>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Case</th>
              <th>Customer</th>
              <th>Reason</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Opened</th>
            </tr>
          </thead>
          <tbody>
            {complianceCases.map((item) => {
              const deposit = getDeposit(item.depositId);
              const customer = getCustomer(item.customerId);

              return (
                <tr key={item.id}>
                  <td>
                    <Link href={deposit ? `/ops/deposits/${deposit.id}` : "/ops"}>{item.id}</Link>
                    <div className="muted">{item.depositId}</div>
                  </td>
                  <td>
                    {customer?.name ?? "Unknown"}
                    <div className="muted">{customer?.jurisdiction}</div>
                  </td>
                  <td>{item.reason}</td>
                  <td>
                    <span className={item.priority === "urgent" ? "badge danger" : "badge warning"}>
                      {item.priority.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <CaseStatusBadge status={item.status} />
                  </td>
                  <td>{formatDateTime(item.openedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
