// ── Unified API layer with mock/supabase/dotnet backends ──
import { API_MODE } from "../config";

// ── Mock imports ──
import {
  mockSignup,
  mockLogin,
  mockLogout,
  mockGetUserProfile,
  mockDeductCredits,
  mockPurchaseTier,
  mockGetPricing,
  mockGetAdminUsers,
  mockGetAdminAnalytics,
  mockUpdateAdminPricing,
  mockAdminUpdateUser,
  mockAdminDeleteUser,
  mockPromoteToAdmin,
  getMockSupabase,
  mockBuyCredits,
  mockCancelSubscription,
  mockGetUserHistory,
} from "./api-mock";

// ── .NET imports ──
import {
  dotnetSignup,
  dotnetLogin,
  dotnetLogout,
  dotnetGetUserProfile,
  dotnetDeductCredits,
  dotnetPurchaseTier,
  dotnetGetPricing,
  dotnetGetAdminUsers,
  dotnetGetAdminAnalytics,
  dotnetUpdateAdminPricing,
  dotnetAdminUpdateUser,
  dotnetAdminDeleteUser,
  dotnetPromoteToAdmin,
  getDotnetSupabase,
  dotnetBuyCredits,
  dotnetCancelSubscription,
  dotnetGetUserHistory,
  dotnetVerifyCheckoutSession,
  dotnetGenerateAiImage,
  dotnetForgotPassword,
  dotnetResendVerification,
  dotnetUpdatePassword,
  dotnetCreateCheckoutSession,
} from "./api-dotnet";

// ── Supabase imports (only used when mode = 'supabase') ──
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { createClient } from "@supabase/supabase-js";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-ba0ed251`;
const SUPABASE_URL = `https://${projectId}.supabase.co`;

let supabaseInstance: any = null;
const getRealSupabase = () => {
  if (!supabaseInstance)
    supabaseInstance = createClient(
      SUPABASE_URL,
      publicAnonKey,
    );
  return supabaseInstance;
};

// ── Unified getSupabase (returns real, mock, or dotnet-compatible auth object) ──
export const getSupabase = () => {
  if (API_MODE === "mock") return getMockSupabase();
  if (API_MODE === "dotnet") return getDotnetSupabase();
  return getRealSupabase();
};

export const getAccessToken = async (): Promise<
  string | null
> => {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || null;
};

const authHeaders = async () => {
  const token = await getAccessToken();
  if (!token && API_MODE === "supabase") {
    const sb = getSupabase();
    const { data: refreshData } =
      await sb.auth.refreshSession();
    const refreshedToken = refreshData?.session?.access_token;
    if (!refreshedToken)
      throw new Error("Session expired. Please log in again.");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${refreshedToken}`,
    };
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token || publicAnonKey}`,
  };
};

