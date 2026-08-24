"use client";
import MainDeposit from "@/views/MainDeposit";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><MainDeposit /></ProtectedRoute>; }
