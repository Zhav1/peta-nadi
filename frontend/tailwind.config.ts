import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          DEFAULT: "#080d14",
          elevated: "#0c1017",
          subtle: "#121822",
        },
        brand: {
          primary: "#ffffff",
          foreground: "#080d14",
        },
        status: {
          critical: "#ef4444",
          warning: "#f59e0b",
          clear: "#10b981",
          info: "#38bdf8",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        headline: ["var(--font-headline)", "Space Grotesk", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      borderRadius: {
        sm: "0.25rem",    // 4px
        DEFAULT: "0.5rem", // 8px
        md: "0.5rem",     // 8px
        lg: "0.75rem",    // 12px
        xl: "1rem",       // 16px
        "2xl": "1.5rem",   // 24px
        full: "9999px",
      },
    },
  },
  plugins: [],
};
export default config;
