"use client";

import { useState } from "react";

type CaseAction = "open" | "requesting_docs" | "approved" | "rejected" | "closed";

const actionLabels: Record<CaseAction, string> = {
  open: "OPEN",
  requesting_docs: "REQUESTING DOCUMENTS",
  approved: "APPROVED",
  rejected: "REJECTED",
  closed: "CLOSED",
};

const actionTones: Record<CaseAction, string> = {
  open: "warning",
  requesting_docs: "warning",
  approved: "success",
  rejected: "danger",
  closed: "neutral",
};

export function ManualCaseActions({ initialStatus }: { initialStatus: string }) {
  const [status, setStatus] = useState<CaseAction>(
    (initialStatus as CaseAction) in actionLabels ? (initialStatus as CaseAction) : "open",
  );
  const [docNote, setDocNote] = useState("");
  const [showDocForm, setShowDocForm] = useState(false);

  function requestDocuments() {
    if (!docNote.trim()) {
      return;
    }
    setStatus("requesting_docs");
    setShowDocForm(false);
    setDocNote("");
  }

  return (
    <div className="card">
      <h2>Manual Handling</h2>
      <p className="muted">Compliance reviewer actions — decisions are logged to the audit trail.</p>
      <p>
        Current decision:{" "}
        <span className={`badge ${actionTones[status]}`}>{actionLabels[status]}</span>
      </p>

      {showDocForm ? (
        <div className="form" style={{ marginTop: "1rem" }}>
          <div className="field">
            <label htmlFor="doc-note">Document request note</label>
            <input
              id="doc-note"
              placeholder="e.g. Source of funds statement, proof of address..."
              value={docNote}
              onChange={(e) => setDocNote(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="button primary" type="button" onClick={requestDocuments}>
              Send Document Request
            </button>
            <button className="button" type="button" onClick={() => setShowDocForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-2" style={{ marginTop: "1rem" }}>
          <button className="button primary" type="button" onClick={() => setStatus("approved")}>
            Approve Review
          </button>
          <button className="button danger" type="button" onClick={() => setStatus("rejected")}>
            Reject Deposit
          </button>
          <button className="button warning" type="button" onClick={() => setShowDocForm(true)}>
            Request Documents
          </button>
          <button className="button" type="button" onClick={() => setStatus("closed")}>
            Close Case
          </button>
        </div>
      )}

      {status === "requesting_docs" && (
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          Document request sent. Case remains open until patron provides required materials.
        </p>
      )}
    </div>
  );
}
