import { useEffect } from "react";
import { useLocation } from "@/lib/wouter";

export default function WalletScreening() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/new-deposit", { replace: true });
  }, [navigate]);

  return null;
}
