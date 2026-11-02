import animate from "tailwindcss-animate";

const shades = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const tremorSafelist = shades.flatMap((shade) => {
  const classes = [
    ...["bg", "text", "border", "ring", "fill", "stroke", "from", "to", "via", "decoration"].map(
      (utility) => `${utility}-emerald-${shade}`,
    ),
    ...["fill", "stroke", "bg"].flatMap((utility) =>
      ["10", "20", "25", "30", "40", "50", "60", "70", "80", "90"].map(
        (opacity) => `${utility}-emerald-${shade}/${opacity}`,
      ),
    ),
  ];
  return [...classes, ...classes.map((className) => `dark:${className}`)];
});

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        spotify: {
          DEFAULT: "#1ed760",
          bright: "#1fdf64",
          dark: "#12833b",
        },
        ink: {
          950: "#000000",
          900: "#0a0a0a",
          850: "#121212",
          800: "#181818",
          700: "#1f1f1f",
          600: "#282828",
          500: "#333333",
          400: "#4d4d4d",
        },
        tremor: {
          brand: {
            faint: "#ecfdf5",
            muted: "#a7f3d0",
            subtle: "#34d399",
            DEFAULT: "#10b981",
            emphasis: "#047857",
            inverted: "#ffffff",
          },
          background: {
            muted: "#f9fafb",
            subtle: "#f3f4f6",
            DEFAULT: "#ffffff",
            emphasis: "#374151",
          },
          border: { DEFAULT: "#e5e7eb" },
          ring: { DEFAULT: "#e5e7eb" },
          content: {
            subtle: "#9ca3af",
            DEFAULT: "#6b7280",
            emphasis: "#374151",
            strong: "#111827",
            inverted: "#ffffff",
          },
        },
        "dark-tremor": {
          brand: {
            faint: "#052e1c",
            muted: "#065f36",
            subtle: "#059669",
            DEFAULT: "#10b981",
            emphasis: "#6ee7b7",
            inverted: "#ffffff",
          },
          background: {
            muted: "#0d0d0d",
            subtle: "#181818",
            DEFAULT: "#181818",
            emphasis: "#d1d5db",
          },
          border: { DEFAULT: "#2a2a2a" },
          ring: { DEFAULT: "#2a2a2a" },
          content: {
            subtle: "#6b7280",
            DEFAULT: "#9ca3af",
            emphasis: "#d1d5db",
            strong: "#f9fafb",
            inverted: "#111827",
          },
        },
      },
      boxShadow: {
        player: "0 -8px 30px rgba(0,0,0,0.55)",
        card: "0 8px 28px rgba(0,0,0,0.45)",
        glow: "0 12px 40px -12px rgba(30,215,96,0.55)",
        "tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      },
      fontSize: {
        "tremor-label": ["0.75rem", { lineHeight: "1rem" }],
        "tremor-default": ["0.875rem", { lineHeight: "1.25rem" }],
        "tremor-title": ["1.125rem", { lineHeight: "1.75rem" }],
        "tremor-metric": ["1.875rem", { lineHeight: "2.25rem" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "tremor-small": "0.375rem",
        "tremor-default": "0.5rem",
        "tremor-full": "9999px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Display",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "equalize-1": {
          "0%, 100%": { height: "30%" },
          "50%": { height: "100%" },
        },
        "equalize-2": {
          "0%, 100%": { height: "80%" },
          "50%": { height: "35%" },
        },
        "equalize-3": {
          "0%, 100%": { height: "55%" },
          "50%": { height: "95%" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.35s ease-out both",
        "scale-in": "scale-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s cubic-bezier(0.16,1,0.3,1)",
        shimmer: "shimmer 1.6s infinite",
        "equalize-1": "equalize-1 0.9s ease-in-out infinite",
        "equalize-2": "equalize-2 1.1s ease-in-out infinite",
        "equalize-3": "equalize-3 0.8s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
  safelist: [
    ...tremorSafelist,
    // Tremor builds ProgressBar color classes dynamically, so keep the accent
    // values used by the admin KPI cards in the compiled stylesheet.
    "bg-sky-500",
    "bg-violet-500",
    "bg-amber-500",
  ],
};
