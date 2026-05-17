/**
 * Settings — Patron account settings and preferences.
 * Design: Dark canvas, gold accents, single-column layout.
 */
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import {
  Shield,
  Lock,
  Clock,
  LogOut,
  ChevronRight,
} from "lucide-react";

export default function Settings() {
  const [, navigate] = useLocation();
  const { state, resetAll } = useDemo();

  const handleLogout = () => {
    resetAll();
    navigate("/");
  };

  return (
    <Shell
      title="Account Settings"
      subtitle="Manage your profile and security"
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
            <Shield className="w-4 h-4 text-gold" />
            Profile Information
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Full Name</p>
              <p className="text-sm font-medium text-foreground mt-1">{state.patronName || "Not provided"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Email</p>
              <p className="text-sm font-medium text-foreground mt-1">{state.patronEmail || "Not provided"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Patron ID</p>
              <p className="text-sm font-medium text-foreground mt-1 font-mono">{state.patronId}</p>
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
            Security
          </h3>
          <div className="space-y-3">
            <button className="w-full flex items-center justify-between p-3 rounded-lg border border-border/30 hover:border-gold/30 hover:bg-secondary/30 transition-all duration-200 group">
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-muted-foreground group-hover:text-gold" />
                <div className="text-left">
                  <p className="text-sm text-foreground">Two-Factor Authentication</p>
                  <p className="text-xs text-success mt-0.5">✓ Enabled</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button className="w-full flex items-center justify-between p-3 rounded-lg border border-border/30 hover:border-gold/30 hover:bg-secondary/30 transition-all duration-200 group">
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-muted-foreground group-hover:text-gold" />
                <div className="text-left">
                  <p className="text-sm text-foreground">Change Password</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Update your password</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </motion.div>

        {/* Account Activity Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-gold rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gold" />
            Account Activity
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Account Created</p>
              <p className="text-sm font-medium text-foreground mt-1">Today at 2:30 PM</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Login</p>
              <p className="text-sm font-medium text-foreground mt-1">Just now</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Deposits</p>
              <p className="text-sm font-medium text-foreground mt-1">{state.transactions.length} transaction{state.transactions.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </motion.div>

        {/* Logout Section */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
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
