import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, ArrowLeft, Mail, CheckCircle, Sparkles } from 'lucide-react';
import { forgotPassword } from './api';

export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const result = await forgotPassword(email, redirectTo);
      if (result.error) { setError(result.error); }
      else { setSent(true); }
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left dark panel */}
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

          <h1 className="text-4xl font-bold leading-tight mb-4 tracking-tight">
            Reset your password
          </h1>
          <p className="text-neutral-400 text-lg">
            We'll send you a link to reset your password and get back to creating.
          </p>
        </div>
      </div>

      {/* Right light panel */}
      <div className="lg:w-[45%] bg-white flex items-center justify-center p-8 lg:p-12 xl:p-16">
        <div className="w-full max-w-sm">
          <button onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-700 transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </button>

          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900 mb-2">Check your email</h2>
              <p className="text-sm text-neutral-400 mb-6">
                We've sent a password reset link to <span className="font-semibold text-neutral-700">{email}</span>.
                Click the link in the email to set a new password.
              </p>
              <button onClick={() => navigate('/login')}
                className="w-full py-3 bg-neutral-900 hover:bg-black text-white rounded-xl font-semibold transition-colors text-sm">
                Return to sign in
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-neutral-900 mb-1">Forgot password?</h2>
              <p className="text-sm text-neutral-400 mb-8">
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-neutral-800 placeholder:text-neutral-300"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
