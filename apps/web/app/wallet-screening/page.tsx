"use client";
import WalletScreening from "@/views/WalletScreening";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><WalletScreening /></ProtectedRoute>; }
