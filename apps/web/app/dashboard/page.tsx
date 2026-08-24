"use client";
import Dashboard from "@/views/Dashboard";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><Dashboard /></ProtectedRoute>; }
