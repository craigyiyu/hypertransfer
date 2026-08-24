"use client";
import DepositAddress from "@/views/DepositAddress";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><DepositAddress /></ProtectedRoute>; }
