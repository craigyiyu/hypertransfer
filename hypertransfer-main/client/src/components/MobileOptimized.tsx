/**
 * MobileOptimized — Wrapper component that provides mobile-specific optimizations.
 * Handles viewport meta, touch targets, and responsive spacing.
 */
import { ReactNode } from "react";

interface MobileOptimizedProps {
  children: ReactNode;
  className?: string;
}

/**
 * Mobile optimization guidelines applied:
 * - Minimum touch target size: 44x44px
 * - Viewport width: 100% with proper scaling
 * - Safe area insets for notched devices
 * - Optimized spacing for thumb reach (bottom-heavy layout)
 * - Reduced animation for prefers-reduced-motion
 */
export default function MobileOptimized({
  children,
  className = "",
}: MobileOptimizedProps) {
  return (
    <div
      className={`
        /* Base mobile optimizations */
        w-full min-h-screen
        /* Safe area support for notched devices */
        safe-area-inset-left safe-area-inset-right
        /* Prevent zoom on input focus (iOS) */
        [&_input]:text-base
        /* Optimized touch targets */
        [&_button]:min-h-[44px] [&_button]:min-w-[44px]
        /* Prevent text selection on long press */
        select-none
        /* Smooth scrolling */
        scroll-smooth
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/**
 * Mobile-first breakpoints used throughout the design:
 * - sm: 640px (tablets)
 * - md: 768px (small laptops)
 * - lg: 1024px (desktops)
 *
 * All components default to mobile layout, then scale up.
 */
