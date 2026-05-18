/**
 * KYC — Know Your Customer. Patron submits identity documents and personal information.
 * This is a blocking step before any deposits can be made.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function KYC() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const [nationality, setNationality] = useState("");
  const [dob, setDob] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idUploaded, setIdUploaded] = useState(false);
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const canSubmit = nationality && dob && idType && idNumber && idUploaded && selfieUploaded;

  const handleSubmit = () => {
    setVerifying(true);
    setTimeout(() => {
      updateState({
        kycComplete: true,
        kyc: { status: "approved", retryCount: 0 },
      });
      navigate("/travel-rule");
    }, 2000);
  };

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
          disabled={!canSubmit || verifying}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {verifying ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full"
              />
              Verifying...
            </>
          ) : (
            "Submit for Verification"
          )}
        </button>
      </div>
    </Shell>
  );
}
