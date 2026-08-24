"use client";
import Settings from "@/views/Settings";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><Settings /></ProtectedRoute>; }
