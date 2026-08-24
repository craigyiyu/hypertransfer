"use client";
import KYCStatus from "@/views/KYCStatus";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><KYCStatus /></ProtectedRoute>; }
