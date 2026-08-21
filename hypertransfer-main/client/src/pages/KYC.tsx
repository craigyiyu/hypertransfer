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
import { admissionApi, apiError } from "@/lib/api";
import {
  getCaseAwareKYCEligibility,
  isKycCaseBlocked,
} from "@/lib/kyc-status";
import type { AdmissionCaseStatus } from "@/lib/admission-case";
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
  Home,
  ClipboardList,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type KYCStep = "form" | "pending" | "approved";

const REGION_CODES = [
  "AF", "AL", "DZ", "AD", "AO", "AG", "AR", "AM", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY",
  "BE", "BZ", "BJ", "BT", "BO", "BA", "BW", "BR", "BN", "BG", "BF", "BI", "KH", "CM", "CA", "CV",
  "CF", "TD", "CL", "CN", "CO", "KM", "CG", "CD", "CR", "CI", "HR", "CU", "CY", "CZ", "DK", "DJ",
  "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET", "FJ", "FI", "FR", "GA", "GM", "GE",
  "DE", "GH", "GR", "GD", "GT", "GN", "GW", "GY", "HT", "HN", "HK", "HU", "IS", "IN", "ID", "IR",
  "IQ", "IE", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KI", "KW", "KG", "LA", "LV", "LB", "LS",
  "LR", "LY", "LI", "LT", "LU", "MO", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MR", "MU", "MX",
  "FM", "MD", "MC", "MN", "ME", "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "NZ", "NI", "NE", "NG",
  "KP", "MK", "NO", "OM", "PK", "PW", "PA", "PG", "PY", "PE", "PH", "PL", "PT", "QA", "RO", "RU",
  "RW", "KN", "LC", "VC", "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SB",
  "SO", "ZA", "KR", "SS", "ES", "LK", "SD", "SR", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL",
  "TG", "TO", "TT", "TN", "TR", "TM", "TV", "UG", "UA", "AE", "GB", "US", "UY", "UZ", "VU", "VA",
  "VE", "VN", "YE", "ZM", "ZW", "OTHER",
];

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const COUNTRY_OPTIONS = REGION_CODES.map((code) => ({
  value: code.toLowerCase(),
  label: code === "OTHER" ? "Other" : regionNames?.of(code) || code,
})).sort((a, b) => (a.value === "other" ? 1 : b.value === "other" ? -1 : a.label.localeCompare(b.label)));

const DIAL_CODE_OPTIONS = [
  { value: "+852", label: "Hong Kong +852" },
  { value: "+853", label: "Macau +853" },
  { value: "+86", label: "China +86" },
  { value: "+65", label: "Singapore +65" },
  { value: "+81", label: "Japan +81" },
  { value: "+82", label: "South Korea +82" },
  { value: "+1", label: "US / Canada +1" },
  { value: "+44", label: "United Kingdom +44" },
  { value: "+61", label: "Australia +61" },
  { value: "+886", label: "Taiwan +886" },
  { value: "+60", label: "Malaysia +60" },
  { value: "+66", label: "Thailand +66" },
  { value: "+63", label: "Philippines +63" },
  { value: "+62", label: "Indonesia +62" },
  { value: "+91", label: "India +91" },
  { value: "+971", label: "United Arab Emirates +971" },
];

