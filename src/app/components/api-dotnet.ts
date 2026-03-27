// ── .NET Backend API adapter ──
// Talks to the ASP.NET Core Web API at DOTNET_API_URL from config.ts
// Every function mirrors a controller action in the .NET backend.

import { DOTNET_API_URL } from '../config';

let accessToken: string | null = localStorage.getItem('ola_access_token');
let refreshToken: string | null = localStorage.getItem('ola_refresh_token');

const setTokens = (access: string, refresh: string) => {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('ola_access_token', access);
  localStorage.setItem('ola_refresh_token', refresh);
};

const clearTokens = () => {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('ola_access_token');
  localStorage.removeItem('ola_refresh_token');
};

const authHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
});

// Central fetch wrapper with automatic 401 → refresh → retry
const api = async (path: string, options: RequestInit = {}) => {
  const res = await fetch(`${DOTNET_API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${DOTNET_API_URL}/Auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (refreshRes.ok) {
      const { data } = await refreshRes.json();
      setTokens(data.accessToken, data.refreshToken);
      // Retry original request
      const retry = await fetch(`${DOTNET_API_URL}${path}`, {
        ...options,
        headers: { ...authHeaders(), ...(options.headers || {}) },
      });
      return retry.json();
    } else {
      clearTokens();
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || err.message || `Request failed: ${res.status}`);
  }

  return res.json();
};

// ══════════════════════════════════════════════════
// ── AUTH ──
// ══════════════════════════════════════════════════

export const dotnetSignup = async (email: string, password: string, name: string) => {
  const result = await api('/Auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
  if (result.success && result.data) {
    setTokens(result.data.accessToken, result.data.refreshToken);
  }
  return result.data || result;
};

export const dotnetLogin = async (email: string, password: string) => {
  const result = await api('/Auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (result.success && result.data) {
    setTokens(result.data.accessToken, result.data.refreshToken);
    return { user: result.data.profile, session: { access_token: result.data.accessToken } };
  }
  throw new Error(result.error || 'Login failed');
};

export const dotnetLogout = async () => {
  if (refreshToken) {
    try { await api('/Auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }); } catch {}
  }
  clearTokens();
};

export const dotnetForgotPassword = async (email: string, redirectTo?: string) => {
  return await api('/Auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email, redirectTo }),
  });
};

export const dotnetResendVerification = async (email: string) => {
  return await api('/Auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const dotnetUpdatePassword = async (newPassword: string) => {
  return await api('/Auth/update-password', {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
};

// ══════════════════════════════════════════════════
// ── USER ──
// ══════════════════════════════════════════════════

export const dotnetGetUserProfile = async () => {
  const result = await api('/User/profile');
  if (result.success && result.data) {
    return { profile: result.data.profile, credits: result.data.credits, subscription: result.data.subscription };
  }
  throw new Error(result.error || 'Failed to get profile');
};

export const dotnetDeductCredits = async (type: 'image' | 'video') => {
  return await api('/User/deduct', { method: 'POST', body: JSON.stringify({ type }) });
};

export const dotnetGetUserHistory = async () => {
  const result = await api('/User/history');
  return { transactions: result.data?.transactions || result.transactions || [] };
};

export const dotnetCancelSubscription = async () => {
  return await api('/User/cancel-subscription', { method: 'POST' });
};

// ══════════════════════════════════════════════════
// ── PRICING ──
// ══════════════════════════════════════════════════

export const dotnetGetPricing = async () => {
  const result = await api('/Pricing');
  return result.success ? result.data : result;
};

// ══════════════════════════════════════════════════
// ── STRIPE ──
// ══════════════════════════════════════════════════

export const dotnetCreateCheckoutSession = async (
  tierId: string,
  billingCycle: 'monthly' | 'annual',
  successUrl: string,
  cancelUrl: string,
) => {
  return await api('/Stripe/checkout', {
    method: 'POST',
    body: JSON.stringify({ tierId, billingCycle, successUrl, cancelUrl }),
  });
};

// Used by pricing page (subscription checkout)
export const dotnetPurchaseTier = async (tierId: string, billingCycle: 'monthly' | 'annual') => {
  const successUrl = `${window.location.origin}/checkout/success`;
  const cancelUrl = `${window.location.origin}/pricing`;
  return dotnetCreateCheckoutSession(tierId, billingCycle, successUrl, cancelUrl);
};

export const dotnetVerifyCheckoutSession = async (sessionId: string) => {
  return await api('/Stripe/verify-session', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
};

export const dotnetBuyCredits = async (
  imageCredits: number,
  videoCredits: number,
  successUrl: string,
  cancelUrl: string,
) => {
  return await api('/Stripe/buy-credits', {
    method: 'POST',
    body: JSON.stringify({ imageCredits, videoCredits, successUrl, cancelUrl }),
  });
};

// ══════════════════════════════════════════════════
// ── AI IMAGE ──
// ══════════════════════════════════════════════════

export const dotnetGenerateAiImage = async (prompt: string) => {
  return await api('/Ai/generate-image', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
};

// ══════════════════════════════════════════════════
// ── ADMIN ──
// ══════════════════════════════════════════════════

export const dotnetGetAdminUsers = async () => {
  const result = await api('/Admin/users');
  return result.success ? { users: result.data } : result;
};

export const dotnetGetAdminAnalytics = async () => {
  const result = await api('/Admin/analytics');
  return result.success ? result.data : result;
};

export const dotnetUpdateAdminPricing = async (pricing: any) => {
  return await api('/Pricing', { method: 'POST', body: JSON.stringify(pricing) });
};

export const dotnetAdminUpdateUser = async (userId: string, updates: any) => {
  return await api('/Admin/user/update', { method: 'POST', body: JSON.stringify({ userId, updates }) });
};

export const dotnetAdminDeleteUser = async (userId: string) => {
  return await api('/Admin/user/delete', { method: 'POST', body: JSON.stringify({ userId }) });
};

export const dotnetPromoteToAdmin = async () => {
  return await api('/Admin/promote', { method: 'POST' });
};

// ══════════════════════════════════════════════════
// ── FAKE SUPABASE AUTH INTERFACE ──
// Provides a Supabase-compatible object so AuthContext works seamlessly
// ══════════════════════════════════════════════════

export const getDotnetSupabase = () => ({
  auth: {
    getSession: async () => ({
      data: {
        session: accessToken
          ? { user: { id: 'dotnet-user' }, access_token: accessToken }
          : null
      }
    }),
    refreshSession: async () => {
      if (!refreshToken) return { data: { session: null } };
      try {
        const res = await fetch(`${DOTNET_API_URL}/Auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const result = await res.json();
        if (result.success && result.data) {
          setTokens(result.data.accessToken, result.data.refreshToken);
          return { data: { session: { access_token: result.data.accessToken } } };
        }
      } catch {}
      return { data: { session: null } };
    },
    signInWithPassword: async ({ email, password }: any) => {
      const result = await dotnetLogin(email, password);
      return { data: { session: { access_token: accessToken }, user: result.user }, error: null };
    },
    signOut: async () => { await dotnetLogout(); },
    updateUser: async ({ password }: any) => {
      await dotnetUpdatePassword(password);
      return { error: null };
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  }
});
