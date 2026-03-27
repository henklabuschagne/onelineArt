import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, CheckCircle, Eye, EyeOff, Lock, Sparkles } from 'lucide-react';
import { updatePassword, getSupabase } from './api';

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase handles the token exchange automatically via the URL hash
  useEffect(() => {
    const sb = getSupabase();
    sb.auth.onAuthStateChange((event: string) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });
    // Also check if we already have a session (e.g., from the redirect)
    sb.auth.getSession().then(({ data }: any) => {
      if (data?.session) setSessionReady(true);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    setError('');
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="lg:w-[55%] bg-neutral-950 text-white p-8 lg:p-12 xl:p-16 flex flex-col justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-violet-500/8 rounded-full blur-[100px]" />

        <div className="relative z-10 max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">One-Line Art</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4 tracking-tight">Set a new password</h1>
          <p className="text-neutral-400 text-lg">Choose a strong password to secure your account.</p>
        </div>
      </div>

      <div className="lg:w-[45%] bg-white flex items-center justify-center p-8 lg:p-12 xl:p-16">
        <div className="w-full max-w-sm">
          {done ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900 mb-2">Password updated!</h2>
              <p className="text-sm text-neutral-400 mb-6">Your password has been reset successfully.</p>
              <button onClick={() => navigate('/login')}
                className="w-full py-3 bg-neutral-900 hover:bg-black text-white rounded-xl font-semibold transition-colors text-sm">
                Sign in with new password
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-neutral-900 mb-1">New password</h2>
              <p className="text-sm text-neutral-400 mb-8">Enter your new password below.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type={showPassword ? 'text' : 'password'} value={password}
                      onChange={(e) => setPassword(e.target.value)} required minLength={6}
                      className="w-full pl-10 pr-12 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-neutral-800 placeholder:text-neutral-300"
                      placeholder="Min 6 characters"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type={showPassword ? 'text' : 'password'} value={confirm}
                      onChange={(e) => setConfirm(e.target.value)} required minLength={6}
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-neutral-800 placeholder:text-neutral-300"
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">{error}</div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
