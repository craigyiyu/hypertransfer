"use client";
import PendingApproval from "@/views/PendingApproval";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() {
  return (
    <ProtectedRoute>
      <PendingApproval />
    </ProtectedRoute>
  );
}
