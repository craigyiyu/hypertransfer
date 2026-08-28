/**
 * KYC Status Management Utilities
 * Handles KYC status tracking, eligibility checks, and flow logic
 */

import type { AdmissionCaseStatus } from "@/lib/admission-case";

export type KYCStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

export interface KYCState {
  status: KYCStatus;
  submittedAt?: string;
  rejectionReason?: string;
  retryCount: number;
  lastRejectionAt?: string;
}

export interface KYCEligibility {
  canDeposit: boolean;
  canRetryKYC: boolean;
  blockerMessage?: string;
  actionRequired?: string;
}

/**
 * Determine if user can proceed to deposit based on KYC status
 */
export function canProceedToDeposit(kycState: KYCState): boolean {
  return kycState.status === 'approved';
}

/**
 * Get eligibility status and messages
 */
export function getKYCEligibility(kycState: KYCState): KYCEligibility {
  switch (kycState.status) {
    case 'approved':
      return {
        canDeposit: true,
        canRetryKYC: false,
      };

    case 'pending':
      return {
        canDeposit: false,
        canRetryKYC: false,
        blockerMessage: 'Your KYC is under review',
        actionRequired: 'Please wait for approval. Estimated time: 24-48 hours',
      };

    case 'rejected':
      return {
        canDeposit: false,
        canRetryKYC: true,
        blockerMessage: 'Your KYC was not approved',
        actionRequired: `Reason: ${kycState.rejectionReason || 'Incomplete information'}. Please resubmit.`,
      };

    case 'not_started':
      return {
        canDeposit: false,
        canRetryKYC: true,
        blockerMessage: 'KYC verification required',
        actionRequired: 'Complete your KYC to proceed with deposits',
      };

    default:
      return {
        canDeposit: false,
        canRetryKYC: false,
      };
  }
}

/**
 * Calculate estimated review time based on current time
 */
export function getEstimatedReviewTime(): string {
  const now = new Date();
  const reviewTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  return reviewTime.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get retry eligibility (can retry after rejection)
 */
export function canRetryKYC(kycState: KYCState): boolean {
  if (kycState.status !== 'rejected') return false;
  
  // Allow retry if last rejection was more than 1 hour ago
  if (kycState.lastRejectionAt) {
    const lastRejection = new Date(kycState.lastRejectionAt);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return lastRejection < oneHourAgo;
  }
  
  return true;
}

/**
 * Format KYC status for display
 */
export function formatKYCStatus(status: KYCStatus): string {
  const statusMap: Record<KYCStatus, string> = {
    not_started: 'Not Started',
    pending: 'Under Review',
    approved: 'Verified',
    rejected: 'Rejected',
  };
  return statusMap[status] || 'Unknown';
}

/**
 * Get status color for UI display
 */
export function getStatusColor(status: KYCStatus): string {
  const colorMap: Record<KYCStatus, string> = {
    not_started: 'text-gray-400',
    pending: 'text-yellow-500',
    approved: 'text-green-500',
    rejected: 'text-red-500',
  };
  return colorMap[status] || 'text-gray-400';
}

/**
 * Get status icon for UI display
 */
export function getStatusIcon(status: KYCStatus): string {
  const iconMap: Record<KYCStatus, string> = {
    not_started: 'circle',
    pending: 'clock',
    approved: 'check-circle',
    rejected: 'x-circle',
  };
  return iconMap[status] || 'circle';
}

// --------------------------------------------------------------------------- //
// Case-aware KYC (Host-led VIP admission, 2026-08-21)
// --------------------------------------------------------------------------- //

export interface CaseAwareKycState {
  caseStatus?: AdmissionCaseStatus;
  /** Unix 秒; KYC 到期 = min(通过日 + 6 日历月, 最早证件到期日) */
  kycValidUntil?: number;
}

/** KYC 是否已过期(仅 case 已 kyc_passed 时有意义)。 */
export function isKycExpired(validUntil?: number, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!validUntil) return false;
  return nowSec > validUntil;
}

const TERMINAL_BLOCKED_CASE_STATUSES: ReadonlySet<string> = new Set([
  "kyc_failed",
  "kyc_expired",
  "compliance_review",
  "rejected",
  "expired",
  "revoked",
]);

/** 该 case 状态是否对 VIP 构成"不可继续"的阻断(KYC 相关)。 */
export function isKycCaseBlocked(caseStatus?: AdmissionCaseStatus): boolean {
  if (!caseStatus) return false;
  return TERMINAL_BLOCKED_CASE_STATUSES.has(caseStatus);
}

/**
 * Case-aware KYC 准入: Dashboard / 入金 / Travel Rule / leader queue 在
 * kyc_passed 且未过期前一律不可用。文案只给客户安全信息。
 */
export function getCaseAwareKYCEligibility(state: CaseAwareKycState): KYCEligibility {
  const status = state.caseStatus;
  if (!status) {
    return {
      canDeposit: false,
      canRetryKYC: false,
      blockerMessage: 'No admission case is bound to this account',
      actionRequired: 'Please contact your Host to start a VIP invitation.',
    };
  }
  switch (status) {
    case "kyc_passed":
      if (isKycExpired(state.kycValidUntil)) {
        return {
          canDeposit: false,
          canRetryKYC: true,
          blockerMessage: 'Your KYC verification has expired',
          actionRequired: 'Please complete identity verification again to continue.',
        };
      }
      return { canDeposit: true, canRetryKYC: false };
    case "kyc_in_progress":
      return {
        canDeposit: false,
        canRetryKYC: false,
        blockerMessage: 'Your KYC is being reviewed',
        actionRequired: 'Automated checks usually complete in under a minute. You will be notified once verification is done.',
      };
    case "kyc_failed":
      return {
        canDeposit: false,
        canRetryKYC: true,
        blockerMessage: 'Your KYC was not approved',
        actionRequired: 'Please resubmit your identity documents to continue.',
      };
    case "kyc_expired":
      return {
        canDeposit: false,
        canRetryKYC: true,
        blockerMessage: 'Your KYC document has expired',
        actionRequired: 'Please complete identity verification again to continue.',
      };
    case "compliance_review":
      return {
        canDeposit: false,
        canRetryKYC: false,
        blockerMessage: 'Your verification is under compliance review',
        actionRequired: 'We will contact you if more information is needed.',
      };
    case "vip_claimed":
      return {
        canDeposit: false,
        canRetryKYC: true,
        blockerMessage: 'Identity verification required',
        actionRequired: 'Complete your KYC to proceed with deposits.',
      };
    case "invitation_open":
      return {
        canDeposit: false,
        canRetryKYC: false,
        blockerMessage: 'Your invitation is open',
        actionRequired: 'Claim your invitation with the Email OTP sent to you.',
      };
    case "draft":
      return {
        canDeposit: false,
        canRetryKYC: false,
        blockerMessage: 'Your admission case is being prepared',
        actionRequired: 'Please wait for your Host to send the invitation.',
      };
    default:
      return {
        canDeposit: false,
        canRetryKYC: false,
        blockerMessage: 'This service is not yet available for your account',
        actionRequired: 'Please contact your Host or support.',
      };
  }
}
