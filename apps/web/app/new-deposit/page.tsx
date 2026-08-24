"use client";
import NewDeposit from "@/views/NewDeposit";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><NewDeposit /></ProtectedRoute>; }
