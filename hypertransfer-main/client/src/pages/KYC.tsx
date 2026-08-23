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
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import { DEMO_AUTOFILL_EVENT } from "@/contexts/DemoModeContext";
import { useI18n } from "@/contexts/I18nContext";
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
  launchSumsubWebSdk,
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

const OCCUPATION_VALUES = [
  "finance",
  "gaming_hospitality",
  "technology",
  "real_estate",
  "professional_services",
  "business_owner",
  "retired",
  "other",
] as const;

const OCCUPATION_KEYS: Record<(typeof OCCUPATION_VALUES)[number], string> = {
  finance: "kyc.industry.finance",
  gaming_hospitality: "kyc.industry.gaming",
  technology: "kyc.industry.technology",
  real_estate: "kyc.industry.realEstate",
  professional_services: "kyc.industry.professional",
  business_owner: "kyc.industry.businessOwner",
  retired: "kyc.industry.retired",
  other: "kyc.industry.other",
};

const SOURCE_OF_FUNDS_VALUES = [
  "employment_income",
  "business_income",
  "personal_savings",
  "investment_proceeds",
  "casino_winnings",
  "inheritance_gift",
  "other",
] as const;

const SOURCE_OF_FUNDS_KEYS: Record<(typeof SOURCE_OF_FUNDS_VALUES)[number], string> = {
  employment_income: "kyc.occupation.employment",
  business_income: "kyc.occupation.business",
  personal_savings: "kyc.occupation.savings",
  investment_proceeds: "kyc.occupation.investment",
  casino_winnings: "kyc.occupation.casino",
  inheritance_gift: "kyc.occupation.inheritance",
  other: "kyc.occupation.other",
};

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
  const { t } = useI18n();
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
  const [sumsubMessage, setSumsubMessage] = useState(t("kyc.checkingAvailability"));
  const [applicantId, setApplicantId] = useState("");
  // Case-aware: VIP 被绑定的 admission case 状态(KYC 闸门在 case 上)。
  const [caseStatus, setCaseStatus] = useState<AdmissionCaseStatus | undefined>(undefined);
  const [caseKycValidUntil, setCaseKycValidUntil] = useState<number | undefined>(undefined);
  const [caseLoading, setCaseLoading] = useState(true);

  // 减摩擦(2026-08 feedback): 只收集 level 真正需要的固定信息——姓名/出生日期/国籍/电话 + 同意。
  // 证件、住址、职业、资金来源由验证 provider(Sumsub)按其配置的 level 步骤收集, 不再自建大表单。
  const canSubmit = Boolean(
    firstName.trim()
    && lastName.trim()
    && nationality
    && dob.length === 10
    && phoneNumber.trim()
    && consentAccepted
  );
  // 演示环境(非 production)自动通过, 生产环境等待真实 provider 回调。
  const demoApproveAllowed = sumsubConfig ? sumsubConfig.environment !== "production" : false;
  const webSdkAvailable = Boolean(sumsubConfig?.configured);

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
            ? t("kyc.available")
            : t("kyc.setupPending"),
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
      setSumsubMessage(t("kyc.notConnected"));
      return;
    }
    setSumsubSubmitting(true);
    setSumsubMessage(t("kyc.submitting"));
    try {
      if (demoApproveAllowed) {
        setApplicantId(`demo-${Date.now().toString(36)}`);
        setSumsubMessage(t("kyc.submittedPending"));
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
        `${t("kyc.submittedPending")} (${start.data.reviewStatus || start.data.status})`,
      );
      syncKycState(start.data.status, start.data.rejectionReason, start.data.updatedAt);
    } catch (err) {
      setSumsubMessage(apiError(err));
    } finally {
      setSumsubSubmitting(false);
    }
  };

  // 减摩擦: 配置存在时用 Sumsub WebSDK 完成验证(level 决定步骤; 未配置回落 demo approve)。
  const [webSdkLaunching, setWebSdkLaunching] = useState(false);
  const [webSdkLaunched, setWebSdkLaunched] = useState(false);
  const webSdkContainerRef = useRef<HTMLDivElement>(null);

  const handleLaunchWebSdk = async () => {
    setWebSdkLaunching(true);
    try {
      const { data } = await sumsubApi.accessToken({
        levelName: sumsubConfig?.kycLevelName,
        ttlInSecs: 600,
      });
      setWebSdkLaunched(true);
      await launchSumsubWebSdk({
        accessToken: data.token,
        containerSelector: "#sumsub-websdk-container",
        refreshAccessToken: async () => {
          const res = await sumsubApi.accessToken({
            levelName: sumsubConfig?.kycLevelName,
            ttlInSecs: 600,
          });
          return res.data.token;
        },
        onApplicantVerificationCompleted: () => {
          setSumsubMessage(t("kyc.verificationProcessing"));
          syncKycState("pending", undefined, Math.floor(Date.now() / 1000));
          setStep("pending");
        },
        onError: (payload) => {
          setSumsubMessage(`Verification flow error: ${JSON.stringify(payload)}`);
        },
      });
    } catch (err) {
      setSumsubMessage(apiError(err));
    } finally {
      setWebSdkLaunching(false);
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
      <Shell title={t("kyc.title")} subtitle={t("kyc.verificationStatus")}>
        <div className="card-wine rounded-lg p-6 flex flex-col items-center text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive/80" />
          <h2 className="text-lg font-semibold text-foreground">{eligibility.blockerMessage}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">{eligibility.actionRequired}</p>
          {caseStatus === "kyc_failed" && (
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl border border-gold/40 px-5 py-2.5 text-sm font-semibold text-gold hover:bg-gold/10 transition-colors"
            >
              {t("kyc.retryVerification")}
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (step === "pending") {
    return (
      <Shell title={t("kyc.title")} subtitle={t("kyc.underReview")}>
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
                aria-label={t("kyc.verificationProcessing")}
              />
            </motion.div>

            {/* Status */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-warning">{t("kyc.kycPending")}</h2>
            </div>

            {/* Review timeframe */}
            <div className="card-wine rounded-xl px-5 py-4 w-full space-y-2">
              <div className="flex items-center gap-2 justify-center">
                <AlertCircle className="w-4 h-4 text-gold" />
                <p className="text-sm font-semibold text-foreground">{t("kyc.reviewTimeframe")}</p>
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
      <Shell title={t("kyc.title")} subtitle={t("kyc.verificationComplete")}>
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
            <h2 className="text-xl font-bold text-success">{t("kyc.kycApproved")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("kyc.verificationComplete")}
            </p>
          </div>
        </motion.div>
      </Shell>
    );
  }

  return (
    <Shell showBack backTo="/setup-2fa" title={t("kyc.title")} subtitle={t("kyc.subtitle")}>
      <div className="space-y-5">
        {/* Personal Info */}
        <div className="space-y-3">
          <SectionTitle icon={User}>{t("kyc.personalDetails")}</SectionTitle>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <FieldLabel>{t("kyc.firstName")}</FieldLabel>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("kyc.asShownOnId")}
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>{t("kyc.lastName")}</FieldLabel>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("kyc.asShownOnId")}
                className="bg-input border-border h-11 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel required={false}>{t("kyc.middleName")}</FieldLabel>
            <Input
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              placeholder={t("kyc.ifApplicable")}
              className="bg-input border-border h-11 rounded-xl text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <FieldLabel>{t("kyc.nationality")}</FieldLabel>
            <CountrySelect value={nationality} onValueChange={setNationality} placeholder={t("kyc.select")} />
          </div>
          <div className="space-y-2">
            <FieldLabel>{t("kyc.dateOfBirth")}</FieldLabel>
            <Input
              type="text"
              inputMode="numeric"
              value={dob}
              onChange={(e) => handleDobChange(e.target.value)}
              placeholder={t("kyc.dobPlaceholder")}
              maxLength={10}
              className="bg-input border-border h-11 rounded-xl text-sm font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <FieldLabel>{t("kyc.countryCode")}</FieldLabel>
            <Select value={phoneCountryCode} onValueChange={setPhoneCountryCode}>
              <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                <SelectValue placeholder={t("kyc.code")} />
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
            <FieldLabel>{t("kyc.mobileNumber")}</FieldLabel>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="9876 5432"
              className="bg-input border-border h-11 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* 减摩擦: 证件/住址/财务问卷由验证 provider(Sumsub)按其 level 步骤收集 */}
        <div className="card-wine rounded-xl px-4 py-3 flex items-start gap-3">
          <FileText className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Only the identity basics above are collected here. Your identity document, selfie and
            any additional checks are handled by the verification provider in its own flow — the
            exact steps depend on the configured verification level (a liveness check only runs if
            the level includes one). Documents you prepare: a valid government-issued ID and, if the
            level requires it, a proof of address.
          </p>
        </div>

        {/* Customer-facing upload preparation summary */}
        <div className="space-y-3">
          <SectionTitle icon={FileText}>{t("kyc.supportingDocuments")}</SectionTitle>

          <RequirementCard icon={FileText} title={t("kyc.idDocumentPhotos")} required>
            Passport, ID card, driver's license, or residence permit. Use original color photos with all corners visible and readable text. If both sides contain information, prepare front and back photos.
          </RequirementCard>

          <RequirementCard icon={Camera} title={t("kyc.selfie")} required>
            Be ready for a selfie or face check so the provider can match you with the identity document. A liveness (head-movement) check is only required if your verification level includes one.
          </RequirementCard>

          <RequirementCard icon={Home} title={t("kyc.proofOfAddress")}>
            Prepare a recent utility bill, bank statement, or official address document in case the verification level requests it.
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
          <p className="text-[10px] uppercase tracking-wider text-gold/80">{t("kyc.formNote")}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Fields marked with * are mandatory. Additional information may be requested later during review; document photos and selfie/liveness are not uploaded from this page.
          </p>
        </div>

        {webSdkLaunched && (
          <div
            id="sumsub-websdk-container"
            ref={webSdkContainerRef}
            className="rounded-xl border border-border/60 bg-card/40 p-2"
          />
        )}

        <div className="mt-8 space-y-3">
          {webSdkAvailable && (
            <button
              onClick={handleLaunchWebSdk}
              disabled={webSdkLaunching || webSdkLaunched || sumsubSubmitting}
              className="w-full rounded-xl border border-gold/40 py-4 text-sm font-semibold text-gold hover:bg-gold/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {webSdkLaunching ? <RotateCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Verify with provider WebSDK
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || sumsubSubmitting || sumsubLoading || webSdkLaunched}
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
