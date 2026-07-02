import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Shell from '@/components/Shell';
import { useDemo } from '@/contexts/DemoContext';
import { useI18n } from '@/contexts/I18nContext';
import { apiError } from '@/lib/api';
import {
  formatKYCStatus,
  getStatusColor,
  getStatusIcon,
  getKYCEligibility,
  getEstimatedReviewTime,
  canRetryKYC,
} from '@/lib/kyc-status';
import { sumsubApi, type SumsubKycStatus } from '@/lib/sumsub';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

const iconMap = {
  clock: Clock,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
};

export default function KYCStatus() {
  const { state, updateState } = useDemo();
  const [, setLocation] = useLocation();
  const { t } = useI18n();
  const [isChecking, setIsChecking] = useState(false);
  const [providerStatus, setProviderStatus] = useState<SumsubKycStatus | null>(null);
  const [providerMessage, setProviderMessage] = useState('Checking verification provider status...');

  const kycState = state.kyc;
  const eligibility = getKYCEligibility(kycState);
  const statusIcon = getStatusIcon(kycState.status);
  const IconComponent = iconMap[statusIcon as keyof typeof iconMap] || AlertCircle;

  const syncProviderStatus = (result: SumsubKycStatus) => {
    setProviderStatus(result);
    updateState({
      kycComplete: result.status === 'approved',
      kyc: {
        ...kycState,
        status: result.status,
        submittedAt: result.updatedAt
          ? new Date(result.updatedAt * 1000).toISOString()
          : kycState.submittedAt,
        rejectionReason: result.rejectionReason || undefined,
        lastRejectionAt:
          result.status === 'rejected'
            ? new Date().toISOString()
            : kycState.lastRejectionAt,
      },
    });
    if (!result.configured) {
      setProviderMessage('Verification provider is not configured yet.');
      return;
    }
    if (result.status === 'approved') {
      setProviderMessage('Verification approved by the provider.');
    } else if (result.status === 'rejected') {
      setProviderMessage(result.rejectionReason || 'Verification was not approved.');
    } else if (result.status === 'pending') {
      setProviderMessage('Verification is still under provider review.');
    } else {
      setProviderMessage('No KYC submission has been started for this account.');
    }
  };

  const handleRetryKYC = () => {
    updateState({
      kyc: {
        ...kycState,
        status: 'not_started',
        retryCount: kycState.retryCount + 1,
      },
    });
    setLocation('/kyc');
  };

  const handleCheckStatus = async () => {
    setIsChecking(true);
    try {
      const { data } = await sumsubApi.kycStatus();
      syncProviderStatus(data);
    } catch (err) {
      setProviderMessage(apiError(err));
    } finally {
      setIsChecking(false);
    }
  };

  const handleProceedToDeposit = () => {
    setLocation('/dashboard');
  };

  useEffect(() => {
    void handleCheckStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Status Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center ${
                    kycState.status === 'approved'
                      ? 'bg-green-500/20'
                      : kycState.status === 'rejected'
                        ? 'bg-red-500/20'
                        : kycState.status === 'pending'
                          ? 'bg-yellow-500/20'
                          : 'bg-slate-700/50'
                  }`}
                >
                  <IconComponent
                    className={`w-10 h-10 ${getStatusColor(kycState.status)}`}
                  />
                </div>
              </div>
            </div>

            <h1 className="text-3xl font-bold text-white mb-2">
              {t('kycStatus.title')}
            </h1>
            <p className="text-lg font-semibold text-gold-400 mb-4">
              {formatKYCStatus(kycState.status)}
            </p>
            <p className="text-slate-400 text-sm">
              {eligibility.blockerMessage}
            </p>
            {providerStatus && (
              <p className="mt-2 text-xs text-slate-500">
                Verification profile: {providerStatus.applicantId || 'not created'} · {providerStatus.reviewStatus || 'no review yet'}
              </p>
            )}
          </div>

          {/* Status-Specific Content */}
          <div className="space-y-6">
            {/* Approved State */}
            {kycState.status === 'approved' && (
              <Card className="border-green-500/30 bg-green-500/10 p-6">
                <div className="flex items-start gap-4">
                  <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">
                      {t('kycStatus.approved.title')}
                    </h3>
                    <p className="text-slate-300 text-sm">
                      {t('kycStatus.approved.description')}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Pending State */}
            {kycState.status === 'pending' && (
              <Card className="border-yellow-500/30 bg-yellow-500/10 p-6">
                <div className="flex items-start gap-4">
                  <Clock className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1 animate-spin" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">
                      {t('kycStatus.pending.title')}
                    </h3>
                    <p className="text-slate-300 text-sm mb-3">
                      {t('kycStatus.pending.description')}
                    </p>
                    <div className="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 mb-4">
                      <p className="font-medium text-white mb-1">
                        Provider Status
                      </p>
                      <p>{providerMessage || getEstimatedReviewTime()}</p>
                    </div>
                    <p className="text-xs text-slate-400">
                      {t('kycStatus.pending.submittedAt')}:{' '}
                      {kycState.submittedAt
                        ? new Date(kycState.submittedAt).toLocaleDateString()
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Rejected State */}
            {kycState.status === 'rejected' && (
              <Card className="border-red-500/30 bg-red-500/10 p-6">
                <div className="flex items-start gap-4">
                  <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">
                      {t('kycStatus.rejected.title')}
                    </h3>
                    <p className="text-slate-300 text-sm mb-4">
                      {t('kycStatus.rejected.description')}
                    </p>

                    {kycState.rejectionReason && (
                      <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
                        <p className="text-xs text-slate-400 font-medium mb-1">
                          {t('kycStatus.rejected.reason')}
                        </p>
                        <p className="text-sm text-slate-300">
                          {kycState.rejectionReason}
                        </p>
                      </div>
                    )}

                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                      <p className="text-xs text-blue-300 font-medium mb-1">
                        {t('kycStatus.rejected.nextSteps')}
                      </p>
                      <ul className="text-sm text-blue-300 space-y-1 list-disc list-inside">
                        <li>Review the rejection reason</li>
                        <li>Gather required documents</li>
                        <li>Resubmit your KYC</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Not Started State */}
            {kycState.status === 'not_started' && (
              <Card className="border-slate-700/50 bg-slate-800/30 p-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-slate-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-2">
                      {t('kycStatus.notStarted.title')}
                    </h3>
                    <p className="text-slate-300 text-sm">
                      {t('kycStatus.notStarted.description')}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Requirements Card */}
            <Card className="border-slate-700/50 bg-slate-800/30 p-6">
              <h3 className="font-semibold text-white mb-4">
                {t('kycStatus.requirements.title')}
              </h3>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <div className="w-2 h-2 rounded-full bg-gold-400"></div>
                  Valid government-issued ID
                </li>
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <div className="w-2 h-2 rounded-full bg-gold-400"></div>
                  Proof of address (utility bill, bank statement)
                </li>
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <div className="w-2 h-2 rounded-full bg-gold-400"></div>
                  Source of funds documentation
                </li>
              </ul>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 pt-4">
              {kycState.status === 'approved' && (
                <Button
                  onClick={handleProceedToDeposit}
                  className="w-full bg-gold-500 hover:bg-gold-600 text-black font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  {t('kycStatus.approved.button')}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}

              {kycState.status === 'pending' && (
                <Button
                  onClick={handleCheckStatus}
                  disabled={isChecking}
                  className="w-full bg-gold-500 hover:bg-gold-600 text-black font-semibold py-3 rounded-lg"
                >
                  {isChecking ? 'Checking verification status...' : t('kycStatus.pending.checkButton')}
                </Button>
              )}

              {kycState.status === 'not_started' && (
                <Button
                  onClick={() => setLocation('/kyc')}
                  className="w-full bg-gold-500 hover:bg-gold-600 text-black font-semibold py-3 rounded-lg"
                >
                  Start Verification
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}

              {kycState.status === 'rejected' && canRetryKYC(kycState) && (
                <Button
                  onClick={handleRetryKYC}
                  className="w-full bg-gold-500 hover:bg-gold-600 text-black font-semibold py-3 rounded-lg disabled:opacity-50"
                >
                  {t('kycStatus.rejected.retryButton')}
                </Button>
              )}

              <Button
                onClick={() => setLocation('/support')}
                variant="outline"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800/50 py-3 rounded-lg"
              >
                {t('kycStatus.supportButton')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
