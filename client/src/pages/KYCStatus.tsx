/**
 * KYCStatus — View KYC verification status with design token consistency.
 * Uses the same gold/wine color system as the rest of the app.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import Shell from '@/components/Shell';
import { useDemo } from '@/contexts/DemoContext';
import { useI18n } from '@/contexts/I18nContext';
import {
  formatKYCStatus,
  getStatusColor,
  getStatusIcon,
  getKYCEligibility,
  getEstimatedReviewTime,
  canRetryKYC,
} from '@/lib/kyc-status';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { motion } from 'framer-motion';

const iconMap = {
  clock: Clock,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
};

export default function KYCStatus() {
  const { state, updateState } = useDemo();
  const [, setLocation] = useLocation();
  const { t } = useI18n();
  const [isRetrying, setIsRetrying] = useState(false);

  const kycState = state.kyc;
  const eligibility = getKYCEligibility(kycState);
  const statusIcon = getStatusIcon(kycState.status);
  const IconComponent = iconMap[statusIcon as keyof typeof iconMap] || AlertCircle;

  const handleRetryKYC = () => {
    setIsRetrying(true);
    setTimeout(() => {
      updateState({
        kyc: {
          ...kycState,
          status: 'pending',
          submittedAt: new Date().toISOString(),
          retryCount: kycState.retryCount + 1,
        },
      });
      setIsRetrying(false);
    }, 500);
  };

  const handleCheckStatus = () => {
    // Simulate status check - in production, this would call an API
    setTimeout(() => {
      updateState({
        kyc: {
          ...kycState,
          status: 'approved',
          submittedAt: new Date().toISOString(),
        },
      });
    }, 1500);
  };

  const handleProceedToDeposit = () => {
    setLocation('/dashboard');
  };

  // Status-specific styling using design tokens
  const getStatusStyles = () => {
    switch (kycState.status) {
      case 'approved':
        return {
          bgIcon: 'bg-success/10',
          iconColor: 'text-success',
          cardClass: 'card-gold',
          borderClass: 'border-success/20',
        };
      case 'pending':
        return {
          bgIcon: 'bg-warning/10',
          iconColor: 'text-warning',
          cardClass: 'card-wine',
          borderClass: 'border-warning/20',
        };
      case 'rejected':
        return {
          bgIcon: 'bg-destructive/10',
          iconColor: 'text-destructive',
          cardClass: 'card-gold',
          borderClass: 'border-destructive/20',
        };
      default:
        return {
          bgIcon: 'bg-muted/10',
          iconColor: 'text-muted-foreground',
          cardClass: 'card-gold',
          borderClass: 'border-border',
        };
    }
  };

  const statusStyles = getStatusStyles();

  return (
    <Shell showBack backTo="/dashboard" title="KYC Verification Status">
      <div className="space-y-6">
        {/* Status Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="flex justify-center mb-6">
            <div className={`w-20 h-20 rounded-full ${statusStyles.bgIcon} flex items-center justify-center`}>
              <IconComponent className={`w-10 h-10 ${statusStyles.iconColor}`} />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">
            {t('kycStatus.title')}
          </h1>
          <p className="text-sm text-gold font-semibold mb-2">
            {formatKYCStatus(kycState.status)}
          </p>
          <p className="text-xs text-muted-foreground">
            {eligibility.blockerMessage}
          </p>
        </motion.div>

        {/* Status-Specific Content */}
        <div className="space-y-4">
          {/* Approved State */}
          {kycState.status === 'approved' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${statusStyles.cardClass} rounded-xl p-5 space-y-3`}
            >
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-sm">
                    {t('kycStatus.approved.title')}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {t('kycStatus.approved.description')}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Pending State */}
          {kycState.status === 'pending' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${statusStyles.cardClass} rounded-xl p-5 space-y-3`}
            >
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-warning shrink-0 mt-0.5 animate-spin" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-sm">
                    {t('kycStatus.pending.title')}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {t('kycStatus.pending.description')}
                  </p>
                </div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                <p className="font-medium text-foreground text-xs">
                  {t('kycStatus.pending.estimatedTime')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getEstimatedReviewTime()}
                </p>
              </div>

              <p className="text-xs text-muted-foreground/60">
                {t('kycStatus.pending.submittedAt')}:{' '}
                {kycState.submittedAt
                  ? new Date(kycState.submittedAt).toLocaleDateString()
                  : 'N/A'}
              </p>
            </motion.div>
          )}

          {/* Rejected State */}
          {kycState.status === 'rejected' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${statusStyles.cardClass} rounded-xl p-5 space-y-3`}
            >
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-sm">
                    {t('kycStatus.rejected.title')}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {t('kycStatus.rejected.description')}
                  </p>
                </div>
              </div>

              {kycState.rejectionReason && (
                <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">
                    {t('kycStatus.rejected.reason')}
                  </p>
                  <p className="text-xs text-foreground">
                    {kycState.rejectionReason}
                  </p>
                </div>
              )}

              <div className="card-wine rounded-lg p-3 space-y-2">
                <p className="text-xs text-gold font-medium">
                  {t('kycStatus.rejected.nextSteps')}
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Review the rejection reason</li>
                  <li>Gather required documents</li>
                  <li>Resubmit your KYC</li>
                </ul>
              </div>
            </motion.div>
          )}

          {/* Not Started State */}
          {kycState.status === 'not_started' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${statusStyles.cardClass} rounded-xl p-5 space-y-3`}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-sm">
                    {t('kycStatus.notStarted.title')}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {t('kycStatus.notStarted.description')}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Requirements Card */}
          <div className={`${statusStyles.cardClass} rounded-xl p-5 space-y-3`}>
            <h3 className="font-semibold text-foreground text-sm">
              {t('kycStatus.requirements.title')}
            </h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-gold shrink-0"></div>
                Valid government-issued ID
              </li>
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-gold shrink-0"></div>
                Proof of address (utility bill, bank statement)
              </li>
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-gold shrink-0"></div>
                Source of funds documentation
              </li>
            </ul>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-4">
          {kycState.status === 'approved' && (
            <button
              onClick={handleProceedToDeposit}
              className="w-full btn-gold rounded-xl py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2"
            >
              {t('kycStatus.approved.button')}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {kycState.status === 'pending' && (
            <button
              onClick={handleCheckStatus}
              className="w-full btn-gold rounded-xl py-3 px-4 text-sm font-semibold"
            >
              {t('kycStatus.pending.checkButton')}
            </button>
          )}

          {kycState.status === 'rejected' && canRetryKYC(kycState) && (
            <button
              onClick={handleRetryKYC}
              disabled={isRetrying}
              className="w-full btn-gold rounded-xl py-3 px-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isRetrying ? 'Resubmitting...' : t('kycStatus.rejected.retryButton')}
            </button>
          )}

          <button
            onClick={() => setLocation('/support')}
            className="w-full rounded-xl py-3 px-4 text-sm font-medium border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all"
          >
            {t('kycStatus.supportButton')}
          </button>
        </div>
      </div>
    </Shell>
  );
}
