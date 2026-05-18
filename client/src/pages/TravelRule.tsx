/**
 * TravelRule — Collects FATF Travel Rule data (originator info).
 * Triggered conditionally during the deposit flow when amount >= 8,000 USD.
 * After submission, returns to /main-deposit to complete the deposit.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scale, Info } from "lucide-react";

export default function TravelRule() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [sourceOfFunds, setSourceOfFunds] = useState("");

  const canSubmit = address && city && country && sourceOfFunds;

  const handleSubmit = () => {
    updateState({ travelRuleComplete: true });
    // Return to deposit flow to complete the main deposit
    navigate("/main-deposit");
  };

  return (
    <Shell showBack backTo="/main-deposit" title="Travel Rule Information" subtitle="Required for transfers of USD 8,000 or above">
      <div className="space-y-5">
        {/* Info */}
        <div className="card-wine rounded-xl px-4 py-3 flex items-start gap-3">
          <Scale className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-gold font-medium">Travel Rule Required:</span> For transfers of USD 8,000 or above, we collect your information for regulatory compliance. This takes about 2 minutes and your data is never shared for marketing.
          </p>
        </div>

        {/* Residential Address */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Residential Address</Label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address"
            className="bg-input border-border h-11 rounded-xl text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">City</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="bg-input border-border h-11 rounded-xl text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="hk">Hong Kong</SelectItem>
                <SelectItem value="cn">China</SelectItem>
                <SelectItem value="sg">Singapore</SelectItem>
                <SelectItem value="jp">Japan</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Source of Funds */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            Source of Funds
            <Info className="w-3 h-3 text-muted-foreground/50" />
          </Label>
          <Select value={sourceOfFunds} onValueChange={setSourceOfFunds}>
            <SelectTrigger className="bg-input border-border h-11 rounded-xl text-sm">
              <SelectValue placeholder="Select source of funds" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="employment">Employment Income</SelectItem>
              <SelectItem value="business">Business Revenue</SelectItem>
              <SelectItem value="investment">Investment Returns</SelectItem>
              <SelectItem value="savings">Personal Savings</SelectItem>
              <SelectItem value="inheritance">Inheritance</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Submit & Continue to Deposit
        </button>
      </div>
    </Shell>
  );
}
