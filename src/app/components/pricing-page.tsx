import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Check, Sparkles, Zap, Crown, Loader2, ArrowLeft, ExternalLink, ShoppingCart } from 'lucide-react';
import { getPricing, createCheckoutSession } from './api';
import { API_MODE } from '../config';
import { STRIPE_PUBLISHABLE_KEY } from '../config';
import { useAuth } from './auth-context';
import { useTheme } from './theme-context';
import { toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';

// Lazy-load Stripe.js only when needed (non-mock modes)
let stripePromise: ReturnType<typeof loadStripe> | null = null;
const getStripe = () => {
  if (!stripePromise && API_MODE !== 'mock') {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
};

export function PricingPage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { inverted } = useTheme();
  const [pricing, setPricing] = useState<any>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    getPricing().then(setPricing).catch(console.error);
  }, []);

  const handlePurchase = async (tierId: string) => {
    if (!user) { navigate('/signup'); return; }
    setPurchasing(tierId);
    try {
      const successUrl = `${window.location.origin}/checkout/success`;
      const cancelUrl = `${window.location.origin}/pricing`;

      const result = await createCheckoutSession(tierId, billingCycle, successUrl, cancelUrl);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (API_MODE === 'mock') {
        // Mock mode: instant purchase, credits already added
        toast.success('Successfully purchased! Credits added to your account.');
        await refreshProfile();
        navigate('/');
        return;
      }

      // Real Stripe modes: redirect to Stripe Checkout
      if (result.url) {
        // Server returned the Stripe hosted checkout URL — redirect directly
        window.location.href = result.url;
        return;
      }

      if (result.sessionId) {
        // Use Stripe.js to redirect to Checkout
        const stripe = await getStripe();
        if (!stripe) {
          toast.error('Failed to load Stripe. Check your publishable key in config.ts');
          return;
        }
        const { error } = await stripe.redirectToCheckout({ sessionId: result.sessionId });
        if (error) {
          console.error('Stripe redirect error:', error);
          toast.error(error.message || 'Failed to redirect to checkout');
        }
        return;
      }

      // Fallback: if somehow we got success without redirect (e.g. dotnet direct purchase)
      if (result.success) {
        toast.success('Successfully purchased! Credits added to your account.');
        await refreshProfile();
        navigate('/');
      }
    } catch (err: any) {
      console.error('Purchase error:', err);
      toast.error(err.message || 'Purchase failed');
    } finally {
      setPurchasing(null);
    }
  };

  const tierIcons = [Sparkles, Zap, Crown];
  const tierAccents = ['#818cf8', '#a78bfa', '#fbbf24'];

  if (!pricing) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 relative">
      {/* Background effects */}
      {inverted && (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
          <div className="absolute top-20 left-1/3 w-[600px] h-[600px] bg-indigo-500/[0.07] rounded-full blur-[150px]" />
          <div className="absolute bottom-20 right-1/3 w-[500px] h-[500px] bg-violet-500/[0.05] rounded-full blur-[120px]" />
        </div>
      )}

      <div className="max-w-5xl mx-auto relative z-10">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 mb-8 text-sm font-medium transition-colors text-neutral-500 hover:text-neutral-300">
          <ArrowLeft className="w-4 h-4" /> Back to Studio
        </button>

        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3 tracking-tight text-white">Choose Your Plan</h1>
          <p className="text-lg mb-8 text-neutral-400">
            Each AI image costs <span className="font-semibold text-indigo-400">${pricing.imageCost}</span> and each video costs <span className="font-semibold text-violet-400">${pricing.videoCost}</span>
          </p>

          {/* Mode indicator */}
          {API_MODE === 'mock' && (
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Mock Mode — purchases are instant (no Stripe)
            </div>
          )}

          {/* Billing toggle */}
          <div className="inline-flex items-center bg-neutral-900 rounded-full p-1 border border-neutral-800">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:text-white'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${billingCycle === 'annual' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:text-white'}`}
            >
              Annual
              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">-{pricing.annualDiscount}%</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {pricing.tiers.map((tier: any, i: number) => {
            const Icon = tierIcons[i];
            const accent = tierAccents[i];
            const monthlyPrice = tier.monthlyPrice;
            const displayPrice = billingCycle === 'annual'
              ? (monthlyPrice * (1 - pricing.annualDiscount / 100)).toFixed(0)
              : monthlyPrice;
            const popular = i === 1;

            return (
              <div
                key={tier.id}
                className={`relative rounded-2xl p-6 border transition-all hover:scale-[1.02] ${
                  popular
                    ? 'bg-neutral-900/90 border-indigo-500/30 shadow-lg shadow-indigo-500/10'
                    : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-4 py-1 rounded-full shadow-lg shadow-indigo-500/30">Most Popular</span>
                  </div>
                )}

                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ backgroundColor: accent + '18' }}>
                  <Icon className="w-6 h-6" style={{ color: accent }} />
                </div>

                <h3 className="text-xl font-bold text-white mb-1">{tier.name}</h3>
                <p className="text-sm text-neutral-500 mb-5">{tier.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">${displayPrice}</span>
                  <span className="text-neutral-500 text-sm">/mo</span>
                  {billingCycle === 'annual' && (
                    <span className="block text-xs text-neutral-600 line-through mt-1">${monthlyPrice}/mo</span>
                  )}
                </div>

                {tier.discount > 0 && (
                  <div className="inline-block text-xs font-semibold px-3 py-1 rounded-full mb-5"
                    style={{ backgroundColor: accent + '18', color: accent }}>
                    {tier.discount}% savings vs base pricing
                  </div>
                )}

                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-2.5 text-sm text-neutral-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span><strong className="text-white">{tier.imageCredits}</strong> AI image generations</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-neutral-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span><strong className="text-white">{tier.videoCredits}</strong> video recordings</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-neutral-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    Full creative controls
                  </li>
                  <li className="flex items-center gap-2.5 text-sm text-neutral-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    HD 1920x1080 canvas
                  </li>
                </ul>

                <button
                  onClick={() => handlePurchase(tier.id)}
                  disabled={!!purchasing}
                  className={`w-full py-3.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm ${
                    popular
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08]'
                  }`}
                >
                  {purchasing === tier.id ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Redirecting...</>
                  ) : API_MODE === 'mock' ? (
                    'Buy Instantly'
                  ) : (
                    <><ExternalLink className="w-4 h-4" /> Checkout with Stripe</>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Link to one-off credit purchase */}
        <div className="text-center mt-8">
          <button onClick={() => navigate('/buy-credits')}
            className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            <ShoppingCart className="w-4 h-4" />
            Just need a few extra credits? Buy a one-time top-up instead
          </button>
        </div>
      </div>
    </div>
  );
}