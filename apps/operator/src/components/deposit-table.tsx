import Link from "next/link";
import { getCustomer } from "@/src/data/seed";
import { statusLabel } from "@/src/domain/state-machine";
import type { DepositRequest } from "@/src/domain/types";
import { currencyFormatter, formatDateTime } from "@/src/lib/format";
import { DepositStatusBadge, RiskBadge } from "./status-badge";

export function DepositTable({ deposits }: { deposits: DepositRequest[] }) {
  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th>Deposit</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Risk</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {deposits.map((deposit) => {
            const customer = getCustomer(deposit.customerId);

            return (
              <tr key={deposit.id}>
                <td>
                  <Link href={`/ops/deposits/${deposit.id}`}>{deposit.id}</Link>
                  <div className="muted">{deposit.hostName}</div>
                </td>
                <td>
                  {customer?.name ?? "Unknown"}
                  <div className="muted">{customer?.externalId}</div>
                </td>
                <td>
                  {currencyFormatter.format(deposit.amount)} {deposit.asset}
                  <div className="muted">{deposit.network}</div>
                </td>
                <td>
                  <DepositStatusBadge status={deposit.status} label={statusLabel(deposit.status)} />
                </td>
                <td>{deposit.screening ? <RiskBadge level={deposit.screening.level} /> : "Pending"}</td>
                <td>{formatDateTime(deposit.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
