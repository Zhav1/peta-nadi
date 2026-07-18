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
        "on-secondary-container": "#b2b9bf",
        "inverse-on-surface": "#2f3035",
        "on-surface": "#e2e2e8",
        "error-container": "#93000a",
        "surface-container-high": "#282a2e",
        "on-primary-container": "#006970",
        "on-primary-fixed-variant": "#004f54",
        "primary-fixed-dim": "#00dbe9",
        "outline": "#849495",
        "surface-container-low": "#1a1c20",
        "on-tertiary": "#452b00",
        "tertiary-fixed-dim": "#ffb950",
        "primary": "#dbfcff",
        "on-secondary-fixed": "#151d21",
        "tertiary-container": "#ffd296",
        "on-background": "#e2e2e8",
        "on-tertiary-container": "#825500",
        "on-primary": "#00363a",
        "on-primary-fixed": "#002022",
        "on-tertiary-fixed-variant": "#624000",
        "surface-bright": "#37393e",
        "on-secondary": "#2a3136",
        "surface-dim": "#111317",
        "on-surface-variant": "#b9cacb",
        "error": "#ffb4ab",
        "inverse-surface": "#e2e2e8",
        "surface-tint": "#00dbe9",
        "secondary-fixed": "#dce4e9",
        "surface-container-highest": "#333539",
        "primary-container": "#00f0ff",
        "on-error": "#690005",
        "tertiary-fixed": "#ffddb3",
        "primary-fixed": "#7df4ff",
        "on-secondary-fixed-variant": "#40484c",
        "secondary-container": "#424a4f",
        "secondary": "#c0c8cd",
        "surface-container-lowest": "#0c0e12",
        "inverse-primary": "#006970",
        "outline-variant": "#3b494b",
        "on-tertiary-fixed": "#291800",
        "surface": "#111317",
        "tertiary": "#fff4ea",
        "on-error-container": "#ffdad6",
        "surface-variant": "#333539",
        "surface-container": "#1e2024",
        "secondary-fixed-dim": "#c0c8cd"
      },
      fontFamily: {
        "headline": ["Space Grotesk"],
        "body": ["Inter"],
        "label": ["Inter"]
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      }
    },
  },
  plugins: [],
};
export default config;
