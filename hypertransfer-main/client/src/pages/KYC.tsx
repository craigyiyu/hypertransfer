/**
 * KYC — Know Your Customer. User submits identity documents and personal information.
 * This is a blocking step before any deposits can be made.
 * Travel Rule is conditional — shown only during deposit flow when amount >= USD 1,000 (≈ HKD 8,000).
 *
 * Provider API flow:
 * 1. User fills HyperTransfer identity summary fields
 * 2. Backend creates or reuses a verification applicant through signed API calls
 * 3. HyperTransfer shows provider status without embedding provider SDK UI
 */
import { useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import { DEMO_AUTOFILL_EVENT } from "@/contexts/DemoModeContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  RotateCw,
  Camera,
  User,
  Smartphone,
  Home,
  ClipboardList,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type KYCStep = "form" | "pending" | "approved";

const COUNTRY_OPTIONS = [
  { value: "hk", label: "Hong Kong" },
  { value: "cn", label: "China" },
  { value: "sg", label: "Singapore" },
  { value: "jp", label: "Japan" },
  { value: "kr", label: "South Korea" },
  { value: "us", label: "United States" },
  { value: "gb", label: "United Kingdom" },
  { value: "au", label: "Australia" },
  { value: "other", label: "Other" },
];

function CountrySelect({
  value,
  onValueChange,
  placeholder = "Select",
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {COUNTRY_OPTIONS.map((country) => (
          <SelectItem key={country.value} value={country.value}>
            {country.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type RequirementKind = "Required" | "Optional" | "May be required";

function RequirementCard({
  icon: Icon,
  title,
  requirement,
  children,
}: {
  icon: typeof FileText;
  title: string;
  requirement: RequirementKind;
  children: ReactNode;
}) {
  return (
    <div className="w-full rounded-xl border-2 border-dashed border-border p-4 flex items-start gap-3">
      <Icon className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="text-left">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-foreground">{title}</p>
          <RequirementTag kind={requirement} />
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function RequirementTag({ kind }: { kind: RequirementKind }) {
  const isRequired = kind === "Required";
  return (
    <span
      className={[
        "rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        isRequired
          ? "border-gold/40 bg-gold/10 text-gold"
          : "border-border/70 bg-secondary/30 text-muted-foreground",
      ].join(" ")}
    >
      {kind}
    </span>
  );
}

function FieldLabel({
  children,
  requirement = "Required",
}: {
  children: ReactNode;
  requirement?: RequirementKind;
}) {
  return (
    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
      <span>{children}</span>
      <RequirementTag kind={requirement} />
    </Label>
  );
}

const formatDateInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return [
    digits.slice(0, 4),
    digits.slice(4, 6),
    digits.slice(6, 8),
  ].filter(Boolean).join("-");
};

export default function KYC() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const [step, setStep] = useState<KYCStep>("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [nationality, setNationality] = useState("");
  const [dob, setDob] = useState("");
  const [taxResidence, setTaxResidence] = useState("");
  const [phone, setPhone] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [documentCountry, setDocumentCountry] = useState("");
  const [documentExpiry, setDocumentExpiry] = useState("");
  const [residentialAddress, setResidentialAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [occupation, setOccupation] = useState("");
  const [sourceOfFunds, setSourceOfFunds] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [sumsubConfig, setSumsubConfig] = useState<SumsubConfig | null>(null);
  const [sumsubLoading, setSumsubLoading] = useState(true);
  const [sumsubSubmitting, setSumsubSubmitting] = useState(false);
  const [sumsubMessage, setSumsubMessage] = useState("Checking verification provider configuration...");
  const [applicantId, setApplicantId] = useState("");

  const canSubmit = Boolean(
    firstName.trim()
    && lastName.trim()
    && nationality
    && dob.length === 10
    && phone.trim()
    && idType
    && idNumber.trim()
    && documentCountry
    && consentAccepted
  );
  // 演示环境(非 production)自动通过, 生产环境等待真实 provider 回调。
  const demoApproveAllowed = sumsubConfig ? sumsubConfig.environment !== "production" : false;

  const handleDobChange = (value: string) => {
    setDob(formatDateInput(value));
  };

  // When pending, keep the customer in review state until the provider returns a final result.
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
            ? `Verification provider is configured for ${res.data.environment}.`
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

  useEffect(() => {
    const handleDemoFill = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, string>>).detail || {};
      setFirstName(detail.firstName || "Demo");
      setLastName(detail.lastName || "Patron");
      setMiddleName("");
      setNationality("hk");
      setDob("1990-01-15");
      setTaxResidence("hk");
      setPhone(detail.phone || "+852 9876 5432");
      setIdType("passport");
      setIdNumber(detail.idNumber || "A123456789");
      setDocumentCountry("hk");
      setDocumentExpiry("2030-12-31");
      setResidentialAddress("123 Demo Street");
      setCity("Hong Kong");
      setPostalCode("000000");
      setAddressCountry("hk");
      setOccupation(detail.occupationIndustry || "Finance");
      setSourceOfFunds(detail.sourceOfFunds || "Employment income and savings");
      setConsentAccepted(true);
    };

    window.addEventListener(DEMO_AUTOFILL_EVENT, handleDemoFill);
    return () => window.removeEventListener(DEMO_AUTOFILL_EVENT, handleDemoFill);
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!sumsubConfig?.configured && !demoApproveAllowed) {
      setSumsubMessage("Identity verification is not connected yet. Please contact support or try again later.");
      return;
    }
    setSumsubSubmitting(true);
    setSumsubMessage("Creating secure verification profile through the backend adapter...");
    try {
      if (demoApproveAllowed) {
        setApplicantId(`demo-${Date.now().toString(36)}`);
        setSumsubMessage("Verification profile created. Review status: pending.");
        syncKycState("pending", undefined, Math.floor(Date.now() / 1000));
        return;
      }

      const start = await sumsubApi.kycStart({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleName: middleName.trim(),
        nationality,
        dob,
        taxResidence,
        phone: phone.trim(),
        idType,
        idNumber: idNumber.trim(),
        documentCountry,
        documentExpiry,
        address: residentialAddress.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        addressCountry,
        occupation: occupation.trim(),
        sourceOfFunds: sourceOfFunds.trim(),
        consentAccepted,
        levelName: sumsubConfig?.kycLevelName,
        apiOnly: true,
      });
      setApplicantId(start.data.applicantId);
      setSumsubMessage(
        `Verification profile created. Review status: ${start.data.reviewStatus || start.data.status}.`,
      );
      syncKycState(start.data.status, start.data.rejectionReason, start.data.updatedAt);
    } catch (err) {
      setSumsubMessage(apiError(err));
    } finally {
      setSumsubSubmitting(false);
    }
  };

  // Demo auto-approval: skip waiting for the live provider callback in non-production.
  const handleDemoApprove = async () => {
    try {
      const res = await sumsubApi.kycDemoApprove();
      syncKycState(res.data.status, res.data.rejectionReason, res.data.updatedAt);
    } catch (err) {
      setSumsubMessage(apiError(err));
    }
  };

  useEffect(() => {
    if (step !== "pending" || !demoApproveAllowed) return;
    const timer = window.setTimeout(() => {
      void handleDemoApprove();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [step, demoApproveAllowed]);

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
            {/* Loading indicator */}
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 rounded-full bg-warning/10 border-2 border-warning/30 flex items-center justify-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="h-10 w-10 rounded-full border-4 border-gold/25 border-t-gold"
                aria-label="Verification processing"
              />
            </motion.div>

            {/* Status */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-warning">KYC Pending Review</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                Your verification profile has been created through HyperTransfer's secure backend adapter.
                Review status will update automatically.
              </p>
            </div>

            {/* Review timeframe */}
            <div className="card-wine rounded-xl px-5 py-4 w-full space-y-2">
              <div className="flex items-center gap-2 justify-center">
                <AlertCircle className="w-4 h-4 text-gold" />
                <p className="text-sm font-semibold text-foreground">Review Timeframe</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Automated checks usually complete in <span className="text-gold font-semibold">under a minute</span>. If a case is escalated to manual review it may take a few minutes longer. You will be notified once your identity has been verified.
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Verification Status</p>
                <p className="text-xs text-foreground">
                  Waiting for provider result or webhook update{applicantId ? ` (${applicantId})` : ""}.
                </p>
              </div>
            </div>

            {demoApproveAllowed && (
              <p className="text-[10px] text-muted-foreground/60 text-center">
                Demo mode will complete verification automatically in about 5 seconds.
              </p>
            )}
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
            We are required to verify your identity before processing any crypto deposits. KYC approval is valid for 6 months and will need to be renewed after expiry.
          </p>
        </div>

        {/* Personal Info */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <User className="w-3 h-3" /> Applicant data
          </Label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <FieldLabel>Legal First Name</FieldLabel>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="As shown on ID"
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Legal Last Name</FieldLabel>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="As shown on ID"
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel requirement="Optional">Middle Name</FieldLabel>
            <Input
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              placeholder="Optional"
              className="bg-input border-border h-11 rounded-xl text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <FieldLabel>Nationality</FieldLabel>
            <CountrySelect value={nationality} onValueChange={setNationality} />
          </div>
          <div className="space-y-2">
            <FieldLabel>Date of Birth</FieldLabel>
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <FieldLabel requirement="May be required">Tax Residence</FieldLabel>
            <CountrySelect value={taxResidence} onValueChange={setTaxResidence} />
          </div>
          <div className="space-y-2">
            <FieldLabel>Mobile Number</FieldLabel>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+852 9876 5432"
              className="bg-input border-border h-11 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* ID Type & Number */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Identity document
          </Label>

          <div className="space-y-2">
            <FieldLabel>ID Document Type</FieldLabel>
            <Select value={idType} onValueChange={setIdType}>
              <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="national_id">National ID Card</SelectItem>
                <SelectItem value="drivers">Driver's License</SelectItem>
                <SelectItem value="residence_permit">Residence Permit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Document Number</FieldLabel>
            <Input
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="Enter document number"
              className="bg-input border-border h-11 rounded-xl font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <FieldLabel>Issuing Country</FieldLabel>
              <CountrySelect value={documentCountry} onValueChange={setDocumentCountry} />
            </div>
            <div className="space-y-2">
              <FieldLabel requirement="May be required">Expiry Date</FieldLabel>
              <Input
                type="text"
                inputMode="numeric"
                value={documentExpiry}
                onChange={(e) => setDocumentExpiry(formatDateInput(e.target.value))}
                placeholder="YYYY-MM-DD"
                maxLength={10}
                className="bg-input border-border h-11 rounded-xl text-sm font-mono"
              />
            </div>
          </div>
        </div>

        {/* Address / questionnaire data */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Home className="w-3 h-3" /> Residential address
          </Label>

          <div className="space-y-2">
            <FieldLabel requirement="May be required">Residential Address</FieldLabel>
            <Textarea
              value={residentialAddress}
              onChange={(e) => setResidentialAddress(e.target.value)}
              placeholder="Street, building, unit"
              className="bg-input border-border min-h-20 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <FieldLabel requirement="May be required">City</FieldLabel>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Hong Kong"
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel requirement="Optional">Postal Code</FieldLabel>
              <Input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="Optional"
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel requirement="May be required">Address Country / Region</FieldLabel>
            <CountrySelect value={addressCountry} onValueChange={setAddressCountry} />
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ClipboardList className="w-3 h-3" /> Compliance questionnaire
          </Label>

          <div className="space-y-2">
            <FieldLabel requirement="May be required">Occupation / Industry</FieldLabel>
            <Input
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="e.g. Finance, hospitality, technology"
              className="bg-input border-border h-11 rounded-xl text-sm"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel requirement="May be required">Source of Funds</FieldLabel>
            <Textarea
              value={sourceOfFunds}
              onChange={(e) => setSourceOfFunds(e.target.value)}
              placeholder="e.g. Employment income, savings, investment proceeds"
              className="bg-input border-border min-h-20 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* Customer-facing upload preparation summary */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> What you'll need
          </Label>

          <RequirementCard icon={FileText} title="ID document photos" requirement="Required">
            Passport, ID card, driver's license, or residence permit. Use original color photos with all corners visible and readable text. If both sides contain information, prepare front and back photos.
          </RequirementCard>

          <RequirementCard icon={Camera} title="Selfie / liveness check" requirement="Required">
            Be ready for a live selfie, face scan, short video, or selfie with document so the provider can match you with the identity document.
          </RequirementCard>

          <RequirementCard icon={Home} title="Proof of address" requirement="May be required">
            Prepare a recent utility bill, bank statement, or official address document that matches the residential address entered above.
          </RequirementCard>

          <RequirementCard icon={Smartphone} title="Phone and email verification" requirement="Required">
            The provider may check your mobile number and account email for risk, blocklist, or verification status.
          </RequirementCard>

          <RequirementCard icon={ClipboardList} title="Compliance questionnaire" requirement="May be required">
            Additional questions may cover occupation, source of funds, tax residence, and the purpose of using HyperTransfer.
          </RequirementCard>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/30 p-3">
          <Checkbox
            checked={consentAccepted}
            onCheckedChange={(checked) => setConsentAccepted(checked === true)}
            className="mt-0.5"
          />
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            I confirm the required information is accurate and consent to identity verification, document checks, phone/email risk checks, liveness/selfie matching, and compliance screening for HyperTransfer KYC. <span className="text-gold">Required</span>
          </span>
        </label>

        <div className="rounded-xl border border-gold/20 bg-gold/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gold/80">Demo note</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Required items block submission. Optional items never block submission. May-be-required items are shown so the patron knows what verification or compliance review may ask for later; document photos and selfie/liveness are not uploaded from this page.
          </p>
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
