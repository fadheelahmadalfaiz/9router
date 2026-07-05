// 9Router color palette
// Light theme: warm neutral surfaces with citron primary
// Dark theme: deep neutral surfaces with violet secondary accent

export const COLORS = {
  // Primary - citron (#c4bf1f)
  primary: {
    DEFAULT: "#c4bf1f",
    hover: "#9d9919",
    light: "#d9d23c",
    dark: "#4f4d0d",
  },

  // Secondary - violet companion with accessible contrast
  secondary: {
    DEFAULT: "#2b245e",
    hover: "#423883",
    light: "#8c7cf7",
    lightHover: "#b8afff",
    dark: "#1d1845",
  },

  // Light theme backgrounds
  light: {
    bg: "#FBF9F6",
    bgAlt: "#F5F1ED",
    surface: "#FFFFFF",
    sidebar: "rgba(246, 246, 246, 0.8)",
    border: "rgba(0, 0, 0, 0.1)",
    textMain: "#383733",
    textMuted: "#75736E",
  },

  // Dark theme backgrounds
  dark: {
    bg: "#191918",
    bgAlt: "#1F1F1E",
    surface: "#242423",
    sidebar: "rgba(30, 30, 30, 0.8)",
    border: "rgba(255, 255, 255, 0.1)",
    textMain: "#ECEBE8",
    textMuted: "#9E9D99",
  },

  // Status colors
  status: {
    success: "#22C55E",
    successLight: "#DCFCE7",
    successDark: "#166534",
    warning: "#F59E0B",
    warningLight: "#FEF3C7",
    warningDark: "#92400E",
    error: "#EF4444",
    errorLight: "#FEE2E2",
    errorDark: "#991B1B",
    info: "#3B82F6",
    infoLight: "#DBEAFE",
    infoDark: "#1E40AF",
  },
};

// CSS Variables mapping for Tailwind
export const CSS_VARIABLES = {
  light: {
    "--color-primary": COLORS.primary.DEFAULT,
    "--color-primary-hover": COLORS.primary.hover,
    "--color-secondary": COLORS.secondary.DEFAULT,
    "--color-secondary-hover": COLORS.secondary.hover,
    "--color-bg": COLORS.light.bg,
    "--color-bg-alt": COLORS.light.bgAlt,
    "--color-surface": COLORS.light.surface,
    "--color-sidebar": COLORS.light.sidebar,
    "--color-border": COLORS.light.border,
    "--color-text-main": COLORS.light.textMain,
    "--color-text-muted": COLORS.light.textMuted,
  },
  dark: {
    "--color-primary": COLORS.primary.DEFAULT,
    "--color-primary-hover": COLORS.primary.light,
    "--color-secondary": COLORS.secondary.light,
    "--color-secondary-hover": COLORS.secondary.lightHover,
    "--color-bg": COLORS.dark.bg,
    "--color-bg-alt": COLORS.dark.bgAlt,
    "--color-surface": COLORS.dark.surface,
    "--color-sidebar": COLORS.dark.sidebar,
    "--color-border": COLORS.dark.border,
    "--color-text-main": COLORS.dark.textMain,
    "--color-text-muted": COLORS.dark.textMuted,
  },
};
