"use client";
import KYC from "@/views/KYC";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><KYC /></ProtectedRoute>; }