// ── Supabase-specific implementations ──
const supabaseSignup = async (
  email: string,
  password: string,
  name: string,
) => {
  const res = await fetch(`${BASE}/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ email, password, name }),
  });
  return res.json();
};

const supabaseLogin = async (
  email: string,
  password: string,
) => {
  const sb = getRealSupabase();
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

const supabaseLogout = async () => {
  await getRealSupabase().auth.signOut();
};

const supabaseFetch = async (
  path: string,
  method = "GET",
  body?: any,
) => {
  const opts: any = { method, headers: await authHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
};

// ══════════════════════════════════════════════════
// ── Exported unified API functions ──
// ══════════════════════════════════════════════════

export const signup = async (
  email: string,
  password: string,
  name: string,
) => {
  if (API_MODE === "mock")
    return mockSignup(email, password, name);
  if (API_MODE === "dotnet")
    return dotnetSignup(email, password, name);
  return supabaseSignup(email, password, name);
};

export const login = async (
  email: string,
  password: string,
) => {
  if (API_MODE === "mock") return mockLogin(email, password);
  if (API_MODE === "dotnet")
    return dotnetLogin(email, password);
  return supabaseLogin(email, password);
};

export const logout = async () => {
  if (API_MODE === "mock") return mockLogout();
  if (API_MODE === "dotnet") return dotnetLogout();
  return supabaseLogout();
};

export const getUserProfile = async () => {
  if (API_MODE === "mock") return mockGetUserProfile();
  if (API_MODE === "dotnet") return dotnetGetUserProfile();
  return supabaseFetch("/user/profile");
};

export const deductCredits = async (
  type: "image" | "video",
) => {
  if (API_MODE === "mock") return mockDeductCredits(type);
  if (API_MODE === "dotnet") return dotnetDeductCredits(type);
  return supabaseFetch("/user/deduct", "POST", { type });
};

export const purchaseTier = async (
  tierId: string,
  billingCycle: "monthly" | "annual",
) => {
  if (API_MODE === "mock")
    return mockPurchaseTier(tierId, billingCycle);
  if (API_MODE === "dotnet")
    return dotnetPurchaseTier(tierId, billingCycle);
  return supabaseFetch("/user/purchase", "POST", {
    tierId,
    billingCycle,
  });
};

export const getPricing = async () => {
  if (API_MODE === "mock") return mockGetPricing();
  if (API_MODE === "dotnet") return dotnetGetPricing();
  const res = await fetch(`${BASE}/pricing`, {
    headers: { Authorization: `Bearer ${publicAnonKey}` },
  });
  return res.json();
};

// ── Admin ──
export const getAdminUsers = async () => {
  if (API_MODE === "mock") return mockGetAdminUsers();
  if (API_MODE === "dotnet") return dotnetGetAdminUsers();
  return supabaseFetch("/admin/users");
};

export const getAdminAnalytics = async () => {
  if (API_MODE === "mock") return mockGetAdminAnalytics();
  if (API_MODE === "dotnet") return dotnetGetAdminAnalytics();
  return supabaseFetch("/admin/analytics");
};

export const updateAdminPricing = async (pricing: any) => {
  if (API_MODE === "mock")
    return mockUpdateAdminPricing(pricing);
  if (API_MODE === "dotnet")
    return dotnetUpdateAdminPricing(pricing);
  return supabaseFetch("/admin/pricing", "POST", pricing);
};

export const adminUpdateUser = async (
  userId: string,
  updates: any,
) => {
  if (API_MODE === "mock")
    return mockAdminUpdateUser(userId, updates);
  if (API_MODE === "dotnet")
    return dotnetAdminUpdateUser(userId, updates);
  return supabaseFetch("/admin/user/update", "POST", {
    userId,
    updates,
  });
};

export const adminDeleteUser = async (userId: string) => {
  if (API_MODE === "mock") return mockAdminDeleteUser(userId);
  if (API_MODE === "dotnet")
    return dotnetAdminDeleteUser(userId);
  return supabaseFetch("/admin/user/delete", "POST", {
    userId,
  });
};

export const promoteToAdmin = async () => {
  if (API_MODE === "mock") return mockPromoteToAdmin();
  if (API_MODE === "dotnet") return dotnetPromoteToAdmin();
  return supabaseFetch("/admin/promote", "POST");
};

// ══════════════════════════════════════════════════
// ── Stripe Checkout ──
// ══════════════════════════════════════════════════

export const createCheckoutSession = async (
  tierId: string,
  billingCycle: "monthly" | "annual",
  successUrl: string,
  cancelUrl: string,
): Promise<{
  sessionId?: string;
  url?: string;
  error?: string;
  success?: boolean;
  credits?: any;
  price?: number;
}> => {
  if (API_MODE === "mock")
    return mockPurchaseTier(tierId, billingCycle);
  if (API_MODE === "dotnet")
    return dotnetCreateCheckoutSession(
      tierId,
      billingCycle,
      successUrl,
      cancelUrl,
    );
  return supabaseFetch("/stripe/create-checkout", "POST", {
    tierId,
    billingCycle,
    successUrl,
    cancelUrl,
  });
};

export const verifyCheckoutSession = async (
  sessionId: string,
): Promise<{
  success?: boolean;
  credits?: any;
  price?: number;
  error?: string;
}> => {
  if (API_MODE === "mock") return { success: true };
  if (API_MODE === "dotnet")
    return dotnetVerifyCheckoutSession(sessionId);
  return supabaseFetch("/stripe/verify-session", "POST", {
    sessionId,
  });
};

// ── Buy Credits (one-off, no subscription) ──
export const createCreditsPurchase = async (
  imageCredits: number,
  videoCredits: number,
  successUrl: string,
  cancelUrl: string,
): Promise<{
  sessionId?: string;
  url?: string;
  error?: string;
  success?: boolean;
  credits?: any;
  price?: number;
}> => {
  if (API_MODE === "mock")
    return mockBuyCredits(imageCredits, videoCredits);
  if (API_MODE === "dotnet")
    return dotnetBuyCredits(
      imageCredits,
      videoCredits,
      successUrl,
      cancelUrl,
    );
  return supabaseFetch("/stripe/buy-credits", "POST", {
    imageCredits,
    videoCredits,
    successUrl,
    cancelUrl,
  });
};

// ══════════════════════════════════════════════════
// ── AI Image Generation (server-side proxy) ──
// ══════════════════════════════════════════════════

export const generateAiImage = async (
  prompt: string,
): Promise<{ b64_json?: string; error?: string }> => {
  if (API_MODE === "mock") {
    try {
      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${Date.now()}`;
      const b64 = await new Promise<string>(
        (resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width || 512;
            c.height = img.height || 512;
            const ctx = c.getContext("2d")!;
            ctx.drawImage(img, 0, 0);
            const dataUrl = c.toDataURL("image/png");
            resolve(dataUrl.split(",")[1]);
          };
          img.onerror = () =>
            reject(new Error("Image generation failed"));
          img.src = imageUrl;
        },
      );
      return { b64_json: b64 };
    } catch (e: any) {
      return { error: e.message || "Image generation failed" };
    }
  }
  if (API_MODE === "dotnet")
    return dotnetGenerateAiImage(prompt);
  return supabaseFetch("/ai/generate-image", "POST", {
    prompt,
  });
};

