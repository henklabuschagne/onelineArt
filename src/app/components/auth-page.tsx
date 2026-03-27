import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Loader2, Eye, EyeOff, Sparkles, Check, Zap, Crown, Wand2, Video, Image, Palette, ArrowRight, Film } from 'lucide-react';
import { login, signup, getPricing } from './api';
import { API_MODE } from '../config';

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'signup'>(location.pathname === '/signup' ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pricing, setPricing] = useState<any>(null);

  useEffect(() => {
    getPricing().then(setPricing).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'signup') {
        const result = await signup(email, password, name);
        if (result.error) { setError(result.error); setLoading(false); return; }
        // If email verification is required, redirect to verify page
        if (result.emailVerificationRequired) {
          navigate(`/verify-email?email=${encodeURIComponent(email)}`);
          return;
        }
        await login(email, password);
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err: any) {
      // Handle "Email not confirmed" error from Supabase
      if (err.message?.toLowerCase().includes('email not confirmed')) {
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const tierIcons = [Sparkles, Zap, Crown];
  const tierAccents = ['#818cf8', '#a78bfa', '#fbbf24'];

  const features = [
    { icon: Wand2, title: 'AI Image Generation', desc: 'Generate one-line art from text prompts using DALL-E 3' },
    { icon: Video, title: 'Video Recording', desc: 'Watch and record your art being drawn in real-time' },
    { icon: Image, title: 'Image Tracing', desc: 'Upload any image and trace it as a single continuous line' },
    { icon: Film, title: 'Story Mode', desc: 'Sequence up to 10 images into a single cinematic drawing video' },
    { icon: Palette, title: 'Full Creative Control', desc: 'Customize color, thickness, speed, density & more' },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* LEFT PANEL — Dark */}
      <div className="lg:w-[55%] bg-neutral-950 text-white p-8 lg:p-12 xl:p-16 flex flex-col justify-between relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        {/* Gradient glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-violet-500/8 rounded-full blur-[100px]" />

        <div className="relative z-10">
          {/* Logo / Brand */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">One-Line Art</span>
          </div>

          {/* Hero text */}
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-4 tracking-tight">
            Turn any image into<br />
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">mesmerizing one-line art</span>
          </h1>
          <p className="text-neutral-400 text-lg mb-10 max-w-md">
            AI-powered image generation, real-time drawing visualization, and HD video recording — all in one studio.
          </p>

          {/* Features */}
          <div className="grid grid-cols-2 gap-4 mb-10">
            {features.map((f) => (
              <div key={f.title} className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  <f.icon className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/90">{f.title}</p>
                  <p className="text-xs text-neutral-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Pricing tiers */}
          {pricing?.tiers && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">Plans</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="space-y-3">
                {pricing.tiers.map((tier: any, i: number) => {
                  const Icon = tierIcons[i];
                  const accent = tierAccents[i];
                  const popular = i === 1;

                  return (
                    <div
                      key={tier.id}
                      className={`rounded-xl p-4 border transition-colors ${
                        popular
                          ? 'bg-white/[0.06] border-indigo-500/30'
                          : 'bg-white/[0.03] border-white/[0.06] hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + '18' }}>
                          <Icon className="w-5 h-5" style={{ color: accent }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white text-sm">{tier.name}</h3>
                            {popular && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">Popular</span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5">{tier.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xl font-bold text-white">${tier.monthlyPrice}</p>
                          <p className="text-[10px] text-neutral-500">/month</p>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-3 ml-14">
                        <span className="text-xs text-neutral-400 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-500" /> {tier.imageCredits} images
                        </span>
                        <span className="text-xs text-neutral-400 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-500" /> {tier.videoCredits} videos
                        </span>
                        {tier.discount > 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: accent + '18', color: accent }}>
                            Save {tier.discount}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {pricing.annualDiscount > 0 && (
                <p className="text-xs text-neutral-600 mt-3 text-center">
                  Save an extra <span className="text-indigo-400 font-semibold">{pricing.annualDiscount}%</span> with annual billing
                </p>
              )}
            </div>
          )}
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10 mt-10">
          <p className="text-xs text-neutral-700">&copy; 2026 One-Line Art Studio. All rights reserved.</p>
        </div>
      </div>

      {/* RIGHT PANEL — Light */}
      <div className="lg:w-[45%] bg-white flex items-center justify-center p-8 lg:p-12 xl:p-16">
        <div className="w-full max-w-sm">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 mb-8">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-1">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-sm text-neutral-400">
              {mode === 'login'
                ? 'Sign in to continue creating one-line art'
                : 'Start with 5 free image + 1 free video credit'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Full Name</label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-neutral-800 placeholder:text-neutral-300 transition-shadow"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-neutral-800 placeholder:text-neutral-300 transition-shadow"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required
                  minLength={mode === 'signup' ? 6 : undefined}
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-neutral-800 pr-12 placeholder:text-neutral-300 transition-shadow"
                  placeholder={mode === 'signup' ? 'Min 6 characters' : 'Your password'}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors">
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
                {mode === 'login' && (
                  <button type="button" onClick={() => navigate('/forgot-password')}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium mt-1.5 transition-colors">
                    Forgot password?
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-lg shadow-neutral-200"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Free credits badge for signup */}
          {mode === 'signup' && (
            <div className="mt-6 flex items-center gap-3 bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-900">Free credits on signup</p>
                <p className="text-[11px] text-indigo-600/70">5 AI image generations + 1 video recording</p>
              </div>
            </div>
          )}

          {/* Switch mode link */}
          <p className="text-center text-sm text-neutral-400 mt-8">
            {mode === 'login' ? (
              <>Don't have an account? <button onClick={() => { setMode('signup'); setError(''); }} className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">Sign up free</button></>
            ) : (
              <>Already have an account? <button onClick={() => { setMode('login'); setError(''); }} className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">Sign in</button></>
            )}
          </p>

          {/* Mock mode test accounts */}
          {API_MODE === 'mock' && mode === 'login' && (
            <div className="mt-5 space-y-2">
              <p className="text-xs text-neutral-400 text-center font-semibold uppercase tracking-wider">Test Accounts</p>
              <button
                onClick={() => { setEmail('admin@test.com'); setPassword('admin123'); }}
                className="w-full py-2.5 px-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 font-medium hover:bg-amber-100 transition-colors flex items-center justify-between"
              >
                <span>Admin: admin@test.com</span>
                <span className="text-xs text-amber-500">admin123</span>
              </button>
              <button
                onClick={() => { setEmail('user@test.com'); setPassword('user123'); }}
                className="w-full py-2.5 px-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800 font-medium hover:bg-indigo-100 transition-colors flex items-center justify-between"
              >
                <span>User: user@test.com</span>
                <span className="text-xs text-indigo-500">user123</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}