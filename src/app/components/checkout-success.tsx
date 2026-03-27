import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CheckCircle, Loader2, XCircle, ArrowLeft } from 'lucide-react';
import { verifyCheckoutSession } from './api';
import { useAuth } from './auth-context';
import { toast } from 'sonner';

export function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setStatus('error');
      setErrorMsg('No checkout session found. You may have arrived here by mistake.');
      return;
    }

    const verify = async () => {
      try {
        const result = await verifyCheckoutSession(sessionId);
        if (result.success) {
          setStatus('success');
          await refreshProfile();
          toast.success('Payment successful! Credits have been added to your account.');
        } else {
          setStatus('error');
          setErrorMsg(result.error || 'Failed to verify payment');
          console.error('Checkout verification failed:', result.error);
        }
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Failed to verify payment');
        console.error('Checkout verification exception:', err);
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="p-4 md:p-8 relative">
      <div className="max-w-lg mx-auto relative z-10 mt-16">
        {status === 'verifying' && (
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-indigo-400 animate-spin mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-white mb-2">Verifying Payment...</h1>
            <p className="text-neutral-400">Please wait while we confirm your purchase with Stripe.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-3">Payment Successful!</h1>
            <p className="text-neutral-400 mb-8">Your credits have been added to your account. You're ready to create!</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate('/')}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/20">
                Start Creating
              </button>
              <button onClick={() => navigate('/pricing')}
                className="px-6 py-3 bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08] rounded-xl font-medium transition-all">
                View Plans
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Payment Verification Failed</h1>
            <p className="text-neutral-400 mb-2">{errorMsg}</p>
            <p className="text-neutral-500 text-sm mb-8">If you were charged, please contact support. Your payment will be refunded if credits weren't applied.</p>
            <button onClick={() => navigate('/pricing')}
              className="px-6 py-3 bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08] rounded-xl font-medium transition-all flex items-center gap-2 mx-auto">
              <ArrowLeft className="w-4 h-4" /> Back to Pricing
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
