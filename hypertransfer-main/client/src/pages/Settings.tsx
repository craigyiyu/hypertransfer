/**
 * Settings / Profile — Full account profile page with account info,
 * security settings, language, and logout.
 * Design: Dark canvas, gold accents, single-column layout.
 */
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import { useI18n } from "@/contexts/I18nContext";
import Shell from "@/components/Shell";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { motion } from "framer-motion";
import {
  Shield,
  Lock,
  Clock,
  LogOut,
  ChevronRight,
  Globe,
  User,
  Mail,
  Phone,
  Hash,
  CheckCircle2,
} from "lucide-react";

export default function Settings() {
  const [, navigate] = useLocation();
  const { state, resetAll } = useDemo();
  const { t } = useI18n();

  const handleLogout = () => {
    resetAll();
    navigate("/");
  };

  return (
    <Shell
      title="Account Profile"
      subtitle="Manage your account and security"
      showBack
      backTo="/dashboard"
    >
      <div className="space-y-4">
        {/* Profile Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-gold rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-gold" />
            Account Information
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20">
              <User className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t("settings.fullName")}</p>
                <p className="text-sm font-medium text-foreground">{state.patronName || "Not provided"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t("settings.email")}</p>
                <p className="text-sm font-medium text-foreground">{state.patronEmail || "Not provided"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t("settings.mobileNumber")}</p>
                <p className="text-sm font-medium text-foreground">{state.patronPhone || "Not provided"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{t("settings.accountId")}</p>
                <p className="text-sm font-medium text-foreground font-mono">{state.patronId}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Security Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card-gold rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-gold" />
            Security Settings
          </h3>
          <div className="space-y-3">
            <button className="w-full flex items-center justify-between p-3 rounded-lg border border-border/30 hover:border-gold/30 hover:bg-secondary/30 transition-all duration-200 group">
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-muted-foreground group-hover:text-gold" />
                <div className="text-left">
                  <p className="text-sm text-foreground">{t("settings.twoFactorAuth")}</p>
                  <p className="text-xs text-success mt-0.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Enabled
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button className="w-full flex items-center justify-between p-3 rounded-lg border border-border/30 hover:border-gold/30 hover:bg-secondary/30 transition-all duration-200 group">
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-muted-foreground group-hover:text-gold" />
                <div className="text-left">
                  <p className="text-sm text-foreground">{t("settings.changePassword")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.updatePassword")}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/30">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                <div className="text-left">
                  <p className="text-sm text-foreground">KYC Verification</p>
                  <p className={`text-xs mt-0.5 ${state.kycComplete ? "text-success" : "text-warning"}`}>
                    {state.kycComplete ? "Approved" : state.kyc.status === "pending" ? "Pending Review" : "Not Started"}
                  </p>
                  {state.kycComplete && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Valid until May 1, 2027
                    </p>
                  )}
                </div>
              </div>
              {!state.kycComplete && (
                <button
                  onClick={() => navigate("/kyc")}
                  className="text-xs text-gold hover:text-gold-bright transition-colors"
                >
                  Complete
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Language Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-gold rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-gold" />
            {t("settings.language")}
          </h3>
          <div className="flex justify-center">
            <LanguageSwitcher />
          </div>
        </motion.div>

        {/* Account Activity Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card-gold rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gold" />
            Account Activity
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
              <p className="text-xs text-muted-foreground">{t("settings.accountCreated")}</p>
              <p className="text-sm font-medium text-foreground">Today at 2:30 PM</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
              <p className="text-xs text-muted-foreground">{t("settings.lastLogin")}</p>
              <p className="text-sm font-medium text-foreground">May 1, 2025 13:54</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
              <p className="text-xs text-muted-foreground">{t("settings.totalDeposits")}</p>
              <p className="text-sm font-medium text-foreground">{state.transactions.length} transaction{state.transactions.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </motion.div>

        {/* Logout Section */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={handleLogout}
          className="w-full card-wine rounded-xl p-4 flex items-center justify-center gap-2 hover:border-destructive/40 transition-all duration-200 group"
        >
          <LogOut className="w-4 h-4 text-destructive group-hover:text-destructive/80" />
          <span className="text-sm font-semibold text-destructive group-hover:text-destructive/80">
            Logout
          </span>
        </motion.button>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground text-center pt-4">
          For security, you'll be logged out after 30 minutes of inactivity.
        </p>
      </div>
    </Shell>
  );
}
