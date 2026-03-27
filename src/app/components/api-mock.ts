// ── Mock API for offline testing ──
// All data lives in localStorage. No backend needed.
// Hardcoded test accounts:
//   Admin: admin@test.com / admin123
//   User:  user@test.com  / user123

const store = {
  get: (key: string) => { try { return JSON.parse(localStorage.getItem(`ola_${key}`) || 'null'); } catch { return null; } },
  set: (key: string, val: any) => localStorage.setItem(`ola_${key}`, JSON.stringify(val)),
  del: (key: string) => localStorage.removeItem(`ola_${key}`),
};

// ── Seed hardcoded test accounts on first load ──
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID  = '00000000-0000-0000-0000-000000000002';

function seedTestAccounts() {
  if (store.get('seeded')) return;
  const adminProfile = { id: ADMIN_ID, email: 'admin@test.com', name: 'Admin User', role: 'admin', createdAt: new Date().toISOString() };
  const userProfile  = { id: USER_ID,  email: 'user@test.com',  name: 'Test User',  role: 'user',  createdAt: new Date().toISOString() };
  store.set(`user:admin@test.com`, { ...adminProfile, password: 'admin123' });
  store.set(`user:user@test.com`,  { ...userProfile,  password: 'user123' });
  store.set(`profile:${ADMIN_ID}`, adminProfile);
  store.set(`profile:${USER_ID}`,  userProfile);
  store.set(`credits:${ADMIN_ID}`, { imageCredits: 999, videoCredits: 999, balance: 0 });
  store.set(`credits:${USER_ID}`,  { imageCredits: 999, videoCredits: 999, balance: 0 });
  store.set('hasUsers', true);
  store.set('seeded', true);
}
seedTestAccounts();

let mockUser: any = null;

const defaultPricing = {
  imageCost: 1, videoCost: 5, annualDiscount: 15,
  tiers: [
    { id: 'starter', name: 'Starter', description: 'Perfect for trying out one-line art', monthlyPrice: 25, imageCredits: 30, videoCredits: 5, discount: 0 },
    { id: 'pro', name: 'Pro', description: 'For creators who need more power', monthlyPrice: 40, imageCredits: 60, videoCredits: 12, discount: 20 },
    { id: 'enterprise', name: 'Enterprise', description: 'Unlimited creativity for teams', monthlyPrice: 60, imageCredits: 120, videoCredits: 30, discount: 40 },
  ],
};

const delay = (ms = 200) => new Promise(r => setTimeout(r, ms));
const getCurrentId = () => store.get('currentUser') as string | null;

// Event system so onAuthStateChange fires after login/logout
const authListeners: Set<(event: string, session: any) => void> = new Set();

