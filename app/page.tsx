'use client';

import Link from 'next/link';
import { ArrowRight, TrendingUp, Brain, BarChart3, MessageSquare, Shield, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import NumberFlow from '@number-flow/react';
import { motion, AnimatePresence } from 'framer-motion';

// Generate initial chart data
const generateChartData = () => {
  const points = [];
  let value = 120;
  for (let i = 0; i < 20; i++) {
    value = value + (Math.random() - 0.4) * 15;
    value = Math.max(30, Math.min(140, value));
    points.push(value);
  }
  return points;
};

// Convert data points to SVG path
const dataToPath = (data: number[], width: number, height: number) => {
  const xStep = width / (data.length - 1);
  const points = data.map((y, i) => `${i * xStep},${y}`);
  return `M${points.join(' L')}`;
};

const dataToAreaPath = (data: number[], width: number, height: number) => {
  const xStep = width / (data.length - 1);
  const points = data.map((y, i) => `${i * xStep},${y}`);
  return `M${points.join(' L')} L${width},${height} L0,${height} Z`;
};

export default function Home() {
  const [chartData, setChartData] = useState<number[]>([120, 110, 100, 90, 85, 80, 75, 70, 65, 60, 55, 50, 55, 50, 45, 40, 35, 40, 35, 32]);
  const [price, setPrice] = useState(189.84);
  const [change, setChange] = useState(2.34);
  const [high, setHigh] = useState(192.53);
  const [rsi, setRsi] = useState(62.4);
  const [macd, setMacd] = useState(1.23);
  const [volume, setVolume] = useState(45.2);

  // Feature cards carousel state
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  
  // Pricing state
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  
  // Dashboard preview dynamic data
  const [dashPrice, setDashPrice] = useState(892.45);
  const [dashPrevPrice, setDashPrevPrice] = useState(892.45);
  const [dashChange, setDashChange] = useState(0.0);
  const [dashRsi, setDashRsi] = useState(68.2);
  const [dashMacd, setDashMacd] = useState(2.45);
  const [dashVol, setDashVol] = useState(89);
  const [dashChartData, setDashChartData] = useState([50, 45, 48, 35, 38, 25, 28, 15, 18, 8, 12]);
  const [aiInsight, setAiInsight] = useState("Strong momentum with RSI at 68. Consider taking profits at $920 resistance.");

  const aiInsights = [
    "Strong momentum with RSI at 68. Consider taking profits at $920 resistance.",
    "Bullish MACD crossover detected. Volume confirms upward trend continuation.",
    "Price testing key support at $880. Watch for bounce or breakdown signals.",
    "Overbought conditions emerging. Consider reducing position size gradually.",
    "Positive earnings sentiment driving momentum. Target price raised to $950."
  ];

  const featureCards = [
    { icon: BarChart3, title: "Real-Time Charts", desc: "Interactive candlestick charts with 50+ technical indicators", color: "#10b981", tags: ["Live Data", "50+ Indicators"] },
    { icon: Brain, title: "AI Explanations", desc: "Human-readable AI insights and technical analysis", color: "#6366f1", tags: ["GPT-Powered", "Actionable"] },
    { icon: MessageSquare, title: "News Sentiment", desc: "Real-time sentiment analysis and news summaries", color: "#f59e0b", tags: ["Real-Time", "Summaries"] },
    { icon: TrendingUp, title: "Price Predictions", desc: "ML-powered forecasting with confidence bands", color: "#10b981", tags: ["ML Models", "Alerts"] },
    { icon: Shield, title: "Risk Alerts", desc: "Instant volatility spikes and portfolio risk signals", color: "#ef4444", tags: ["Risk Score", "Stops"] },
    { icon: BarChart3, title: "Portfolio Heatmap", desc: "See sector exposure and diversification at a glance", color: "#22c55e", tags: ["Sectors", "Diversify"] },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setChartData(prev => {
        const newData = [...prev.slice(1)];
        const lastValue = prev[prev.length - 1];
        const newValue = Math.max(25, Math.min(130, lastValue + (Math.random() - 0.45) * 12));
        newData.push(newValue);
        return newData;
      });

      // Update price with small fluctuations
      setPrice(prev => {
        const newPrice = prev + (Math.random() - 0.45) * 0.8;
        return Math.round(newPrice * 100) / 100;
      });

      // Update change percentage
      setChange(prev => {
        const newChange = prev + (Math.random() - 0.5) * 0.15;
        return Math.round(newChange * 100) / 100;
      });

      // Update high occasionally
      setHigh(prev => {
        if (Math.random() > 0.7) {
          return Math.round((prev + (Math.random() - 0.3) * 0.5) * 100) / 100;
        }
        return prev;
      });

      // Update indicators
      setRsi(prev => Math.round((prev + (Math.random() - 0.5) * 2) * 10) / 10);
      setMacd(prev => Math.round((prev + (Math.random() - 0.5) * 0.1) * 100) / 100);
      setVolume(prev => Math.round((prev + (Math.random() - 0.5) * 0.5) * 10) / 10);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // Card carousel rotation effect
  useEffect(() => {
    const cardInterval = setInterval(() => {
      setActiveCardIndex(prev => (prev + 1) % featureCards.length);
    }, 3000);
    return () => clearInterval(cardInterval);
  }, [featureCards.length]);

  // Dashboard preview data updates
  useEffect(() => {
    const dashInterval = setInterval(() => {
      setDashPrice(prev => {
        const next = Math.round((prev + (Math.random() - 0.5) * 14) * 100) / 100;
        const diff = next - prev;
        const pct = prev === 0 ? 0 : (diff / prev) * 100;
        setDashPrevPrice(prev);
        setDashChange(Math.round(pct * 100) / 100);
        return next;
      });
      setDashRsi(prev => Math.max(30, Math.min(85, Math.round((prev + (Math.random() - 0.5) * 3) * 10) / 10)));
      setDashMacd(prev => Math.round((prev + (Math.random() - 0.5) * 0.2) * 100) / 100);
      setDashVol(prev => Math.max(50, Math.min(150, Math.round(prev + (Math.random() - 0.5) * 5))));
      
      // Update mini chart
      setDashChartData(prev => {
        const newData = [...prev.slice(1)];
        const lastVal = prev[prev.length - 1];
        const newVal = Math.max(5, Math.min(55, lastVal + (Math.random() - 0.45) * 8));
        newData.push(newVal);
        return newData;
      });
      
      // Occasionally update AI insight
      if (Math.random() > 0.85) {
        setAiInsight(aiInsights[Math.floor(Math.random() * aiInsights.length)]);
      }
    }, 2000);
    return () => clearInterval(dashInterval);
  }, []);

  const chartPath = dataToPath(chartData, 380, 140);
  const areaPath = dataToAreaPath(chartData, 380, 140);
  const lastPoint = chartData[chartData.length - 1];
  const lastX = 380;

  const priceTone = dashChange > 0.3 ? '#10b981' : dashChange < -0.3 ? '#ef4444' : '#f59e0b';


  return (
    <div className="min-h-screen bg-[#0B1426] text-foreground dark relative">
      {/* Global Grid Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Base dark background */}
        <div className="absolute inset-0 bg-[#0B1426]" />
        
        {/* Large grid squares */}
        <div 
          className="absolute inset-0" 
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(16, 185, 129, 0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(16, 185, 129, 0.14) 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }}
        />
        
        {/* Small grid squares */}
        <div 
          className="absolute inset-0" 
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(16, 185, 129, 0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(16, 185, 129, 0.07) 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}
        />
        
        {/* Fade gradient from top to bottom (vanish by 30%) */}
        <div 
          className="absolute inset-0 pointer-events-none" 
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, rgba(11, 20, 38, 0.5) 20%, rgba(11, 20, 38, 0.85) 30%, rgba(11, 20, 38, 1) 35%, rgba(11, 20, 38, 1) 100%)'
          }}
        />
      </div>
      
      <div className="relative z-10">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">Stonks</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm hover:text-primary transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm hover:text-primary transition-colors">How it Works</a>
            <Link href="/#pricing" className="text-sm hover:text-primary transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Login</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm" className="bg-primary hover:bg-primary/90">Sign Up</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10">
          {/* Grid Pattern - Full Page */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:10px_10px]" />
          
          {/* Radial Gradient Overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--background)_70%)]" />
          
          {/* Gradient Orbs */}
          <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/8 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute bottom-20 left-1/4 w-80 h-80 bg-secondary/8 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left Content */}
            <div className="text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-primary/30 bg-primary/5 backdrop-blur-sm mb-8 shadow-lg shadow-primary/5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                </span>
                <span className="text-sm font-medium text-foreground/80">AI-Powered Market Intelligence</span>
              </div>

              {/* Main Heading */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-[1.1] tracking-tight">
                <span className="block">Understand Markets</span>
                <span className="block mt-2">
                  with <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary to-secondary animate-gradient">AI Insights</span>
                </span>
              </h1>

              {/* Description */}
              <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Real-time stock analysis, technical indicators, news sentiment, and AI-generated explanations to make informed decisions.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-10">
                <Link href="/signup">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 gap-2 h-14 px-8 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:scale-[1.02]">
                    Get Started Free
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/demo">
                  <Button variant="outline" size="lg" className="h-14 px-8 text-base font-semibold border-border/50 hover:bg-card hover:border-primary/30 transition-all">
                    Try Demo
                  </Button>
                </Link>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 pt-8 border-t border-border/50">
                <div className="group">
                  <div className="text-2xl sm:text-3xl font-bold text-foreground group-hover:text-primary transition-colors">1M+</div>
                  <div className="text-sm text-muted-foreground mt-1">Data Points</div>
                </div>
                <div className="group">
                  <div className="text-2xl sm:text-3xl font-bold text-foreground group-hover:text-secondary transition-colors">50+</div>
                  <div className="text-sm text-muted-foreground mt-1">Indicators</div>
                </div>
                <div className="group">
                  <div className="text-2xl sm:text-3xl font-bold text-foreground group-hover:text-accent transition-colors">24/7</div>
                  <div className="text-sm text-muted-foreground mt-1">AI Analysis</div>
                </div>
              </div>
            </div>

            {/* Right Side - Demo Chart Card */}
            <div className="relative lg:pl-8">
              {/* Floating Glow */}
              <div className="absolute -inset-4 bg-gradient-to-r from-[#10b981]/20 via-[#6366f1]/10 to-[#10b981]/20 rounded-3xl blur-2xl opacity-60" />
              
              {/* Main Card */}
              <div className="relative bg-[#0f1d32]/90 backdrop-blur-xl border border-[#1e293b] rounded-2xl p-6 shadow-2xl">
                {/* Card Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#10b981]/20 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-[#10b981]" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">AAPL</div>
                      <div className="text-sm text-gray-400">Apple Inc.</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-xl text-white transition-all duration-300">${price.toFixed(2)}</div>
                    <div className={`text-sm font-medium transition-all duration-300 ${change >= 0 ? 'text-[#10b981]' : 'text-red-400'}`}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Chart Area */}
                <div className="relative h-48 mb-6 bg-[#0f0f17] rounded-xl p-4 overflow-hidden">
                  <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
                    {/* Gradient Fill */}
                    <defs>
                      <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                      </linearGradient>
                      <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="50%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                    
                    {/* Grid lines */}
                    {[0, 37.5, 75, 112.5, 150].map((y, i) => (
                      <line key={i} x1="0" y1={y} x2="400" y2={y} stroke="#132440" strokeWidth="1" />
                    ))}
                    
                    {/* Area Fill */}
                    <path
                      d={areaPath}
                      fill="url(#chartGradient)"
                      className="transition-all duration-500 ease-out"
                    />
                    
                    {/* Line */}
                    <path
                      d={chartPath}
                      fill="none"
                      stroke="url(#lineGradient)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-500 ease-out"
                    />
                    
                    {/* Current point glow */}
                    <circle cx={lastX} cy={lastPoint} r="12" fill="#10b981" fillOpacity="0.2" className="animate-ping" />
                    <circle cx={lastX} cy={lastPoint} r="6" fill="#10b981" className="animate-pulse" />
                    <circle cx={lastX} cy={lastPoint} r="3" fill="#fff" />
                  </svg>
                  
                  {/* Tooltip */}
                  <div className="absolute top-4 right-6 bg-[#132440] border border-[#1e293b] rounded-lg px-3 py-2 shadow-lg">
                    <div className="text-xs text-gray-400">Today&apos;s High</div>
                    <div className="font-semibold text-[#10b981] transition-all duration-300">${high.toFixed(2)}</div>
                  </div>
                  
                  {/* Time labels */}
                  <div className="absolute bottom-1 left-4 right-4 flex justify-between text-[10px] text-gray-500">
                    <span>9:30</span>
                    <span>11:00</span>
                    <span>12:30</span>
                    <span>14:00</span>
                    <span>15:30</span>
                  </div>
                </div>

                {/* Indicators Row */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-[#132440] border border-[#1e293b] rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">RSI</div>
                    <div className="font-semibold text-white transition-all duration-300">{rsi.toFixed(1)}</div>
                  </div>
                  <div className="bg-[#132440] border border-[#1e293b] rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">MACD</div>
                    <div className={`font-semibold transition-all duration-300 ${macd >= 0 ? 'text-[#10b981]' : 'text-red-400'}`}>
                      {macd >= 0 ? '+' : ''}{macd.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-[#132440] border border-[#1e293b] rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">Volume</div>
                    <div className="font-semibold text-white transition-all duration-300">{volume.toFixed(1)}M</div>
                  </div>
                </div>

                {/* AI Insight */}
                <div className="bg-[#10b981]/10 border border-[#10b981]/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-[#10b981]" />
                    <span className="text-sm font-medium text-[#10b981]">AI Insight</span>
                  </div>
                  <p className="text-sm text-gray-400">
                    Strong bullish momentum detected. RSI indicates healthy growth potential with support at $185.
                  </p>
                </div>
              </div>

              {/* Floating Elements */}
              <div className="absolute -top-4 -right-4 bg-[#132440] border border-[#1e293b] rounded-xl p-3 shadow-lg animate-bounce" style={{ animationDuration: '3s' }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                  <span className="text-sm font-medium text-white">Live</span>
                </div>
              </div>
              
              <div className="absolute -bottom-2 -left-2 bg-[#132440] border border-[#1e293b] rounded-xl px-4 py-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#6366f1]" />
                  <span className="text-sm text-gray-400">50+ Indicators</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#10b981]/5 rounded-full blur-[150px]" />
          <div className="absolute top-20 right-20 w-[400px] h-[400px] bg-[#6366f1]/5 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#10b981]/30 bg-[#10b981]/5 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
              <span className="text-sm font-medium text-[#10b981]">Features</span>
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-6 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Powerful Features
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">
              Everything you need for intelligent stock analysis
            </p>
          </div>

          {/* Two Column Layout: Stacked Cards + Visual */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            
            {/* Left: 3D Floating Dashboard Preview */}
            <div className="relative">
              {/* Main Visual Container */}
              <div className="relative perspective-1000">
                {/* Glow Behind */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#10b981]/20 via-[#6366f1]/20 to-[#10b981]/20 rounded-3xl blur-3xl opacity-50 animate-pulse" />
                
                {/* Main Dashboard Card */}
                <div 
                  className="relative bg-gradient-to-br from-[#0f1d32] to-[#0a0a12] rounded-2xl border border-[#1e293b] p-6 shadow-2xl"
                  style={{ transform: 'rotateY(-5deg) rotateX(5deg)' }}
                >
                  {/* Dashboard Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <div className="text-xs text-gray-500">stonks.ai/dashboard</div>
                  </div>
                  
                  {/* Mini Chart */}
                  <div className="bg-[#0f0f17] rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#10b981]/20 flex items-center justify-center">
                          <TrendingUp className="w-4 h-4 text-[#10b981]" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">NVDA</div>
                          <div className="text-xs text-gray-500">NVIDIA Corp</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold transition-all duration-300" style={{ color: priceTone }}>${dashPrice.toFixed(2)}</div>
                        <div className="text-xs transition-all duration-300" style={{ color: priceTone }}>
                          {dashChange >= 0 ? '+' : ''}{dashChange.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    
                    {/* SVG Mini Chart - Dynamic */}
                    <svg className="w-full h-24" viewBox="0 0 200 60">
                      <defs>
                        <linearGradient id="miniChartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor={priceTone} stopOpacity="0.3" />
                          <stop offset="100%" stopColor={priceTone} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path 
                        d={`M${dashChartData.map((val, i) => `${i * 20},${val}`).join(' L')} L200,60 L0,60 Z`}
                        fill="url(#miniChartGrad)" 
                        className="transition-all duration-500"
                      />
                      <path 
                        d={`M${dashChartData.map((val, i) => `${i * 20},${val}`).join(' L')}`}
                        fill="none" 
                        stroke={priceTone} 
                        strokeWidth="2" 
                        className="transition-all duration-500"
                      />
                      <circle cx="200" cy={dashChartData[dashChartData.length - 1]} r="4" fill={priceTone} className="animate-pulse" />
                    </svg>
                  </div>
                  
                  {/* AI Insight Box */}
                  <div className="bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-4 h-4 text-[#6366f1]" />
                      <span className="text-xs font-medium text-[#6366f1]">AI Analysis</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1] animate-pulse" />
                    </div>
                    <p className="text-xs text-gray-400 transition-all duration-500">{aiInsight}</p>
                  </div>
                  
                  {/* Quick Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#132440] rounded-lg p-2 text-center">
                      <div className="text-xs text-gray-500">RSI</div>
                      <div className="text-sm font-semibold text-white transition-all duration-300">{dashRsi.toFixed(1)}</div>
                    </div>
                    <div className="bg-[#132440] rounded-lg p-2 text-center">
                      <div className="text-xs text-gray-500">MACD</div>
                      <div className={`text-sm font-semibold transition-all duration-300 ${dashMacd >= 0 ? 'text-[#10b981]' : 'text-red-500'}`}>
                        {dashMacd >= 0 ? '+' : ''}{dashMacd.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-[#132440] rounded-lg p-2 text-center">
                      <div className="text-xs text-gray-500">Vol</div>
                      <div className="text-sm font-semibold text-white transition-all duration-300">{dashVol}M</div>
                    </div>
                  </div>
                </div>
                
                {/* Floating Stock Tickers */}
                <div className="absolute -top-6 -right-6 bg-[#0f1d32] border border-[#1e293b] rounded-xl px-4 py-2 shadow-xl animate-bounce" style={{ animationDuration: '4s' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">AAPL</span>
                    <span className="text-xs text-[#10b981]">+1.2%</span>
                  </div>
                </div>
                
                <div className="absolute -bottom-4 -left-6 bg-[#0f1d32] border border-[#1e293b] rounded-xl px-4 py-2 shadow-xl animate-bounce" style={{ animationDuration: '5s', animationDelay: '1s' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">TSLA</span>
                    <span className="text-xs text-[#10b981]">+3.4%</span>
                  </div>
                </div>
                
                <div className="absolute top-1/2 -right-10 bg-[#0f1d32] border border-[#1e293b] rounded-xl px-4 py-2 shadow-xl animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '0.5s' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">MSFT</span>
                    <span className="text-xs text-[#10b981]">+0.8%</span>
                  </div>
                </div>
                
              </div>
            </div>

            {/* Right: Stacked Cards with Dynamic Carousel */}
            <div className="relative h-[500px]">
              {/* Card Stack Container */}
              <div className="relative w-full h-full flex items-center justify-center">
                {featureCards.map((feature, index) => {
                  const Icon = feature.icon;
                  // Calculate position in stack based on activeCardIndex
                  const position = (index - activeCardIndex + featureCards.length) % featureCards.length;
                  
                  // Dynamic transforms based on position
                  const getTransform = () => {
                    switch(position) {
                      case 0: // Front card
                        return { z: 40, y: 0, scale: 1, rotate: 0, opacity: 1 };
                      case 1: // Second card
                        return { z: 30, y: 30, scale: 0.95, rotate: 2, opacity: 0.9 };
                      case 2: // Third card
                        return { z: 20, y: 60, scale: 0.9, rotate: -2, opacity: 0.7 };
                      case 3: // Back card (going behind)
                        return { z: 10, y: 90, scale: 0.85, rotate: 3, opacity: 0.5 };
                      default:
                        return { z: 10, y: 90, scale: 0.85, rotate: 0, opacity: 0.5 };
                    }
                  };
                  
                  const transform = getTransform();
                  
                  return (
                    <div
                      key={index}
                      className="absolute w-[90%] max-w-[400px] p-6 rounded-2xl bg-gradient-to-br from-[#0f1d32] to-[#0B1426] border cursor-pointer"
                      style={{
                        zIndex: transform.z,
                        transform: `translateY(${transform.y}px) scale(${transform.scale}) rotate(${transform.rotate}deg)`,
                        opacity: transform.opacity,
                        boxShadow: position === 0 
                          ? `0 25px 50px -12px rgba(0,0,0,0.5), 0 0 60px ${feature.color}30`
                          : `0 15px 30px -10px rgba(0,0,0,0.4)`,
                        borderColor: position === 0 ? `${feature.color}50` : '#1e293b',
                        transition: 'all 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    >
                      {/* Glow on active card */}
                      <div 
                        className="absolute inset-0 rounded-2xl transition-opacity duration-700" 
                        style={{ 
                          background: `radial-gradient(circle at top left, ${feature.color}25, transparent 60%)`,
                          opacity: position === 0 ? 1 : 0.2
                        }} 
                      />
                      
                      <div className="relative z-10">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all duration-500"
                          style={{ 
                            background: `linear-gradient(135deg, ${feature.color}30, ${feature.color}10)`, 
                            border: `1px solid ${feature.color}30`,
                            transform: position === 0 ? 'scale(1.1)' : 'scale(1)'
                          }}
                        >
                          <Icon className="w-6 h-6" style={{ color: feature.color }} />
                        </div>
                        
                        <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                        <p className="text-gray-400 text-sm mb-4">{feature.desc}</p>
                        
                        <div className="flex gap-2">
                          {feature.tags.map((tag, i) => (
                            <span 
                              key={i}
                              className="px-2 py-1 rounded-full text-xs font-medium"
                              style={{ background: `${feature.color}15`, color: feature.color }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Card position indicators */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {featureCards.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveCardIndex(i)}
                    className="w-2 h-2 rounded-full transition-all duration-300"
                    style={{
                      background: i === activeCardIndex ? '#10b981' : '#1e293b',
                      transform: i === activeCardIndex ? 'scale(1.5)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
              
              {/* Floating Elements around cards */}
              <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br from-[#10b981]/20 to-transparent blur-xl animate-pulse" />
              <div className="absolute bottom-20 -left-10 w-32 h-32 rounded-full bg-gradient-to-br from-[#6366f1]/20 to-transparent blur-xl animate-pulse" style={{ animationDelay: '1s' }} />
            </div>
          </div>

          {/* Moving Stock Ticker Bar */}
          <div className="mt-20 py-4 rounded-2xl bg-gradient-to-r from-[#0f1d32] via-[#132440] to-[#0f1d32] border border-[#1e293b] overflow-hidden">
            <div className="flex animate-marquee whitespace-nowrap">
              {[
                { symbol: 'AAPL', price: 189.84, change: 2.34 },
                { symbol: 'GOOGL', price: 141.56, change: -0.89 },
                { symbol: 'MSFT', price: 415.23, change: 1.12 },
                { symbol: 'AMZN', price: 178.92, change: 3.45 },
                { symbol: 'TSLA', price: 248.67, change: -2.18 },
                { symbol: 'NVDA', price: 892.45, change: 5.67 },
                { symbol: 'META', price: 505.12, change: 0.45 },
                { symbol: 'NFLX', price: 628.90, change: -1.23 },
                { symbol: 'AMD', price: 178.34, change: 4.21 },
                { symbol: 'INTC', price: 42.18, change: -0.56 },
                { symbol: 'AAPL', price: 189.84, change: 2.34 },
                { symbol: 'GOOGL', price: 141.56, change: -0.89 },
                { symbol: 'MSFT', price: 415.23, change: 1.12 },
                { symbol: 'AMZN', price: 178.92, change: 3.45 },
                { symbol: 'TSLA', price: 248.67, change: -2.18 },
                { symbol: 'NVDA', price: 892.45, change: 5.67 },
                { symbol: 'META', price: 505.12, change: 0.45 },
                { symbol: 'NFLX', price: 628.90, change: -1.23 },
                { symbol: 'AMD', price: 178.34, change: 4.21 },
                { symbol: 'INTC', price: 42.18, change: -0.56 },
              ].map((stock, i) => (
                <div key={i} className="flex items-center gap-6 mx-8">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">{stock.symbol}</span>
                    <span className="text-gray-400">${stock.price.toFixed(2)}</span>
                    <span className={`text-sm font-medium ${stock.change >= 0 ? 'text-[#10b981]' : 'text-red-500'}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                    </span>
                  </div>
                  <div className="w-px h-4 bg-[#1e293b]" />
                </div>
              ))}
            </div>
          </div>
          
          <style jsx>{`
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .animate-marquee {
              animation: marquee 30s linear infinite;
            }
          `}</style>
        </div>
      </section>

      {/* How It Works - Timeline */}
      <section id="how-it-works" className="py-28 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-[#10b981]/5 rounded-full blur-[150px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#6366f1]/5 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#10b981]/30 bg-[#10b981]/5 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
              <span className="text-sm font-medium text-[#10b981]">Simple Process</span>
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-6 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              How It Works
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">
              Three simple steps to start analyzing stocks like a pro
            </p>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Center Vertical Line */}
            <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[#10b981] via-[#6366f1] to-[#f59e0b] md:-translate-x-1/2" />
            
            {/* Timeline Items */}
            <div className="space-y-10 md:space-y-16">
              
              {/* Step 1 - Left */}
              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-0">
                {/* Card - Left Side */}
                <div className="md:pr-16 pl-12 md:pl-0">
                  <div className="group relative p-6 rounded-2xl bg-gradient-to-br from-[#0f1d32] to-[#0B1426] border border-[#10b981]/30 hover:border-[#10b981]/60 transition-all duration-500 shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:shadow-[0_0_50px_rgba(16,185,129,0.25)]">
                    {/* Glow */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#10b981]/15 to-transparent" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#10b981]/30 to-[#10b981]/10 border border-[#10b981]/30 flex items-center justify-center">
                          <span className="text-2xl font-bold text-[#10b981]">1</span>
                        </div>
                        <h3 className="text-xl font-bold text-white group-hover:text-[#10b981] transition-colors">Create Your Account</h3>
                      </div>
                      <p className="text-gray-400 leading-relaxed">
                        Sign up with email or Google in seconds. Set your market preferences, risk tolerance, and investment goals.
                      </p>
                      <div className="flex gap-2 mt-4">
                        <span className="px-3 py-1 rounded-full bg-[#10b981]/10 text-[#10b981] text-xs font-medium">Quick Setup</span>
                        <span className="px-3 py-1 rounded-full bg-[#10b981]/10 text-[#10b981] text-xs font-medium">Secure</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Empty Right Side */}
                <div className="hidden md:block" />
                {/* Timeline Dot */}
                <div className="absolute left-4 md:left-1/2 top-8 -translate-x-1/2 w-6 h-6 rounded-full bg-[#10b981] border-4 border-[#0a0a12] shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
              </div>

              {/* Step 2 - Right */}
              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-0">
                {/* Empty Left Side */}
                <div className="hidden md:block" />
                {/* Card - Right Side */}
                <div className="md:pl-16 pl-12">
                  <div className="group relative p-6 rounded-2xl bg-gradient-to-br from-[#0f1d32] to-[#0B1426] border border-[#6366f1]/30 hover:border-[#6366f1]/60 transition-all duration-500 shadow-[0_0_30px_rgba(99,102,241,0.15)] hover:shadow-[0_0_50px_rgba(99,102,241,0.25)]">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#6366f1]/15 to-transparent" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#6366f1]/30 to-[#6366f1]/10 border border-[#6366f1]/30 flex items-center justify-center">
                          <span className="text-2xl font-bold text-[#6366f1]">2</span>
                        </div>
                        <h3 className="text-xl font-bold text-white group-hover:text-[#6366f1] transition-colors">Build Your Watchlist</h3>
                      </div>
                      <p className="text-gray-400 leading-relaxed">
                        Search thousands of stocks and add them to your personalized watchlist. Get tailored insights based on your portfolio.
                      </p>
                      <div className="flex gap-2 mt-4">
                        <span className="px-3 py-1 rounded-full bg-[#6366f1]/10 text-[#6366f1] text-xs font-medium">Custom Lists</span>
                        <span className="px-3 py-1 rounded-full bg-[#6366f1]/10 text-[#6366f1] text-xs font-medium">Alerts</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Timeline Dot */}
                <div className="absolute left-4 md:left-1/2 top-8 -translate-x-1/2 w-6 h-6 rounded-full bg-[#6366f1] border-4 border-[#0a0a12] shadow-[0_0_20px_rgba(99,102,241,0.5)]" />
              </div>

              {/* Step 3 - Left */}
              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-0">
                {/* Card - Left Side */}
                <div className="md:pr-16 pl-12 md:pl-0">
                  <div className="group relative p-6 rounded-2xl bg-gradient-to-br from-[#0f1d32] to-[#0B1426] border border-[#f59e0b]/30 hover:border-[#f59e0b]/60 transition-all duration-500 shadow-[0_0_30px_rgba(245,158,11,0.15)] hover:shadow-[0_0_50px_rgba(245,158,11,0.25)]">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#f59e0b]/15 to-transparent" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#f59e0b]/30 to-[#f59e0b]/10 border border-[#f59e0b]/30 flex items-center justify-center">
                          <span className="text-2xl font-bold text-[#f59e0b]">3</span>
                        </div>
                        <h3 className="text-xl font-bold text-white group-hover:text-[#f59e0b] transition-colors">Analyze & Learn</h3>
                      </div>
                      <p className="text-gray-400 leading-relaxed">
                        Explore interactive charts, AI-powered insights, real-time news sentiment, and ML-based price predictions.
                      </p>
                      <div className="flex gap-2 mt-4">
                        <span className="px-3 py-1 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-medium">AI Insights</span>
                        <span className="px-3 py-1 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-medium">Charts</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Empty Right Side */}
                <div className="hidden md:block" />
                {/* Timeline Dot */}
                <div className="absolute left-4 md:left-1/2 top-8 -translate-x-1/2 w-6 h-6 rounded-full bg-[#f59e0b] border-4 border-[#0a0a12] shadow-[0_0_20px_rgba(245,158,11,0.5)]" />
              </div>

              {/* Step 4 - Right */}
              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-0">
                {/* Empty Left Side */}
                <div className="hidden md:block" />
                {/* Card - Right Side */}
                <div className="md:pl-16 pl-12">
                  <div className="group relative p-6 rounded-2xl bg-gradient-to-br from-[#0f1d32] to-[#0B1426] border border-[#22c55e]/30 hover:border-[#22c55e]/60 transition-all duration-500 shadow-[0_0_30px_rgba(34,197,94,0.15)] hover:shadow-[0_0_50px_rgba(34,197,94,0.25)]">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#22c55e]/15 to-transparent" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#22c55e]/30 to-[#22c55e]/10 border border-[#22c55e]/30 flex items-center justify-center">
                          <span className="text-2xl font-bold text-[#22c55e]">4</span>
                        </div>
                        <h3 className="text-xl font-bold text-white group-hover:text-[#22c55e] transition-colors">Make Smarter Decisions</h3>
                      </div>
                      <p className="text-gray-400 leading-relaxed">
                        Use data-driven insights to time your entries and exits. Track performance and refine your strategy over time.
                      </p>
                      <div className="flex gap-2 mt-4">
                        <span className="px-3 py-1 rounded-full bg-[#22c55e]/10 text-[#22c55e] text-xs font-medium">Performance</span>
                        <span className="px-3 py-1 rounded-full bg-[#22c55e]/10 text-[#22c55e] text-xs font-medium">Strategy</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Timeline Dot */}
                <div className="absolute left-4 md:left-1/2 top-8 -translate-x-1/2 w-6 h-6 rounded-full bg-[#22c55e] border-4 border-[#0a0a12] shadow-[0_0_20px_rgba(34,197,94,0.5)]" />
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#10b981]/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#6366f1]/5 rounded-full blur-[120px]" />
        </div>
        
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-sm font-medium mb-6">
              <TrendingUp className="w-4 h-4" />
              Simple Pricing
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold mb-4 text-white">
              Choose Your <span className="text-[#10b981]">Plan</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">
              Start free and upgrade as you grow. No hidden fees, cancel anytime.
            </p>
          </div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#0f1d32] border border-[#2a2a3a]">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  billingPeriod === 'monthly' 
                    ? 'bg-[#10b981] text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                  billingPeriod === 'yearly' 
                    ? 'bg-[#10b981] text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Yearly
                <span className="px-2 py-0.5 rounded-full bg-[#f59e0b]/20 text-[#f59e0b] text-xs font-semibold">
                  -20%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            
            {/* Free Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="group relative p-6 lg:p-8 rounded-2xl bg-gradient-to-br from-[#0f1d32] to-[#0B1426] border border-[#2a2a3a] hover:border-[#10b981]/30 transition-all duration-500"
            >
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">Free</h3>
                <p className="text-gray-400 text-sm">Perfect for getting started</p>
              </div>
              
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">$0</span>
                  <span className="text-gray-500">/month</span>
                </div>
              </div>
              
              <ul className="space-y-3 mb-8">
                {['5 stocks in watchlist', 'Basic chart analysis', 'Daily market summary', 'Email support'].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                    <div className="w-5 h-5 rounded-full bg-[#10b981]/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-[#10b981]" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>
              
              <Link href="/signup" className="block">
                <Button className="w-full bg-[#1e293b] hover:bg-[#2a2a3a] text-white border border-[#2a2a3a] hover:border-[#10b981]/50 transition-all duration-300">
                  Get Started
                </Button>
              </Link>
            </motion.div>

            {/* Pro Plan - Featured */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="group relative p-6 lg:p-8 rounded-2xl bg-gradient-to-br from-[#0f1d32] to-[#0B1426] border-2 border-[#10b981]/50 shadow-[0_0_40px_rgba(16,185,129,0.15)] transition-all duration-500 hover:shadow-[0_0_60px_rgba(16,185,129,0.25)]"
            >
              {/* Popular Badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1 rounded-full bg-[#10b981] text-white text-xs font-semibold shadow-[0_0_20px_rgba(16,185,129,0.5)]">
                  Most Popular
                </span>
              </div>
              
              {/* Glow Effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#10b981]/10 to-transparent" />
              
              <div className="relative z-10">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">Pro</h3>
                  <p className="text-gray-400 text-sm">For serious traders</p>
                </div>
                
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">$</span>
                    <NumberFlow
                      value={billingPeriod === 'monthly' ? 19 : 15}
                      className="text-4xl font-bold text-white"
                      transformTiming={{ duration: 500, easing: 'ease-out' }}
                    />
                    <span className="text-gray-500">/month</span>
                  </div>
                  <AnimatePresence mode="wait">
                    {billingPeriod === 'yearly' && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-[#10b981] text-sm mt-1"
                      >
                        Billed $180/year (save $48)
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                
                <ul className="space-y-3 mb-8">
                  {[
                    'Unlimited watchlist stocks',
                    'AI-powered insights',
                    '50+ technical indicators',
                    'Real-time price alerts',
                    'News sentiment analysis',
                    'Priority support'
                  ].map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                      <div className="w-5 h-5 rounded-full bg-[#10b981]/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-[#10b981]" />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <Link href="/signup" className="block">
                  <Button className="w-full bg-[#10b981] hover:bg-[#10b981]/90 text-white shadow-[0_0_25px_rgba(16,185,129,0.3)] hover:shadow-[0_0_35px_rgba(16,185,129,0.5)] transition-all duration-300">
                    Start Pro Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </motion.div>

            {/* Enterprise Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="group relative p-6 lg:p-8 rounded-2xl bg-gradient-to-br from-[#0f1d32] to-[#0B1426] border border-[#2a2a3a] hover:border-[#6366f1]/30 transition-all duration-500"
            >
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">Enterprise</h3>
                <p className="text-gray-400 text-sm">For teams & institutions</p>
              </div>
              
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">Custom</span>
                </div>
                <p className="text-gray-500 text-sm mt-1">Tailored to your needs</p>
              </div>
              
              <ul className="space-y-3 mb-8">
                {[
                  'Everything in Pro',
                  'API access',
                  'Custom integrations',
                  'Team collaboration',
                  'Advanced analytics',
                  'Dedicated account manager'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                    <div className="w-5 h-5 rounded-full bg-[#6366f1]/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-[#6366f1]" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>
              
              <Link href="/signup" className="block">
                <Button className="w-full bg-[#1e293b] hover:bg-[#2a2a3a] text-white border border-[#6366f1]/30 hover:border-[#6366f1]/60 transition-all duration-300">
                  Contact Sales
                </Button>
              </Link>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-16 pb-10 px-4 sm:px-6 lg:px-8 border-t border-[#1e293b]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
            {/* Brand */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-[#10b981] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-semibold text-white">Stonks</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                AI-powered market intelligence for modern investors. Track trends, uncover signals, and make confident decisions with real-time insights.
              </p>
              <div className="space-y-2 text-sm text-gray-400">
                <p>HQ: 245 Market Ave, San Francisco, CA</p>
                <p>Support: support@stonks.ai</p>
                <p>Phone: (415) 555-0199</p>
              </div>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><Link href="/#features" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Login</Link></li>
                <li><Link href="/signup" className="hover:text-white transition-colors">Get Started</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
                <li><Link href="/careers" className="hover:text-white transition-colors">Careers</Link></li>
                <li><Link href="/press" className="hover:text-white transition-colors">Press</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/security" className="hover:text-white transition-colors">Security</Link></li>
                <li><Link href="/compliance" className="hover:text-white transition-colors">Compliance</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-[#1e293b] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-500">© 2026 Stonks, Inc. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>FINRA #STK-4821</span>
              <span>SEC Registered</span>
              <span>SOC 2 Type II</span>
            </div>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
