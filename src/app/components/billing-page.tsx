import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { CreditCard, Image, Video, Calendar, Clock, AlertTriangle, Loader2, ArrowLeft, Package, History, XCircle, CheckCircle, DollarSign, ShoppingCart, FileText, Percent, Receipt } from 'lucide-react';
import { useAuth } from './auth-context';
import { cancelSubscription, getUserHistory } from './api';
import { toast } from 'sonner';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function TxIcon({ type }: { type: string }) {
  if (type === 'purchase') return <DollarSign className="w-4 h-4 text-emerald-400" />;
  if (type === 'credit-purchase') return <ShoppingCart className="w-4 h-4 text-teal-400" />;
  if (type === 'image') return <Image className="w-4 h-4 text-indigo-400" />;
  return <Video className="w-4 h-4 text-violet-400" />;
}

function TxBg({ type }: { type: string }) {
  if (type === 'purchase') return 'bg-emerald-500/20';
  if (type === 'credit-purchase') return 'bg-teal-500/20';
  if (type === 'image') return 'bg-indigo-500/20';
  return 'bg-violet-500/20';
}

function TxLabel(tx: any) {
  if (tx.type === 'purchase') return `${tx.tierName || 'Plan'} Subscription`;
  if (tx.type === 'credit-purchase') return 'Credit Top-up';
  if (tx.type === 'image') return 'AI Image Generation';
  return 'Video Recording';
}

function TxDetail(tx: any) {
  if (tx.type === 'purchase') {
    const parts: string[] = [];
    if (tx.imageCredits) parts.push(`${tx.imageCredits} image`);
    if (tx.videoCredits) parts.push(`${tx.videoCredits} video`);
    const cycle = tx.billingCycle === 'annual' ? 'Annual' : 'Monthly';
    return `${cycle} · ${parts.join(' + ')} credits`;
  }
  if (tx.type === 'credit-purchase') {
    const parts: string[] = [];
    if (tx.imageCredits) parts.push(`${tx.imageCredits} image`);
    if (tx.videoCredits) parts.push(`${tx.videoCredits} video`);
    let detail = parts.join(' + ') + ' credits';
    if (tx.discountPct) detail += ` (${tx.discountPct}% bulk discount)`;
    return detail;
  }
  return null;
}

