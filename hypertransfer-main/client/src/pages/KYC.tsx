/**
 * KYC — Know Your Customer. User submits identity documents and personal information.
 * This is a blocking step before any deposits can be made.
 * Travel Rule is conditional — shown only during deposit flow when amount >= USD 1,000 (≈ HKD 8,000).
 *
 * Sumsub API flow:
 * 1. User fills HyperTransfer identity summary fields
 * 2. Backend creates or reuses a Sumsub applicant through signed API calls
 * 3. HyperTransfer shows provider status without embedding Sumsub WebSDK UI
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiError } from "@/lib/api";
import {
  sumsubApi,
  type SumsubConfig,
  type SumsubKycStatusValue,
} from "@/lib/sumsub";
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type KYCStep = "form" | "pending" | "approved";

export default function KYC() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const [step, setStep] = useState<KYCStep>("form");
  const [nationality, setNationality] = useState("");
  const [dob, setDob] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [sumsubConfig, setSumsubConfig] = useState<SumsubConfig | null>(null);
  const [sumsubLoading, setSumsubLoading] = useState(true);
  const [sumsubSubmitting, setSumsubSubmitting] = useState(false);
  const [sumsubMessage, setSumsubMessage] = useState("Checking verification provider configuration...");
  const [applicantId, setApplicantId] = useState("");

  const canSubmit = Boolean(nationality && dob.length === 10 && idType && idNumber.trim());

  const handleDobChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    const formatted = [
      digits.slice(0, 4),
      digits.slice(4, 6),
      digits.slice(6, 8),
    ].filter(Boolean).join("-");
    setDob(formatted);
  };

  // When pending, keep the customer in review state until Sumsub returns a final result.
  useEffect(() => {
    if (step !== "pending") return;

    updateState({
      kycComplete: false,
      kyc: { status: "pending", retryCount: 0 },
    });
  }, [step]);

  // Navigate to dashboard after approved state is shown briefly
  useEffect(() => {
    if (step !== "approved") return;
    const timer = setTimeout(() => {
      navigate("/dashboard");
    }, 1500);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    sumsubApi.config()
      .then((res) => {
        if (cancelled) return;
        setSumsubConfig(res.data);
        setSumsubMessage(
          res.data.configured
            ? `Sumsub ${res.data.environment} is configured for ${res.data.kycLevelName}.`
            : "Verification provider setup is pending in the backend.",
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setSumsubMessage(apiError(err));
      })
      .finally(() => {
        if (!cancelled) setSumsubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!sumsubConfig?.configured) {
      setSumsubMessage("Identity verification is not connected yet. Please contact support or try again later.");
      return;
    }
    setSumsubSubmitting(true);
    setSumsubMessage("Creating Sumsub applicant through the backend API adapter...");
    try {
      const start = await sumsubApi.kycStart({
        nationality,
        dob,
        idType,
        idNumber,
        levelName: sumsubConfig.kycLevelName,
        apiOnly: true,
      });
      setApplicantId(start.data.applicantId);
      setSumsubMessage(
        `Sumsub API applicant created. Review status: ${start.data.reviewStatus || start.data.status}.`,
      );
      syncKycState(start.data.status, start.data.rejectionReason, start.data.updatedAt);
    } catch (err) {
      setSumsubMessage(apiError(err));
    } finally {
      setSumsubSubmitting(false);
    }
  };

  const syncKycState = (
    status: SumsubKycStatusValue,
    rejectionReason?: string,
    updatedAt?: number | null,
    moveStep = true,
  ) => {
    updateState({
      kycComplete: status === "approved",
      kyc: {
        status,
        submittedAt: updatedAt ? new Date(updatedAt * 1000).toISOString() : new Date().toISOString(),
        retryCount: 0,
        rejectionReason: rejectionReason || undefined,
        lastRejectionAt: status === "rejected" ? new Date().toISOString() : undefined,
      },
    });
    if (!moveStep) return;
    if (status === "approved") {
      setStep("approved");
    } else if (status === "pending") {
      setStep("pending");
    } else if (status === "rejected") {
      navigate("/kyc-status");
    }
  };

  if (step === "pending") {
    return (
      <Shell title="Identity Verification" subtitle="Your submission is under review">
        <AnimatePresence mode="wait">
          <motion.div
            key="pending"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center text-center py-8 space-y-6"
          >
            {/* Amber clock icon */}
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 rounded-full bg-warning/10 border-2 border-warning/30 flex items-center justify-center"
            >
              <Clock className="w-10 h-10 text-warning" />
            </motion.div>

            {/* Status */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-warning">KYC Pending Review</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                Your Sumsub applicant profile has been created through HyperTransfer's backend API adapter.
                The review status will update through provider API polling or webhook events.
              </p>
            </div>

            {/* 24-hour notice */}
            <div className="card-wine rounded-xl px-5 py-4 w-full space-y-2">
              <div className="flex items-center gap-2 justify-center">
                <AlertCircle className="w-4 h-4 text-gold" />
                <p className="text-sm font-semibold text-foreground">Review Timeframe</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                KYC review may take <span className="text-gold font-semibold">up to 24 hours</span>. You will be notified once your identity has been verified.
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Deposits are locked until verification is complete.
              </p>
            </div>

            <div className="card-gold rounded-xl px-4 py-3 w-full flex items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full shrink-0"
              />
              <div className="flex-1 text-left">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sumsub API Status</p>
                <p className="text-xs text-foreground">
                  Waiting for provider result or webhook update{applicantId ? ` (${applicantId})` : ""}.
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </Shell>
    );
  }

  if (step === "approved") {
    return (
      <Shell title="Identity Verification" subtitle="Verification complete">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center py-8 space-y-6"
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="w-20 h-20 rounded-full bg-success/10 border-2 border-success/30 flex items-center justify-center"
          >
            <CheckCircle2 className="w-10 h-10 text-success" />
          </motion.div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-success">KYC Approved</h2>
            <p className="text-sm text-muted-foreground">
              Your identity has been verified. Redirecting to dashboard…
            </p>
          </div>
        </motion.div>
      </Shell>
    );
  }

  return (
    <Shell showBack backTo="/setup-2fa" title="Identity Verification" subtitle="Required for regulatory compliance (KYC)">
      <div className="space-y-5">
        {/* Info banner */}
        <div className="card-wine rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            We are required to verify your identity before processing any crypto deposits. This is a one-time process.
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-secondary/20 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-foreground">Secure Verification</p>
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                sumsubConfig?.configured
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning"
              }`}
            >
            {sumsubConfig?.configured ? "API ready" : "setup pending"}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {sumsubLoading ? "Checking verification provider..." : sumsubMessage}
          </p>
        </div>

        {/* Personal Info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Nationality</Label>
            <Select value={nationality} onValueChange={setNationality}>
              <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="hk">Hong Kong</SelectItem>
                <SelectItem value="cn">China</SelectItem>
                <SelectItem value="sg">Singapore</SelectItem>
                <SelectItem value="jp">Japan</SelectItem>
                <SelectItem value="kr">South Korea</SelectItem>
                <SelectItem value="us">United States</SelectItem>
                <SelectItem value="gb">United Kingdom</SelectItem>
                <SelectItem value="au">Australia</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Date of Birth</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={dob}
              onChange={(e) => handleDobChange(e.target.value)}
              placeholder="YYYY-MM-DD"
              maxLength={10}
              className="bg-input border-border h-11 rounded-xl text-sm font-mono"
            />
          </div>
        </div>

        {/* ID Type & Number */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">ID Document Type</Label>
          <Select value={idType} onValueChange={setIdType}>
            <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
              <SelectValue placeholder="Select document type" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="passport">Passport</SelectItem>
              <SelectItem value="national_id">National ID Card</SelectItem>
              <SelectItem value="drivers">Driver's License</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Document Number</Label>
          <Input
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="Enter document number"
            className="bg-input border-border h-11 rounded-xl font-mono text-sm"
          />
        </div>

        {/* Sumsub API submission summary */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Provider API Submission
          </Label>

          <div className="w-full rounded-xl border-2 border-dashed border-border p-4 flex items-center gap-3">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <div className="text-left">
              <p className="text-sm text-foreground">Applicant Record</p>
              <p className="text-[10px] text-muted-foreground">HyperTransfer backend creates or reuses a Sumsub applicant through signed API calls.</p>
            </div>
          </div>

          <div className="w-full rounded-xl border-2 border-dashed border-border p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
            <div className="text-left">
              <p className="text-sm text-foreground">Status Sync</p>
              <p className="text-[10px] text-muted-foreground">Review status is pulled from Sumsub API and can also be updated by webhook.</p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || sumsubSubmitting || sumsubLoading}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sumsubSubmitting && <RotateCw className="h-4 w-4 animate-spin" />}
            Submit for Verification
          </button>
        </div>
      </div>
    </Shell>
  );
}
