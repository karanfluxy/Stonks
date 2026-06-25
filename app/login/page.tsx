
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrendingUp, ArrowRight, Mail, Lock, Eye, EyeOff, BarChart3, Shield, Zap } from 'lucide-react';

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          rememberMe: formData.rememberMe,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Signin failed');
      }

      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signin failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1426] text-white flex">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-2 mb-10 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-[#f59e0b] flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#0B1426]" />
            </div>
            <span className="text-xl font-bold">Stonks</span>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
            <p className="text-slate-400">Log in to continue analyzing markets</p>
          </div>

          {/* Form Card */}
          <div className="bg-[#0f1d32] border border-[#1e293b] rounded-2xl p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-slate-300">
                  Email Address
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[#f59e0b] transition-colors" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-11 h-12 bg-[#0B1426] border-[#1e293b] hover:border-[#334155] focus:border-[#f59e0b] focus:ring-[#f59e0b]/20 rounded-xl text-white placeholder:text-slate-600"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-slate-300">
                    Password
                  </label>
                  <Link href="#" className="text-xs text-[#f59e0b] hover:text-[#fbbf24] transition-colors">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[#f59e0b] transition-colors" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-11 pr-11 h-12 bg-[#0B1426] border-[#1e293b] hover:border-[#334155] focus:border-[#f59e0b] focus:ring-[#f59e0b]/20 rounded-xl text-white placeholder:text-slate-600"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  className="w-4 h-4 rounded border-[#1e293b] bg-[#0B1426] text-[#f59e0b] focus:ring-[#f59e0b]/20"
                />
                <label htmlFor="rememberMe" className="text-sm text-slate-400">
                  Remember me for 30 days
                </label>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#f59e0b] hover:bg-[#fbbf24] text-[#0B1426] font-semibold rounded-xl transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing In...' : 'Sign In'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              {error && (
                <p className="text-sm text-red-400 mt-2" role="alert">
                  {error}
                </p>
              )}

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#1e293b]"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-[#0f1d32] text-slate-500">or continue with</span>
                </div>
              </div>

              {/* Social Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 bg-[#0B1426] border-[#1e293b] hover:border-[#334155] hover:bg-[#132440] text-white rounded-xl"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 bg-[#0B1426] border-[#1e293b] hover:border-[#334155] hover:bg-[#132440] text-white rounded-xl"
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GitHub
                </Button>
              </div>
            </form>
          </div>

          {/* Sign Up Link */}
          <p className="mt-8 text-center text-slate-400">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-[#f59e0b] hover:text-[#fbbf24] font-medium transition-colors">
              Sign up free
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side - Visual */}
      <div className="hidden lg:flex w-1/2 items-center justify-center p-12 relative overflow-hidden bg-[#0a1222]">
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(245, 158, 11, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(245, 158, 11, 0.08) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />

        <div className="relative z-10 max-w-lg">
          <h2 className="text-3xl font-bold mb-3">Your markets, your way</h2>
          <p className="text-slate-400 text-lg mb-12">
            AI-powered analysis that helps you make informed decisions.
          </p>

          {/* Feature list */}
          <div className="space-y-5">
            {[
              { icon: BarChart3, title: 'Real-Time Analytics', desc: 'Live candlestick charts with 50+ technical indicators', color: '#f59e0b' },
              { icon: Zap, title: 'Instant Predictions', desc: 'LSTM and Random Forest models for price and buy signals', color: '#10b981' },
              { icon: Shield, title: 'Portfolio Protection', desc: 'Risk alerts and portfolio rating with AI suggestions', color: '#3b82f6' },
            ].map((feature) => (
              <div key={feature.title} className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${feature.color}15`, border: `1px solid ${feature.color}30` }}
                >
                  <feature.icon className="w-5 h-5" style={{ color: feature.color }} />
                </div>
                <div>
                  <p className="text-white font-medium">{feature.title}</p>
                  <p className="text-slate-500 text-sm">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-6 mt-12 pt-8 border-t border-[#1e293b]">
            <div>
              <p className="text-2xl font-bold text-white">50K+</p>
              <p className="text-slate-500 text-xs mt-1">Active Traders</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">99.9%</p>
              <p className="text-slate-500 text-xs mt-1">Uptime</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">24/7</p>
              <p className="text-slate-500 text-xs mt-1">AI Analysis</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
