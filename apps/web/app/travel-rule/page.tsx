"use client";
import TravelRule from "@/views/TravelRule";
import ProtectedRoute from "@/components/ProtectedRoute";
export default function Page() { return <ProtectedRoute><TravelRule /></ProtectedRoute>; }
