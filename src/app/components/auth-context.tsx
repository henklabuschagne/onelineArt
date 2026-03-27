import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSupabase, getUserProfile } from './api';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

interface Credits {
  imageCredits: number;
  videoCredits: number;
  balance: number;
}

interface Subscription {
  tierId: string;
  tierName: string;
  billingCycle: string;
  price: number;
  status?: string;
  purchasedAt: string;
  nextBilling: string;
  cancelledAt?: string;
}

interface AuthState {
  user: any | null;
  profile: UserProfile | null;
  credits: Credits | null;
  subscription: Subscription | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  credits: null,
  subscription: null,
  loading: true,
  isAdmin: false,
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await getUserProfile();
      if (data.profile) setProfile(data.profile);
      if (data.credits) setCredits(data.credits);
      setSubscription(data.subscription || null);
    } catch (e) {
      console.log("Failed to refresh profile:", e);
    }
  }, []);

  useEffect(() => {
    const sb = getSupabase();
    
    sb.auth.getSession().then(({ data }: any) => {
      setUser(data?.session?.user || null);
      if (data?.session?.user) {
        refreshProfile();
      }
      setLoading(false);
    });

    const { data: { subscription: authSub } } = sb.auth.onAuthStateChange((_: any, session: any) => {
      setUser(session?.user || null);
      if (session?.user) {
        refreshProfile();
      } else {
        setProfile(null);
        setCredits(null);
        setSubscription(null);
      }
      setLoading(false);
    });

    return () => authSub?.unsubscribe();
  }, [refreshProfile]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      credits,
      subscription,
      loading,
      isAdmin: profile?.role === 'admin',
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}