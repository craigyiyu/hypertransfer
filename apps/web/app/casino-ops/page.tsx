"use client";
import CasinoOpsPortal from "@/views/CasinoOpsPortal";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute requireStaff><CasinoOpsPortal /></ProtectedRoute>; }
