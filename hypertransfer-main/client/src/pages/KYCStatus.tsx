import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Shell from '@/components/Shell';
import { useDemo } from '@/contexts/DemoContext';
import { admissionApi, apiError } from '@/lib/api';
import {
  formatKYCStatus,
  getStatusColor,
  getStatusIcon,
  getKYCEligibility,
  getEstimatedReviewTime,
  canRetryKYC,
  getCaseAwareKYCEligibility,
  isKycCaseBlocked,
} from '@/lib/kyc-status';
import type { AdmissionCaseStatus } from '@/lib/admission-case';
import type { CasePaymentView } from '@/lib/api';
import AdmissionJourney from '@/components/AdmissionJourney';
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
  const [isChecking, setIsChecking] = useState(false);
  const [providerStatus, setProviderStatus] = useState<SumsubKycStatus | null>(null);
  const [providerMessage, setProviderMessage] = useState('Checking verification status...');
  // Case-aware: KYC 状态与到期日以被绑定的 admission case 为准。
  const [caseStatus, setCaseStatus] = useState<AdmissionCaseStatus | undefined>(undefined);
  const [caseKycValidUntil, setCaseKycValidUntil] = useState<number | undefined>(undefined);
  const [casePayments, setCasePayments] = useState<CasePaymentView[]>([]);

  const kycState = state.kyc;
  const eligibility = getKYCEligibility(kycState);
  const caseEligibility = getCaseAwareKYCEligibility({
    caseStatus,
    kycValidUntil: caseKycValidUntil,
  });
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
      setProviderMessage('Verification is not available yet. Please contact support.');
      return;
    }
    if (result.status === 'approved') {
      setProviderMessage('Verification approved.');
    } else if (result.status === 'rejected') {
      // Case-aware: 只给客户安全的重交指引, 绝不展示 provider 原始拒绝细节。
      setProviderMessage(
        caseStatus
          ? caseEligibility.actionRequired || 'Please resubmit your identity documents.'
          : result.rejectionReason || 'Verification was not approved.',
      );
    } else if (result.status === 'pending') {
      setProviderMessage('Automated checks usually complete in under a minute. You will be notified once verification is done.');
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

  // Case-aware: 读取被绑定的 admission case。
  useEffect(() => {
    let cancelled = false;
    admissionApi
      .patronMine()
      .then((res) => {
        if (cancelled) return;
        setCaseStatus(res.data.case.status);
        setCaseKycValidUntil(res.data.case.kycValidUntil ?? undefined);
        setCasePayments(res.data.case.payments ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setCaseStatus(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Shell>
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-background px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {caseStatus && <AdmissionJourney status={caseStatus} payments={casePayments} />}
          {/* Status Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center ${
                    kycState.status === 'approved'
                      ? 'bg-success/20'
                      : kycState.status === 'rejected'
                        ? 'bg-destructive/20'
                        : kycState.status === 'pending'
                          ? 'bg-warning/20'
                          : 'bg-secondary/50'
                  }`}
                >
                  <IconComponent
                    className={`w-10 h-10 ${getStatusColor(kycState.status)}`}
                  />
                </div>
              </div>
            </div>

            <h1 className="text-3xl font-bold text-foreground mb-2">
              Identity Verification
            </h1>
            <p className="text-lg font-semibold text-gold mb-4">
              {formatKYCStatus(kycState.status)}
            </p>
            <p className="text-sm text-muted-foreground">
              {eligibility.blockerMessage}
            </p>
          </div>

          {/* Status-Specific Content */}
          <div className="space-y-6">
            {/* Approved State */}
            {kycState.status === 'approved' && (
              <Card className="border-success/30 bg-success/10 p-6">
                <div className="flex items-start gap-4">
                  <CheckCircle className="w-6 h-6 text-success flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-2">
                      Verification Complete
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Your identity verification is complete. You can now continue with deposits.
                    </p>
                    {caseStatus === 'kyc_passed' && caseKycValidUntil && (
                      <p className="text-xs text-muted-foreground mt-3">
                        KYC valid until{' '}
                        {new Date(caseKycValidUntil * 1000).toLocaleDateString()}.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Pending State */}
            {kycState.status === 'pending' && (
              <Card className="border-warning/30 bg-warning/10 p-6">
                <div className="flex items-start gap-4">
                  <Clock className="w-6 h-6 text-warning flex-shrink-0 mt-1 animate-spin" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-2">
                      Review in Progress
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Your information has been submitted and is being reviewed.
                    </p>
                    <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground mb-4">
                      {providerMessage || getEstimatedReviewTime()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted:{' '}
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
              <Card className="border-destructive/30 bg-destructive/10 p-6">
                <div className="flex items-start gap-4">
                  <XCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-2">
                      Verification Not Approved
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      We could not approve the submitted information. Please review the reason and submit again.
                    </p>

                    {caseStatus ? (
                      // Case-aware: 客户只拿安全重交指引, 不展示 provider 原始细节。
                      <div className="bg-muted rounded-lg p-3 mb-4">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Next steps</p>
                        <p className="text-sm text-foreground">
                          {caseEligibility.actionRequired ||
                            'Please resubmit your identity documents to continue.'}
                        </p>
                      </div>
                    ) : (
                      kycState.rejectionReason && (
                        <div className="bg-muted rounded-lg p-3 mb-4">
                          <p className="text-xs text-muted-foreground font-medium mb-1">Reason</p>
                          <p className="text-sm text-foreground">{kycState.rejectionReason}</p>
                        </div>
                      )
                    )}

                    <div className="bg-accent border border-border rounded-lg p-3">
                      <p className="text-xs text-accent-foreground font-medium mb-1">
                        Next steps
                      </p>
                      <ul className="text-sm text-accent-foreground space-y-1 list-disc list-inside">
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
              <Card className="border-border bg-card p-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-slate-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-2">
                      Verification Required
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Complete identity verification before creating a deposit.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Requirements Card */}
            <Card className="border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">
                Supporting Documents
              </h3>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm text-foreground">
                  <div className="w-2 h-2 rounded-full bg-gold-400"></div>
                  Valid government-issued ID
                </li>
                <li className="flex items-center gap-3 text-sm text-foreground">
                  <div className="w-2 h-2 rounded-full bg-gold-400"></div>
                  Proof of address (utility bill, bank statement)
                </li>
                <li className="flex items-center gap-3 text-sm text-foreground">
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
                  className="w-full bg-gold hover:bg-gold-bright text-primary-foreground font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  Back to Dashboard
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}

              {kycState.status === 'pending' && (
                <Button
                  onClick={handleCheckStatus}
                  disabled={isChecking}
                  className="w-full bg-gold hover:bg-gold-bright text-primary-foreground font-semibold py-3 rounded-lg"
                >
                  {isChecking ? 'Checking verification status...' : 'Check Status'}
                </Button>
              )}

              {kycState.status === 'not_started' && (
                <Button
                  onClick={() => setLocation('/kyc')}
                  className="w-full bg-gold hover:bg-gold-bright text-primary-foreground font-semibold py-3 rounded-lg"
                >
                  Start Verification
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}

              {kycState.status === 'rejected' && canRetryKYC(kycState) && (
                <Button
                  onClick={handleRetryKYC}
                  className="w-full bg-gold hover:bg-gold-bright text-primary-foreground font-semibold py-3 rounded-lg disabled:opacity-50"
                >
                  Retry Verification
                </Button>
              )}

              <Button
                onClick={() => setLocation('/support')}
                variant="outline"
                className="w-full border-border text-muted-foreground hover:bg-secondary/50 py-3 rounded-lg"
              >
                Contact Support
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
