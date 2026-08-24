"use client";
import TestPayment from "@/views/TestPayment";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><TestPayment /></ProtectedRoute>; }
