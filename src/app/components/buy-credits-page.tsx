import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Image, Video, CreditCard, Loader2, ExternalLink, ShoppingCart, Percent, TrendingUp } from 'lucide-react';
import { getPricing, createCreditsPurchase } from './api';
import { API_MODE, STRIPE_PUBLISHABLE_KEY } from '../config';
import { useAuth } from './auth-context';
import { toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';

let stripePromise: ReturnType<typeof loadStripe> | null = null;
const getStripe = () => {
  if (!stripePromise && API_MODE !== 'mock') {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
};

export function BuyCreditsPage() {
  const navigate = useNavigate();
  const { user, credits, refreshProfile } = useAuth();
  const [pricing, setPricing] = useState<any>(null);
  const [imageCredits, setImageCredits] = useState(10);
  const [videoCredits, setVideoCredits] = useState(2);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    getPricing().then(setPricing).catch(console.error);
  }, []);

  const imageCost = pricing?.imageCost ?? 1;
  const videoCost = pricing?.videoCost ?? 5;
  const subtotal = imageCredits * imageCost + videoCredits * videoCost;
  const bulkTier = getBulkDiscount(subtotal);
  const discountAmount = subtotal * (bulkTier.discount / 100);
  const total = subtotal - discountAmount;

  const handlePurchase = async () => {
    if (total <= 0) return;
    if (!user) { navigate('/signup'); return; }
    setPurchasing(true);
    try {
      const successUrl = `${window.location.origin}/checkout/success`;
      const cancelUrl = `${window.location.origin}/buy-credits`;

      const result = await createCreditsPurchase(imageCredits, videoCredits, successUrl, cancelUrl);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (API_MODE === 'mock') {
        toast.success(`Added ${imageCredits} image & ${videoCredits} video credits!`);
        await refreshProfile();
        navigate('/');
        return;
      }

      if (result.url) {
        window.location.href = result.url;
        return;
      }

      if (result.sessionId) {
        const stripe = await getStripe();
        if (!stripe) { toast.error('Failed to load Stripe.'); return; }
        const { error } = await stripe.redirectToCheckout({ sessionId: result.sessionId });
        if (error) toast.error(error.message || 'Failed to redirect to checkout');
        return;
      }

      if (result.success) {
        toast.success(`Added ${imageCredits} image & ${videoCredits} video credits!`);
        await refreshProfile();
        navigate('/');
      }
    } catch (err: any) {
      console.error('Credit purchase error:', err);
      toast.error(err.message || 'Purchase failed');
    } finally {
      setPurchasing(false);
    }
  };

  const sliderTrack = "w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-indigo-500 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg";

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
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-20 left-1/3 w-[600px] h-[600px] bg-indigo-500/[0.07] rounded-full blur-[150px]" />
        <div className="absolute bottom-20 right-1/3 w-[500px] h-[500px] bg-violet-500/[0.05] rounded-full blur-[120px]" />
      </div>

      <div className="max-w-xl mx-auto relative z-10">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 mb-8 text-sm font-medium transition-colors text-neutral-500 hover:text-neutral-300">
          <ArrowLeft className="w-4 h-4" /> Back to Studio
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 tracking-tight text-white">Buy Additional Credits</h1>
          <p className="text-neutral-400 text-sm">
            One-time purchase &mdash; credits never expire
          </p>
          {API_MODE === 'mock' && (
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium px-3 py-1.5 rounded-full mt-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Mock Mode &mdash; purchases are instant
            </div>
          )}
        </div>

        {/* Current balance */}
        {credits && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 mb-6">
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold mb-2">Current Balance</p>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-2 text-indigo-400 font-semibold">
                <Image className="w-4 h-4" /> {credits.imageCredits} images
              </span>
              <span className="flex items-center gap-2 text-violet-400 font-semibold">
                <Video className="w-4 h-4" /> {credits.videoCredits} videos
              </span>
            </div>
          </div>
        )}

        {/* Bulk discount tiers */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <p className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Bulk Discounts</p>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {BULK_DISCOUNTS.filter(t => t.discount > 0).map((t) => {
              const isActive = bulkTier.minSpend === t.minSpend;
              const isPassed = subtotal >= t.minSpend && !isActive;
              return (
                <div
                  key={t.minSpend}
                  className={`text-center px-2 py-2 rounded-lg border transition-all ${
                    isActive
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 ring-1 ring-emerald-500/20'
                      : isPassed
                      ? 'bg-white/[0.03] border-white/[0.06] text-neutral-500'
                      : 'bg-white/[0.02] border-white/[0.04] text-neutral-600'
                  }`}
                >
                  <p className="text-[10px] font-medium">${t.minSpend}+</p>
                  <p className="text-sm font-bold">{t.discount}%</p>
                </div>
              );
            })}
          </div>
          {bulkTier.discount > 0 ? (
            <p className="text-xs text-emerald-400 mt-2.5 flex items-center gap-1.5">
              <Percent className="w-3 h-3" />
              You save <span className="font-bold">${discountAmount.toFixed(2)}</span> with {bulkTier.label}!
            </p>
          ) : (
            <p className="text-xs text-neutral-600 mt-2.5">
              Spend $50+ to unlock bulk discounts
            </p>
          )}
        </div>

        {/* Credit sliders */}
        <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6 mb-6 space-y-8">
          {/* Image credits */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                  <Image className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Image Credits</p>
                  <p className="text-xs text-neutral-500">${imageCost} each</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-white">{imageCredits}</span>
                <p className="text-xs text-neutral-500">${(imageCredits * imageCost).toFixed(0)}</p>
              </div>
            </div>
            <input
              type="range" min="0" max="200" step="5" value={imageCredits}
              onChange={(e) => setImageCredits(Number(e.target.value))}
              className={sliderTrack}
            />
            <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
              <span>0</span><span>50</span><span>100</span><span>150</span><span>200</span>
            </div>
          </div>

          {/* Video credits */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-violet-500/20 rounded-lg flex items-center justify-center">
                  <Video className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Video Credits</p>
                  <p className="text-xs text-neutral-500">${videoCost} each</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-white">{videoCredits}</span>
                <p className="text-xs text-neutral-500">${(videoCredits * videoCost).toFixed(0)}</p>
              </div>
            </div>
            <input
              type="range" min="0" max="50" step="1" value={videoCredits}
              onChange={(e) => setVideoCredits(Number(e.target.value))}
              className={sliderTrack}
            />
            <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
              <span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span>
            </div>
          </div>
        </div>

        {/* Total & Purchase */}
        <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm text-neutral-400">Total</p>
              <p className="text-3xl font-bold text-white">${total.toFixed(2)}</p>
            </div>
            <div className="text-right text-sm text-neutral-400 space-y-0.5">
              {imageCredits > 0 && <p>{imageCredits} image credits &times; ${imageCost}</p>}
              {videoCredits > 0 && <p>{videoCredits} video credits &times; ${videoCost}</p>}
              {bulkTier.discount > 0 && <p className="text-sm text-green-400">- {bulkTier.discount}% discount</p>}
            </div>
          </div>

          <button
            onClick={handlePurchase}
            disabled={purchasing || total <= 0}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {purchasing ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
            ) : API_MODE === 'mock' ? (
              <><ShoppingCart className="w-4 h-4" /> Buy Instantly &mdash; ${total.toFixed(2)}</>
            ) : (
              <><ExternalLink className="w-4 h-4" /> Checkout with Stripe &mdash; ${total.toFixed(2)}</>
            )}
          </button>

          <p className="text-xs text-neutral-600 text-center mt-3">
            One-time purchase. Credits are added to your account immediately and never expire.
          </p>
        </div>

        {/* Link to subscriptions */}
        <div className="text-center mt-6">
          <button onClick={() => navigate('/pricing')}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            Looking for a monthly subscription instead?
          </button>
        </div>
      </div>
    </div>
  );
}

// Bulk discount tiers: spend more, save more
const BULK_DISCOUNTS = [
  { minSpend: 0,   discount: 0,  label: 'No discount' },
  { minSpend: 50,  discount: 5,  label: '5% off' },
  { minSpend: 100, discount: 10, label: '10% off' },
  { minSpend: 200, discount: 15, label: '15% off' },
  { minSpend: 500, discount: 20, label: '20% off' },
];

function getBulkDiscount(subtotal: number) {
  let tier = BULK_DISCOUNTS[0];
  for (const t of BULK_DISCOUNTS) {
    if (subtotal >= t.minSpend) tier = t;
  }
  return tier;
}