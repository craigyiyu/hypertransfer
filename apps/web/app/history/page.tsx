"use client";
import History from "@/views/History";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><History /></ProtectedRoute>; }
