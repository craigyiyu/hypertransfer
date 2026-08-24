/**
 * TestPayment — Legacy redirect. The test payment is now part of the unified
 * deposit session in MainDeposit. This page redirects for backward compatibility.
 */
import { useEffect } from "react";
import { useLocation } from "@/lib/wouter";

export default function TestPayment() {
  const [, navigate] = useLocation();

  useEffect(() => {
    // Redirect to the unified deposit session
    navigate("/main-deposit");
  }, [navigate]);

  return null;
}
