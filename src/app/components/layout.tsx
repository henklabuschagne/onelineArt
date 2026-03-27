import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router';
import { Sparkles, LogOut, CreditCard, Shield, Image, Video, User, Receipt } from 'lucide-react';
import { useAuth } from './auth-context';
import { logout } from './api';
import { toast } from 'sonner';
import { IS_MOCK } from '../config';

export function Layout() {
  const { user, profile, credits, isAdmin, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Nav bar — always dark */}
      <nav className="backdrop-blur-xl border-b px-4 md:px-6 py-3 sticky top-0 z-30 bg-neutral-950/80 border-white/[0.06]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold hidden sm:inline tracking-tight text-white">One-Line Art</span>
          </Link>

          {user && (
            <div className="flex items-center gap-2">
              {!isAdmin && credits && (
                <div className="flex items-center gap-3 rounded-lg px-3 py-1.5 border text-sm bg-white/[0.05] border-white/[0.08]">
                  <span className="flex items-center gap-1.5 text-indigo-500 font-medium">
                    <Image className="w-3.5 h-3.5" />
                    {credits.imageCredits}
                  </span>
                  <span className="w-px h-4 bg-white/10" />
                  <span className="flex items-center gap-1.5 text-violet-500 font-medium">
                    <Video className="w-3.5 h-3.5" />
                    {credits.videoCredits}
                  </span>
                </div>
              )}

              {!isAdmin && (
                <Link to="/buy-credits"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors text-indigo-400 hover:bg-indigo-500/10">
                  <CreditCard className="w-4 h-4" />
                  <span className="hidden sm:inline">Buy Credits</span>
                </Link>
              )}

              {!isAdmin && (
                <Link to="/billing"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors text-neutral-400 hover:text-white hover:bg-white/[0.06]">
                  <Receipt className="w-4 h-4" />
                  <span className="hidden sm:inline">Billing</span>
                </Link>
              )}

              {isAdmin && (
                <Link to="/admin"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors text-amber-400 hover:bg-amber-500/10">
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )}

              <div className="flex items-center gap-2 text-sm px-2 text-neutral-400">
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">{profile?.name || profile?.email}</span>
              </div>

              <button onClick={handleLogout}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg transition-colors text-neutral-500 hover:text-red-400 hover:bg-red-500/10">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </nav>

      <Outlet />
    </div>
  );
}