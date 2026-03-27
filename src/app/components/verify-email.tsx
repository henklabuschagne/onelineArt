import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Loader2, Mail, CheckCircle, RefreshCw, Sparkles } from 'lucide-react';
import { resendVerification } from './api';

export function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async () => {
    if (!emailParam) { setError('No email address provided'); return; }
    setResending(true);
    setError('');
    try {
      const result = await resendVerification(emailParam);
      if (result.error) { setError(result.error); }
      else { setResent(true); setTimeout(() => setResent(false), 5000); }
    } catch (err: any) {
      setError(err.message || 'Failed to resend');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="lg:w-[55%] bg-neutral-950 text-white p-8 lg:p-12 xl:p-16 flex flex-col justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px]" />

        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">One-Line Art</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4 tracking-tight">Almost there!</h1>
          <p className="text-neutral-400 text-lg">Verify your email to start creating one-line art.</p>
        </div>
      </div>

      <div className="lg:w-[45%] bg-white flex items-center justify-center p-8 lg:p-12 xl:p-16">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-indigo-600" />
          </div>

          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Check your email</h2>
          <p className="text-sm text-neutral-400 mb-2">
            We've sent a verification link to
          </p>
          {emailParam && (
            <p className="text-sm font-semibold text-neutral-700 mb-6">{emailParam}</p>
          )}
          <p className="text-sm text-neutral-400 mb-8">
            Click the link in the email to verify your account, then come back and sign in.
          </p>

          <div className="space-y-3">
            <button onClick={() => navigate('/login')}
              className="w-full py-3 bg-neutral-900 hover:bg-black text-white rounded-xl font-semibold transition-colors text-sm">
              Go to sign in
            </button>

            <button onClick={handleResend} disabled={resending || resent}
              className="w-full py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-semibold transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {resending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : resent ? (
                <><CheckCircle className="w-4 h-4 text-emerald-500" /> Email resent!</>
              ) : (
                <><RefreshCw className="w-4 h-4" /> Resend verification email</>
              )}
            </button>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100 mt-4">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