export function BillingPage() {
  const navigate = useNavigate();
  const { credits, subscription, refreshProfile } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    getUserHistory()
      .then((data) => setTransactions(data.transactions || []))
      .catch(console.error)
      .finally(() => setLoadingHistory(false));
  }, []);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const result = await cancelSubscription();
      if (result.error) { toast.error(result.error); }
      else {
        toast.success('Subscription cancelled. Your credits remain active until the billing period ends.');
        await refreshProfile();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel');
    } finally {
      setCancelling(false);
      setShowCancelConfirm(false);
    }
  };

  const isActive = subscription && subscription.status !== 'cancelled';
  const isCancelled = subscription?.status === 'cancelled';

  // Separate purchases from usage
  const purchases = transactions.filter(tx => tx.type === 'purchase' || tx.type === 'credit-purchase');
  const usage = transactions.filter(tx => tx.type === 'image' || tx.type === 'video');

  return (
    <div className="p-4 md:p-6 relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-20 left-1/4 w-[600px] h-[600px] bg-indigo-500/[0.07] rounded-full blur-[150px]" />
      </div>

      <div className="max-w-3xl mx-auto relative z-10">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to studio
        </button>

        <h1 className="text-2xl font-bold text-white mb-6">Billing & Credits</h1>

        {/* Current Credits */}
        <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Current Balance</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Image className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-neutral-400">Image Credits</span>
              </div>
              <p className="text-3xl font-bold text-white">{credits?.imageCredits ?? 0}</p>
              <p className="text-xs text-neutral-600 mt-1">$1 per AI image generation</p>
            </div>
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Video className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-neutral-400">Video Credits</span>
              </div>
              <p className="text-3xl font-bold text-white">{credits?.videoCredits ?? 0}</p>
              <p className="text-xs text-neutral-600 mt-1">$5 per video recording</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button onClick={() => navigate('/buy-credits')}
              className="py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors text-sm flex items-center justify-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Buy Credits
            </button>
            <button onClick={() => navigate('/pricing')}
              className="py-3 bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 border border-white/[0.08] rounded-xl font-medium transition-colors text-sm flex items-center justify-center gap-2">
              <CreditCard className="w-4 h-4" /> View Subscriptions
            </button>
          </div>
        </div>

        {/* Active Subscription */}
        <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Subscription</h2>
          </div>

          {subscription ? (
            <div>
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white">{subscription.tierName} Plan</h3>
                      {isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Active</span>
                      )}
                      {isCancelled && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Cancelled</span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-400 capitalize">{subscription.billingCycle} billing</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">${subscription.price}</p>
                    <p className="text-xs text-neutral-500">/{subscription.billingCycle === 'annual' ? 'year' : 'month'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-neutral-400 border-t border-white/[0.06] pt-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Started: {formatDate(subscription.purchasedAt)}
                  </span>
                  {subscription.nextBilling && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {isCancelled ? 'Ends' : 'Renews'}: {formatDate(subscription.nextBilling)}
                    </span>
                  )}
                </div>

                {isCancelled && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Cancelled — your credits remain active until the billing period ends
                  </div>
                )}
              </div>

              {isActive && !showCancelConfirm && (
                <button onClick={() => setShowCancelConfirm(true)}
                  className="w-full py-3 bg-white/[0.04] hover:bg-red-500/10 border border-white/[0.08] hover:border-red-500/30 text-neutral-400 hover:text-red-400 rounded-xl font-medium transition-all text-sm flex items-center justify-center gap-2">
                  <XCircle className="w-4 h-4" /> Cancel subscription
                </button>
              )}

              {showCancelConfirm && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <p className="text-sm text-red-300 mb-3">
                    Are you sure? Your remaining credits will stay active until the current billing period ends, but your plan won't renew.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={handleCancel} disabled={cancelling}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                      {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, cancel'}
                    </button>
                    <button onClick={() => setShowCancelConfirm(false)}
                      className="flex-1 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 rounded-lg font-medium text-sm">
                      Keep subscription
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-neutral-400 text-sm mb-4">No active subscription</p>
              <button onClick={() => navigate('/pricing')}
                className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-colors">
                View plans
              </button>
            </div>
          )}
        </div>

        {/* Purchase / Invoice History */}
        <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Invoices & Purchases</h2>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          ) : purchases.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-500 text-sm">No purchases yet</p>
              <p className="text-neutral-600 text-xs mt-1">Your subscription and credit top-up invoices will appear here</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {purchases.map((tx, i) => (
                <div key={`p-${i}`} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${TxBg({ type: tx.type })}`}>
                        <TxIcon type={tx.type} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{TxLabel(tx)}</p>
                        <p className="text-xs text-neutral-500">
                          {formatDate(tx.createdAt)} at {formatTime(tx.createdAt)}
                        </p>
                        {TxDetail(tx) && (
                          <p className="text-xs text-neutral-500 mt-0.5">{TxDetail(tx)}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-emerald-400">${typeof tx.price === 'number' ? tx.price.toFixed(2) : tx.price}</span>
                      {tx.stripeSessionId && (
                        <p className="text-[10px] text-neutral-600 mt-0.5">Stripe</p>
                      )}
                      {!tx.stripeSessionId && tx.source !== 'webhook' && (
                        <p className="text-[10px] text-neutral-600 mt-0.5">Direct</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage History */}
        <div className="bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Usage History</h2>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          ) : usage.length === 0 ? (
            <div className="text-center py-8">
              <Image className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-500 text-sm">No activity yet</p>
              <p className="text-neutral-600 text-xs mt-1">Your image generations and video recordings will appear here</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {usage.map((tx, i) => (
                <div key={`u-${i}`} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center ${TxBg({ type: tx.type })}`}>
                      <TxIcon type={tx.type} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{TxLabel(tx)}</p>
                      <p className="text-xs text-neutral-500">
                        {formatDate(tx.createdAt)} at {formatTime(tx.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-neutral-400">-{tx.cost || (tx.type === 'image' ? 1 : 5)} credit{(tx.cost || (tx.type === 'image' ? 1 : 5)) !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
