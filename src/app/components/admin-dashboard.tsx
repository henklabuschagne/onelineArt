import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Users, DollarSign, Image, Video, BarChart3, Settings, Trash2, Loader2, RefreshCw, Shield, TrendingUp, CreditCard } from 'lucide-react';
import { motion } from 'motion/react';
import { getAdminUsers, getAdminAnalytics, updateAdminPricing, adminUpdateUser, adminDeleteUser, getPricing } from './api';
import { useAuth } from './auth-context';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

type Tab = 'overview' | 'users' | 'pricing' | 'analytics';

export function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    loadData();
  }, [isAdmin]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, analyticsRes, pricingRes] = await Promise.all([
        getAdminUsers(),
        getAdminAnalytics(),
        getPricing(),
      ]);
      if (usersRes.users) setUsers(usersRes.users);
      if (!analyticsRes.error) setAnalytics(analyticsRes);
      if (pricingRes) setPricing(pricingRes);
    } catch (e) {
      console.error('Admin load error:', e);
    }
    setLoading(false);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    const res = await adminDeleteUser(userId);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('User deleted');
      loadData();
    }
  };

  const handleSavePricing = async () => {
    const res = await updateAdminPricing(pricing);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('Pricing updated');
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'pricing', label: 'Pricing', icon: CreditCard },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  ];

  const chartData = analytics ? Object.entries(analytics.usageByDay || {}).map(([day, val]: any) => ({
    day: day.slice(5),
    Images: val.images,
    Videos: val.videos,
  })).slice(-14) : [];

  const revenueChartData = analytics ? Object.entries(analytics.revenueByDay || {}).map(([day, val]: any) => ({
    day: day.slice(5),
    Revenue: val,
  })).slice(-14) : [];

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-57px)]">
      {/* Header */}
      <div className="border-b px-6 py-4 border-white/[0.06]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl p-1 border mb-6 w-fit bg-white/[0.03] border-white/[0.08]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === 'overview' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Users', value: analytics.totalUsers, icon: Users, color: 'text-blue-400 bg-blue-500/10' },
                { label: 'Revenue', value: `$${analytics.totalRevenue?.toFixed(0) || 0}`, icon: DollarSign, color: 'text-green-400 bg-green-500/10' },
                { label: 'Images Generated', value: analytics.totalImageGens, icon: Image, color: 'text-violet-400 bg-violet-500/10' },
                { label: 'Videos Created', value: analytics.totalVideoGens, icon: Video, color: 'text-amber-400 bg-amber-500/10' },
              ].map((stat) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-5 border bg-white/[0.03] border-white/[0.08]">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${stat.color}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-sm text-neutral-500">{stat.label}</p>
                </motion.div>
              ))}
            </div>

            {chartData.length > 0 && (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="rounded-xl p-5 border bg-white/[0.03] border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-neutral-300 mb-4">Usage (Last 14 days)</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#737373' }} stroke="rgba(255,255,255,0.06)" />
                      <YAxis tick={{ fontSize: 11, fill: '#737373' }} stroke="rgba(255,255,255,0.06)" />
                      <Tooltip contentStyle={{ background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                      <Legend wrapperStyle={{ color: '#a3a3a3' }} />
                      <Bar dataKey="Images" fill="#818cf8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Videos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl p-5 border bg-white/[0.03] border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-neutral-300 mb-4">Revenue (Last 14 days)</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={revenueChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#737373' }} stroke="rgba(255,255,255,0.06)" />
                      <YAxis tick={{ fontSize: 11, fill: '#737373' }} stroke="rgba(255,255,255,0.06)" />
                      <Tooltip contentStyle={{ background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                      <Bar dataKey="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* USERS */}
        {tab === 'users' && (
          <div className="rounded-xl border overflow-hidden bg-white/[0.03] border-white/[0.08]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-xs font-semibold text-neutral-500 uppercase px-5 py-3">User</th>
                  <th className="text-left text-xs font-semibold text-neutral-500 uppercase px-5 py-3">Role</th>
                  <th className="text-left text-xs font-semibold text-neutral-500 uppercase px-5 py-3">Joined</th>
                  <th className="text-right text-xs font-semibold text-neutral-500 uppercase px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-white text-sm">{u.name}</p>
                      <p className="text-xs text-neutral-500">{u.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${u.role === 'admin' ? 'bg-amber-500/15 text-amber-400' : 'bg-white/[0.06] text-neutral-400'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-neutral-500">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {u.role !== 'admin' && (
                        <button onClick={() => handleDeleteUser(u.id)} className="text-neutral-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-neutral-500 text-sm">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* PRICING */}
        {tab === 'pricing' && pricing && (
          <div className="space-y-6">
            <div className="rounded-xl border p-6 bg-white/[0.03] border-white/[0.08]">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-neutral-500" /> Base Costs & Discounts
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-neutral-400 mb-1 block">Image Cost ($)</label>
                  <input type="number" value={pricing.imageCost} onChange={(e) => setPricing({ ...pricing, imageCost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white/[0.05] border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-sm text-neutral-400 mb-1 block">Video Cost ($)</label>
                  <input type="number" value={pricing.videoCost} onChange={(e) => setPricing({ ...pricing, videoCost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white/[0.05] border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-sm text-neutral-400 mb-1 block">Annual Discount (%)</label>
                  <input type="number" value={pricing.annualDiscount} onChange={(e) => setPricing({ ...pricing, annualDiscount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white/[0.05] border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
            </div>

            {pricing.tiers.map((tier: any, i: number) => (
              <div key={tier.id} className="rounded-xl border p-6 bg-white/[0.03] border-white/[0.08]">
                <h3 className="font-semibold text-white mb-4">Tier {i + 1}: {tier.name}</h3>
                <div className="grid md:grid-cols-5 gap-4">
                  <div>
                    <label className="text-sm text-neutral-400 mb-1 block">Name</label>
                    <input type="text" value={tier.name}
                      onChange={(e) => {
                        const t = [...pricing.tiers]; t[i] = { ...t[i], name: e.target.value };
                        setPricing({ ...pricing, tiers: t });
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white/[0.05] border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-400 mb-1 block">Price ($/mo)</label>
                    <input type="number" value={tier.monthlyPrice}
                      onChange={(e) => {
                        const t = [...pricing.tiers]; t[i] = { ...t[i], monthlyPrice: Number(e.target.value) };
                        setPricing({ ...pricing, tiers: t });
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white/[0.05] border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-400 mb-1 block">Image Credits</label>
                    <input type="number" value={tier.imageCredits}
                      onChange={(e) => {
                        const t = [...pricing.tiers]; t[i] = { ...t[i], imageCredits: Number(e.target.value) };
                        setPricing({ ...pricing, tiers: t });
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white/[0.05] border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-400 mb-1 block">Video Credits</label>
                    <input type="number" value={tier.videoCredits}
                      onChange={(e) => {
                        const t = [...pricing.tiers]; t[i] = { ...t[i], videoCredits: Number(e.target.value) };
                        setPricing({ ...pricing, tiers: t });
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white/[0.05] border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-400 mb-1 block">Tier Discount (%)</label>
                    <input type="number" value={tier.discount}
                      onChange={(e) => {
                        const t = [...pricing.tiers]; t[i] = { ...t[i], discount: Number(e.target.value) };
                        setPricing({ ...pricing, tiers: t });
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white/[0.05] border-white/[0.1] text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
              </div>
            ))}

            <button onClick={handleSavePricing}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/20 transition-all">
              Save Pricing Changes
            </button>
          </div>
        )}

        {/* ANALYTICS */}
        {tab === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-xl p-5 border bg-white/[0.03] border-white/[0.08]">
                <p className="text-sm text-neutral-500 mb-1">Total Purchases</p>
                <p className="text-3xl font-bold text-white">{analytics.totalPurchases}</p>
              </div>
              <div className="rounded-xl p-5 border bg-white/[0.03] border-white/[0.08]">
                <p className="text-sm text-neutral-500 mb-1">Avg Revenue/User</p>
                <p className="text-3xl font-bold text-white">
                  ${analytics.totalUsers > 0 ? (analytics.totalRevenue / analytics.totalUsers).toFixed(2) : '0'}
                </p>
              </div>
              <div className="rounded-xl p-5 border bg-white/[0.03] border-white/[0.08]">
                <p className="text-sm text-neutral-500 mb-1">Total Generations</p>
                <p className="text-3xl font-bold text-white">{analytics.totalImageGens + analytics.totalVideoGens}</p>
              </div>
            </div>

            {chartData.length > 0 && (
              <div className="rounded-xl p-6 border bg-white/[0.03] border-white/[0.08]">
                <h3 className="text-sm font-semibold text-neutral-300 mb-4">Daily Usage Breakdown</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#737373' }} stroke="rgba(255,255,255,0.06)" />
                    <YAxis tick={{ fontSize: 12, fill: '#737373' }} stroke="rgba(255,255,255,0.06)" />
                    <Tooltip contentStyle={{ background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                    <Legend wrapperStyle={{ color: '#a3a3a3' }} />
                    <Bar dataKey="Images" fill="#818cf8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Videos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {revenueChartData.length > 0 && (
              <div className="rounded-xl p-6 border bg-white/[0.03] border-white/[0.08]">
                <h3 className="text-sm font-semibold text-neutral-300 mb-4">Daily Revenue</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#737373' }} stroke="rgba(255,255,255,0.06)" />
                    <YAxis tick={{ fontSize: 12, fill: '#737373' }} stroke="rgba(255,255,255,0.06)" />
                    <Tooltip contentStyle={{ background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                    <Bar dataKey="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
