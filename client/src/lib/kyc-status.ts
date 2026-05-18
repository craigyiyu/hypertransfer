/**
 * KYC Status Management Utilities
 * Handles KYC status tracking, eligibility checks, and flow logic
 */

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