const OCCUPATION_OPTIONS = [
  { value: "finance", label: "Finance" },
  { value: "gaming_hospitality", label: "Gaming / Hospitality" },
  { value: "technology", label: "Technology" },
  { value: "real_estate", label: "Real Estate" },
  { value: "professional_services", label: "Professional Services" },
  { value: "business_owner", label: "Business Owner" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];

const SOURCE_OF_FUNDS_OPTIONS = [
  { value: "employment_income", label: "Employment Income" },
  { value: "business_income", label: "Business Income" },
  { value: "personal_savings", label: "Personal Savings" },
  { value: "investment_proceeds", label: "Investment Proceeds" },
  { value: "casino_winnings", label: "Casino Winnings" },
  { value: "inheritance_gift", label: "Inheritance / Gift" },
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

function MandatoryMark() {
  return (
    <span className="text-gold font-semibold" aria-label="mandatory field">
      *
    </span>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof FileText;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-1 text-base font-semibold text-foreground">
      <Icon className="w-[18px] h-[18px] text-gold" />
      <span>{children}</span>
    </div>
  );
}

function RequirementCard({
  icon: Icon,
  title,
  required = false,
  children,
}: {
  icon: typeof FileText;
  title: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="w-full rounded-xl border-2 border-dashed border-border p-4 flex items-start gap-3">
      <Icon className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="text-left">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-foreground">{title}</p>
          {required && <MandatoryMark />}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function FieldLabel({
  children,
  required = true,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
      <span>{children}</span>
      {required && <MandatoryMark />}
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
  const [phoneCountryCode, setPhoneCountryCode] = useState("+852");
  const [phoneNumber, setPhoneNumber] = useState("");
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
  const [sumsubMessage, setSumsubMessage] = useState("Checking verification availability...");
  const [applicantId, setApplicantId] = useState("");
  // Case-aware: VIP 被绑定的 admission case 状态(KYC 闸门在 case 上)。
  const [caseStatus, setCaseStatus] = useState<AdmissionCaseStatus | undefined>(undefined);
  const [caseKycValidUntil, setCaseKycValidUntil] = useState<number | undefined>(undefined);
  const [caseLoading, setCaseLoading] = useState(true);

  const canSubmit = Boolean(
    firstName.trim()
    && lastName.trim()
    && nationality
    && dob.length === 10
    && phoneNumber.trim()
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
            ? "Identity verification is available."
            : "Identity verification setup is pending.",
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

  // Case-aware: 读取被绑定的 admission case(KYC 状态与到期日以 case 为准)。
  useEffect(() => {
    let cancelled = false;
    admissionApi
      .patronMine()
      .then((res) => {
        if (cancelled) return;
        setCaseStatus(res.data.case.status);
        setCaseKycValidUntil(res.data.case.kycValidUntil ?? undefined);
      })
      .catch(() => {
        // 未绑定 case(404): 保持 undefined, 页面给出安全引导。
        if (cancelled) return;
        setCaseStatus(undefined);
      })
      .finally(() => {
        if (!cancelled) setCaseLoading(false);
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
      setPhoneCountryCode("+852");
      setPhoneNumber((detail.phone || "+852 9876 5432").replace(/^\+852\s*/, ""));
      setIdType("passport");
      setIdNumber(detail.idNumber || "A123456789");
      setDocumentCountry("hk");
      setDocumentExpiry("2030-12-31");
      setResidentialAddress("123 Demo Street");
      setCity("Hong Kong");
      setPostalCode("000000");
      setAddressCountry("hk");
      setOccupation("finance");
      setSourceOfFunds("employment_income");
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
    setSumsubMessage("Submitting your verification securely...");
    try {
      if (demoApproveAllowed) {
        setApplicantId(`demo-${Date.now().toString(36)}`);
        setSumsubMessage("Verification submitted. Review status: pending.");
        syncKycState("pending", undefined, Math.floor(Date.now() / 1000));
        return;
      }

      const start = await sumsubApi.kycStart({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleName: middleName.trim(),
        nationality,
        dob,
        phone: `${phoneCountryCode} ${phoneNumber.trim()}`,
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
        `Verification submitted. Review status: ${start.data.reviewStatus || start.data.status}.`,
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

  // Case-aware: KYC 失败 / 合规复核 / 过期 / 撤销等终态 → 客户安全阻断页(不给内部原因)。
  if (!caseLoading && isKycCaseBlocked(caseStatus)) {
    const eligibility = getCaseAwareKYCEligibility({ caseStatus, kycValidUntil: caseKycValidUntil });
    return (
      <Shell title="Identity Verification" subtitle="Verification status">
        <div className="card-wine rounded-lg p-6 flex flex-col items-center text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive/80" />
          <h2 className="text-lg font-semibold text-foreground">{eligibility.blockerMessage}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">{eligibility.actionRequired}</p>
          {caseStatus === "kyc_failed" && (
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl border border-gold/40 px-5 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10 transition-colors"
            >
              Retry verification
            </button>
          )}
        </div>
      </Shell>
    );
  }

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
            </div>

            {/* Review timeframe */}
            <div className="card-wine rounded-xl px-5 py-4 w-full space-y-2">
              <div className="flex items-center gap-2 justify-center">
                <AlertCircle className="w-4 h-4 text-gold" />
                <p className="text-sm font-semibold text-foreground">Review Timeframe</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Automated checks usually complete in under a minute. You will be notified once verification is done.
              </p>
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
    <Shell showBack backTo="/setup-2fa" title="Identity Verification" subtitle="For regulatory compliance (KYC)">
      <div className="space-y-5">
        {/* Personal Info */}
        <div className="space-y-3">
          <SectionTitle icon={User}>Personal Details</SectionTitle>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <FieldLabel>First Name</FieldLabel>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="As shown on ID"
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Last Name</FieldLabel>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="As shown on ID"
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel required={false}>Middle Name</FieldLabel>
            <Input
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              placeholder="If applicable"
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
            <FieldLabel>Country Code</FieldLabel>
            <Select value={phoneCountryCode} onValueChange={setPhoneCountryCode}>
              <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                <SelectValue placeholder="Code" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {DIAL_CODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <FieldLabel>Mobile Number</FieldLabel>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="9876 5432"
              className="bg-input border-border h-11 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* ID Type & Number */}
        <div className="space-y-3">
          <SectionTitle icon={FileText}>Identity document</SectionTitle>

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
              <FieldLabel required={false}>Expiry Date</FieldLabel>
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
          <SectionTitle icon={Home}>Residential address</SectionTitle>

          <div className="space-y-2">
            <FieldLabel required={false}>Residential Address</FieldLabel>
            <Textarea
              value={residentialAddress}
              onChange={(e) => setResidentialAddress(e.target.value)}
              placeholder="Street, building, unit"
              className="bg-input border-border min-h-20 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <FieldLabel required={false}>City</FieldLabel>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Hong Kong"
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel required={false}>Postal Code</FieldLabel>
              <Input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="If applicable"
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel required={false}>Address Country / Region</FieldLabel>
            <CountrySelect value={addressCountry} onValueChange={setAddressCountry} />
          </div>
        </div>

        <div className="space-y-3">
          <SectionTitle icon={ClipboardList}>Financial Profile</SectionTitle>

          <div className="space-y-2">
            <FieldLabel required={false}>Occupation / Industry</FieldLabel>
            <Select value={occupation} onValueChange={setOccupation}>
              <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                <SelectValue placeholder="Select occupation / industry" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {OCCUPATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel required={false}>Source of Funds</FieldLabel>
            <Select value={sourceOfFunds} onValueChange={setSourceOfFunds}>
              <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                <SelectValue placeholder="Select source of funds" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {SOURCE_OF_FUNDS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Customer-facing upload preparation summary */}
        <div className="space-y-3">
          <SectionTitle icon={FileText}>Supporting Documents</SectionTitle>

          <RequirementCard icon={FileText} title="ID document photos" required>
            Passport, ID card, driver's license, or residence permit. Use original color photos with all corners visible and readable text. If both sides contain information, prepare front and back photos.
          </RequirementCard>

          <RequirementCard icon={Camera} title="Selfie / liveness check" required>
            Be ready for a live selfie, face scan, short video, or selfie with document so the provider can match you with the identity document.
          </RequirementCard>

          <RequirementCard icon={Home} title="Proof of address">
            Prepare a recent utility bill, bank statement, or official address document that matches the residential address entered above.
          </RequirementCard>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/30 p-3">
          <Checkbox
            checked={consentAccepted}
            onCheckedChange={(checked) => setConsentAccepted(checked === true)}
            className="mt-0.5"
          />
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            I confirm the information is accurate and consent to identity verification, document checks, phone/email risk checks, liveness/selfie matching, and compliance screening for HyperTransfer KYC. <MandatoryMark />
          </span>
        </label>

        <div className="rounded-xl border border-gold/20 bg-gold/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-gold/80">Form note</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Fields marked with * are mandatory. Additional information may be requested later during review; document photos and selfie/liveness are not uploaded from this page.
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