// ══════════════════════════════════════════════════
// ── Auth: Password Reset & Email Verification ──
// ══════════════════════════════════════════════════

export const forgotPassword = async (
  email: string,
  redirectTo?: string,
) => {
  if (API_MODE === "mock")
    return {
      success: true,
      message: "Password reset email sent (mock)",
    };
  if (API_MODE === "dotnet")
    return dotnetForgotPassword(email, redirectTo);
  const res = await fetch(`${BASE}/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ email, redirectTo }),
  });
  return res.json();
};

export const resendVerification = async (email: string) => {
  if (API_MODE === "mock") return { success: true };
  if (API_MODE === "dotnet")
    return dotnetResendVerification(email);
  const res = await fetch(`${BASE}/auth/resend-verification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ email }),
  });
  return res.json();
};

export const updatePassword = async (newPassword: string) => {
  if (API_MODE === "mock") return { success: true };
  if (API_MODE === "dotnet")
    return dotnetUpdatePassword(newPassword);
  const sb = getSupabase();
  const { error } = await sb.auth.updateUser({
    password: newPassword,
  });
  if (error) throw error;
  return { success: true };
};

// ══════════════════════════════════════════════════
// ── Subscription Management ──
// ══════════════════════════════════════════════════

export const cancelSubscription = async () => {
  if (API_MODE === "mock") return mockCancelSubscription();
  if (API_MODE === "dotnet") return dotnetCancelSubscription();
  return supabaseFetch("/user/cancel-subscription", "POST");
};

export const getUserHistory = async () => {
  if (API_MODE === "mock") return mockGetUserHistory();
  if (API_MODE === "dotnet") return dotnetGetUserHistory();
  return supabaseFetch("/user/history");
};