function notifyAuthChange() {
  const currentId = getCurrentId();
  const profile = currentId ? store.get(`profile:${currentId}`) : null;
  const session = currentId ? { user: profile, access_token: 'mock-' + currentId } : null;
  authListeners.forEach(cb => cb(currentId ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}

export const mockSignup = async (email: string, password: string, name: string) => {
  await delay();
  const existing = store.get(`user:${email}`);
  if (existing) throw new Error('Email already registered');
  const id = crypto.randomUUID();
  const isFirst = !store.get('hasUsers');
  const profile = { id, email, name, role: isFirst ? 'admin' : 'user', createdAt: new Date().toISOString() };
  const credits = { imageCredits: 5, videoCredits: 1, balance: 0 };
  store.set(`user:${email}`, { ...profile, password });
  store.set(`profile:${id}`, profile);
  store.set(`credits:${id}`, credits);
  store.set('hasUsers', true);
  store.set('currentUser', id);
  mockUser = profile;
  notifyAuthChange();
  return { success: true, role: profile.role };
};

export const mockLogin = async (email: string, password: string) => {
  await delay();
  const user = store.get(`user:${email}`);
  if (!user || user.password !== password) throw new Error('Invalid credentials');
  store.set('currentUser', user.id);
  mockUser = store.get(`profile:${user.id}`);
  notifyAuthChange();
  return { user: mockUser, session: { access_token: 'mock-token-' + user.id } };
};

export const mockLogout = async () => { store.del('currentUser'); mockUser = null; notifyAuthChange(); };

export const mockGetUserProfile = async () => {
  await delay();
  const id = getCurrentId();
  if (!id) throw new Error('Not logged in');
  return { profile: store.get(`profile:${id}`), credits: store.get(`credits:${id}`), subscription: store.get(`sub:${id}`) || null };
};

export const mockDeductCredits = async (type: 'image' | 'video') => {
  await delay();
  const id = getCurrentId();
  if (!id) throw new Error('Not logged in');
  const credits = store.get(`credits:${id}`) || { imageCredits: 999, videoCredits: 999, balance: 0 };
  // In mock mode, never block — always succeed (infinite credits for testing)
  // Record transaction for history
  const txKey = `tx:${id}:${Date.now()}`;
  store.set(txKey, { userId: id, type, cost: type === 'image' ? 1 : 5, createdAt: new Date().toISOString() });
  return { success: true, credits };
};

export const mockPurchaseTier = async (tierId: string, billingCycle: 'monthly' | 'annual') => {
  await delay();
  const id = getCurrentId();
  if (!id) throw new Error('Not logged in');
  const pricing = store.get('pricing') || defaultPricing;
  const tier = pricing.tiers.find((t: any) => t.id === tierId);
  if (!tier) return { error: 'Invalid tier' };
  const credits = store.get(`credits:${id}`) || { imageCredits: 0, videoCredits: 0, balance: 0 };
  credits.imageCredits += tier.imageCredits;
  credits.videoCredits += tier.videoCredits;
  const price = billingCycle === 'annual' ? tier.monthlyPrice * 12 * 0.85 : tier.monthlyPrice;
  store.set(`credits:${id}`, credits);
  store.set(`sub:${id}`, { tierId, tierName: tier.name, billingCycle, price, status: 'active', purchasedAt: new Date().toISOString(), nextBilling: new Date(Date.now() + (billingCycle === 'annual' ? 365 : 30) * 86400000).toISOString() });
  // Record transaction
  const txKey = `tx:${id}:purchase:${Date.now()}`;
  store.set(txKey, { userId: id, type: 'purchase', tierId, tierName: tier.name, billingCycle, price, imageCredits: tier.imageCredits, videoCredits: tier.videoCredits, createdAt: new Date().toISOString() });
  return { success: true, credits, price };
};

export const mockGetPricing = async () => { await delay(); return store.get('pricing') || defaultPricing; };

export const mockGetAdminUsers = async () => {
  await delay();
  const users: any[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('ola_profile:')) { users.push(JSON.parse(localStorage.getItem(key)!)); }
  }
  return { users };
};

export const mockGetAdminAnalytics = async () => {
  await delay();
  return { totalUsers: 1, totalRevenue: 0, totalImageGens: 0, totalVideoGens: 0, totalPurchases: 0, revenueByDay: {}, usageByDay: {} };
};

export const mockUpdateAdminPricing = async (pricing: any) => { await delay(); store.set('pricing', pricing); return { success: true }; };
export const mockAdminUpdateUser = async (userId: string, updates: any) => {
  await delay();
  const profile = store.get(`profile:${userId}`);
  if (profile && updates.profile) { Object.assign(profile, updates.profile); store.set(`profile:${userId}`, profile); }
  if (updates.credits) store.set(`credits:${userId}`, updates.credits);
  return { success: true };
};
export const mockAdminDeleteUser = async (userId: string) => { await delay(); store.del(`profile:${userId}`); store.del(`credits:${userId}`); return { success: true }; };
export const mockPromoteToAdmin = async () => {
  await delay();
  const id = getCurrentId();
  if (!id) throw new Error('Not logged in');
  const profile = store.get(`profile:${id}`);
  if (profile) { profile.role = 'admin'; store.set(`profile:${id}`, profile); }
  return { success: true, message: 'You are now an admin!' };
};

export const mockCancelSubscription = async () => {
  await delay();
  const id = getCurrentId();
  if (!id) throw new Error('Not logged in');
  const sub = store.get(`sub:${id}`);
  if (sub) {
    sub.status = 'cancelled';
    sub.cancelledAt = new Date().toISOString();
    store.set(`sub:${id}`, sub);
  }
  return { success: true };
};

export const mockGetUserHistory = async () => {
  await delay();
  const id = getCurrentId();
  if (!id) throw new Error('Not logged in');
  const transactions: any[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(`ola_tx:${id}:`)) {
      try { transactions.push(JSON.parse(localStorage.getItem(key)!)); } catch {}
    }
  }
  transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { transactions: transactions.slice(0, 50) };
};

export const mockBuyCredits = async (imageCredits: number, videoCredits: number) => {
  await delay();
  const id = getCurrentId();
  if (!id) throw new Error('Not logged in');
  const pricing = store.get('pricing') || defaultPricing;
  const subtotal = imageCredits * pricing.imageCost + videoCredits * pricing.videoCost;
  // Bulk discounts
  let discountPct = 0;
  if (subtotal >= 500) discountPct = 20;
  else if (subtotal >= 200) discountPct = 15;
  else if (subtotal >= 100) discountPct = 10;
  else if (subtotal >= 50) discountPct = 5;
  const cost = subtotal * (1 - discountPct / 100);
  const credits = store.get(`credits:${id}`) || { imageCredits: 0, videoCredits: 0, balance: 0 };
  credits.imageCredits += imageCredits;
  credits.videoCredits += videoCredits;
  store.set(`credits:${id}`, credits);
  // Record transaction (no subscription created — one-off purchase)
  const txKey = `tx:${id}:credit-purchase:${Date.now()}`;
  store.set(txKey, { userId: id, type: 'credit-purchase', price: cost, imageCredits, videoCredits, discountPct, createdAt: new Date().toISOString() });
  return { success: true, credits, price: cost };
};

// Mock Supabase-like object for auth state
export const getMockSupabase = () => {
  const currentId = getCurrentId();
  const profile = currentId ? store.get(`profile:${currentId}`) : null;
  return {
    auth: {
      getSession: async () => ({ data: { session: currentId ? { user: profile, access_token: 'mock-' + currentId } : null } }),
      refreshSession: async () => ({ data: { session: currentId ? { access_token: 'mock-' + currentId } : null } }),
      signInWithPassword: async ({ email, password }: any) => {
        const result = await mockLogin(email, password);
        return { data: { session: { access_token: 'mock-' + result.user.id }, user: result.user }, error: null };
      },
      signOut: async () => { await mockLogout(); },
      onAuthStateChange: (cb: any) => {
        authListeners.add(cb);
        return { data: { subscription: { unsubscribe: () => { authListeners.delete(cb); } } } };
      },
    }
  };
};