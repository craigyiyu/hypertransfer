/**
 * KYC — Know Your Customer. User submits identity documents and personal information.
 * This is a blocking step before any deposits can be made.
 * Travel Rule is conditional — shown only during deposit flow when amount > 8,000 USD.
 *
 * Demo flow:
 * 1. User submits → status set to "pending"
 * 2. Pending screen shown with 24-hour review message
 * 3. After 5 seconds, auto-approve (demo only) → navigate to dashboard
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, CheckCircle2, AlertCircle, Clock } from "lucide-react";
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
  const [idUploaded, setIdUploaded] = useState(false);
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const canSubmit = nationality && dob && idType && idNumber && idUploaded && selfieUploaded;

  // When pending, count down 5 seconds then auto-approve
  useEffect(() => {
    if (step !== "pending") return;

    // Set KYC status to pending immediately
    updateState({
      kycComplete: false,
      kyc: { status: "pending", retryCount: 0 },
    });

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const timer = setTimeout(() => {
      // Auto-approve after 5 seconds (demo only)
      updateState({
        kycComplete: true,
        kyc: { status: "approved", retryCount: 0 },
      });
      setStep("approved");
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [step]);

  // Navigate to dashboard after approved state is shown briefly
  useEffect(() => {
    if (step !== "approved") return;
    const timer = setTimeout(() => {
      navigate("/dashboard");
    }, 1500);
    return () => clearTimeout(timer);
  }, [step]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    setStep("pending");
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
                Your documents have been submitted successfully. Our compliance team will review your application.
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

            {/* Demo countdown */}
            <div className="card-gold rounded-xl px-4 py-3 w-full flex items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full shrink-0"
              />
              <div className="flex-1 text-left">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Demo Mode</p>
                <p className="text-xs text-foreground">
                  Auto-approving in <span className="text-gold font-semibold">{countdown}s</span>…
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
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="bg-input border-border h-11 rounded-xl text-sm"
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

        {/* Document Upload */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Document Upload
          </Label>

          {/* ID Upload */}
          <button
            onClick={() => setIdUploaded(true)}
            className={`w-full rounded-xl border-2 border-dashed p-4 flex items-center gap-3 transition-all duration-200 ${
              idUploaded
                ? "border-success/50 bg-success/5"
                : "border-border hover:border-gold/30"
            }`}
          >
            {idUploaded ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : (
              <Upload className="w-5 h-5 text-muted-foreground" />
            )}
            <div className="text-left">
              <p className="text-sm text-foreground">
                {idUploaded ? "ID Document Uploaded" : "Upload ID Document"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {idUploaded ? "passport_scan.jpg" : "Front & back of your ID"}
              </p>
            </div>
          </button>

          {/* Selfie Upload */}
          <button
            onClick={() => setSelfieUploaded(true)}
            className={`w-full rounded-xl border-2 border-dashed p-4 flex items-center gap-3 transition-all duration-200 ${
              selfieUploaded
                ? "border-success/50 bg-success/5"
                : "border-border hover:border-gold/30"
            }`}
          >
            {selfieUploaded ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : (
              <Upload className="w-5 h-5 text-muted-foreground" />
            )}
            <div className="text-left">
              <p className="text-sm text-foreground">
                {selfieUploaded ? "Selfie Uploaded" : "Upload Selfie with ID"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {selfieUploaded ? "selfie_verification.jpg" : "Hold your ID next to your face"}
              </p>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-8">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Submit for Verification
        </button>
      </div>
    </Shell>
  );
}
