/**
 * Responsive design utilities for mobile-first development.
 * All sizes scale from mobile → tablet → desktop.
 */

export const responsiveSpacing = {
  // Mobile-first spacing scale
  xs: "0.25rem", // 4px
  sm: "0.5rem", // 8px
  md: "1rem", // 16px
  lg: "1.5rem", // 24px
  xl: "2rem", // 32px
  "2xl": "3rem", // 48px
};

export const responsiveTypography = {
  // Mobile sizes (base)
  // Tablet sizes (md: 768px)
  // Desktop sizes (lg: 1024px)
  h1: {
    mobile: "text-2xl font-bold",
    tablet: "md:text-3xl",
    desktop: "lg:text-4xl",
  },
  h2: {
    mobile: "text-xl font-bold",
    tablet: "md:text-2xl",
    desktop: "lg:text-3xl",
  },
  h3: {
    mobile: "text-lg font-semibold",
    tablet: "md:text-xl",
    desktop: "lg:text-2xl",
  },
  body: {
    mobile: "text-sm",
    tablet: "md:text-base",
    desktop: "lg:text-base",
  },
  small: {
    mobile: "text-xs",
    tablet: "md:text-sm",
    desktop: "lg:text-sm",
  },
};

export const responsiveBreakpoints = {
  sm: "640px", // tablets
  md: "768px", // small laptops
  lg: "1024px", // desktops
  xl: "1280px", // large desktops
};

/**
 * Mobile-first touch target sizes
 * Minimum 44x44px for easy touch interaction
 */
export const touchTargetSizes = {
  small: "h-10 w-10", // 40px (minimum)
  medium: "h-12 w-12", // 48px (recommended)
  large: "h-14 w-14", // 56px (generous)
};

/**
 * Safe area padding for notched devices (iPhone X, etc.)
 * Applied via CSS env() variables in Shell component
 */
export const safeAreaPadding = {
  top: "env(safe-area-inset-top)",
  right: "env(safe-area-inset-right)",
  bottom: "env(safe-area-inset-bottom)",
  left: "env(safe-area-inset-left)",
};
