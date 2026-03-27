// ── API Mode Configuration ──
// Reads from VITE_ environment variables with sensible defaults.
// In production, set VITE_API_MODE=supabase or VITE_API_MODE=dotnet
// Mock mode is only available in development.

export type ApiMode = "mock" | "supabase" | "dotnet";

const rawMode = (import.meta.env.VITE_API_MODE ||
  "mock") as string;
const isDev = import.meta.env.DEV;

// Prevent mock mode in production builds
//export const API_MODE: ApiMode = (rawMode === 'mock' && !isDev) ? 'supabase' : (rawMode as ApiMode);

export const API_MODE: ApiMode = "mock";

// .NET backend URL (when API_MODE = 'dotnet')
export const DOTNET_API_URL =
  import.meta.env.VITE_DOTNET_API_URL ||
  "https://localhost:7001/api";

// Stripe publishable key (for frontend checkout)
export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
  "pk_test_REPLACE_WITH_YOUR_KEY";

// Feature flags derived from mode
export const IS_MOCK = API_MODE === "mock";
export const IS_PRODUCTION = !isDev;