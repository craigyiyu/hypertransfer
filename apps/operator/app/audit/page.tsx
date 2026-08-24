import { auditLogs } from "@/src/data/seed";
import { formatDateTime } from "@/src/lib/format";

export default function AuditPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Immutable Trail Mock</p>
          <h1>Audit logs</h1>
          <p className="muted">Key compliance actions are recorded for demo review and future persistence.</p>
        </div>
      </header>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.timestamp)}</td>
                <td>{log.actor}</td>
                <td>{log.action}</td>
                <td>
                  {log.entityType}
                  <div className="muted">{log.entityId}</div>
                </td>
                <td>{log.metadata}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
