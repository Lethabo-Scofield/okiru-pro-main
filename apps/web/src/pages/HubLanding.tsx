import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@toolkit/lib/auth';
import { useToast } from '@/hooks/use-toast';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  LogOut, HelpCircle, ChevronRight, Search, Sparkles, X,
  BarChart3, Award, Leaf, Users, BookOpen, Briefcase
} from 'lucide-react';
import { useOnboarding, OnboardingWelcome, OnboardingTour } from '@/components/OnboardingTour';

export default function HubLanding() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { needsOnboarding, showTour, startTour, completeTour, dismissTour } = useOnboarding(user?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const handleComingSoon = () => {
    toast({
      title: "Coming Soon",
      description: "This toolkit is currently in development.",
    });
  };

  const toolkits = [
    {
      id: 'bbbee-scorecard',
      title: 'B-BBEE Scorecard Calculator',
      description: 'Calculate your B-BBEE points across all five elements — Ownership, Management Control, Skills Development, Enterprise Development, and Socio-Economic Development.',
      tag: 'B-BBEE',
      aiBadge: 'AI-Scored',
      icon: <BarChart3 className="w-6 h-6" />,
      link: '/dashboard',
      color: 'purple',
      features: ['Automatic level determination', 'Scenario modelling & what-if analysis', 'Compliant with DTI Codes of Good Practice'],
    },
    {
      id: 'bbbee-cert',
      title: 'B-BBEE Certificate Hub',
      description: 'Centralised intelligence hub for managing, verifying and tracking B-BBEE compliance certificates across your entire supplier and partner ecosystem.',
      tag: 'B-BBEE',
      aiBadge: 'AI-Verified',
      icon: <Award className="w-6 h-6" />,
      action: handleComingSoon,
      color: 'emerald',
      features: ['AI-powered certificate extraction', 'Expiry alerts & renewal tracking', 'Supplier procurement spend analytics'],
    },
    {
      id: 'esg',
      title: 'ESG Toolkit',
      description: 'Measure, manage and report on Environmental, Social and Governance performance. Align with global ESG frameworks and South African sustainability requirements.',
      tag: 'ESG',
      aiBadge: 'AI-Insights',
      icon: <Leaf className="w-6 h-6" />,
      action: handleComingSoon,
      color: 'blue',
      features: ['Carbon footprint & emissions tracking', 'GRI, TCFD & SASB framework alignment', 'Stakeholder reporting dashboards'],
    },
    {
      id: 'employment-equity',
      title: 'Employment Equity Toolkit',
      description: 'Streamline your Employment Equity Act compliance. Plan, track and report on workforce transformation goals with AI-driven demographic analysis.',
      tag: 'HR & PEOPLE',
      aiBadge: 'AI-Analytics',
      icon: <Users className="w-6 h-6" />,
      action: handleComingSoon,
      color: 'pink',
      features: ['EEA2 & EEA4 report generation', 'Workforce demographic profiling', 'Five-year equity plan management'],
    },
    {
      id: 'wsp-atr',
      title: 'WSP/ATR Reporting Toolkit',
      description: 'Simplify your annual Workplace Skills Plan and Annual Training Report submissions to SETAs. Automate data collection, gap analysis, and compliant report generation.',
      tag: 'HR & PEOPLE',
      aiBadge: 'AI-Assisted',
      icon: <BookOpen className="w-6 h-6" />,
      action: handleComingSoon,
      color: 'amber',
      features: ['SETA-ready WSP & ATR templates', 'Training needs analysis & gap mapping', 'Levy grant optimisation insights'],
    },
    {
      id: 'financial-audit',
      title: 'Financial Audit Toolkit',
      description: 'Comprehensive financial audit preparation and management. Organise audit evidence, track findings, manage remediation actions, and ensure regulatory financial compliance.',
      tag: 'FINANCE',
      aiBadge: 'AI-Reviewed',
      icon: <Briefcase className="w-6 h-6" />,
      action: handleComingSoon,
      color: 'orange',
      features: ['Audit evidence repository', 'Finding & remediation tracker', 'Risk-based audit planning tools'],
    },
  ];

  const colorMap: Record<string, { icon: string; tag: string; tagBg: string; tagBorder: string; dot: string; glow: string; gradient: string; cardBorder: string; feature: string }> = {
    purple:  { icon: 'text-purple-400',  tag: 'text-purple-400',  tagBg: 'bg-purple-500/10',  tagBorder: 'border-purple-500/30', dot: 'bg-purple-400',  glow: 'hover:shadow-purple-500/10',  gradient: 'from-purple-500/20 to-indigo-500/5',  cardBorder: 'border-purple-500/20 hover:border-purple-500/40', feature: 'bg-purple-400' },
    emerald: { icon: 'text-emerald-400', tag: 'text-emerald-400', tagBg: 'bg-emerald-500/10', tagBorder: 'border-emerald-500/30', dot: 'bg-emerald-400', glow: 'hover:shadow-emerald-500/10', gradient: 'from-emerald-500/20 to-teal-500/5',    cardBorder: 'border-[#2c2c2e]', feature: 'bg-emerald-400' },
    blue:    { icon: 'text-blue-400',    tag: 'text-blue-400',    tagBg: 'bg-blue-500/10',    tagBorder: 'border-blue-500/30',    dot: 'bg-blue-400',    glow: 'hover:shadow-blue-500/10',    gradient: 'from-blue-500/20 to-cyan-500/5',      cardBorder: 'border-[#2c2c2e]', feature: 'bg-blue-400' },
    pink:    { icon: 'text-pink-400',    tag: 'text-pink-400',    tagBg: 'bg-pink-500/10',    tagBorder: 'border-pink-500/30',    dot: 'bg-pink-400',    glow: 'hover:shadow-pink-500/10',    gradient: 'from-pink-500/20 to-rose-500/5',      cardBorder: 'border-[#2c2c2e]', feature: 'bg-pink-400' },
    amber:   { icon: 'text-amber-400',   tag: 'text-amber-400',   tagBg: 'bg-amber-500/10',   tagBorder: 'border-amber-500/30',   dot: 'bg-amber-400',   glow: 'hover:shadow-amber-500/10',   gradient: 'from-amber-500/20 to-orange-500/5',   cardBorder: 'border-[#2c2c2e]', feature: 'bg-amber-400' },
    orange:  { icon: 'text-orange-400',  tag: 'text-orange-400',  tagBg: 'bg-orange-500/10',  tagBorder: 'border-orange-500/30',  dot: 'bg-orange-400',  glow: 'hover:shadow-orange-500/10',  gradient: 'from-orange-500/20 to-red-500/5',     cardBorder: 'border-[#2c2c2e]', feature: 'bg-orange-400' },
  };

  const filteredToolkits = searchQuery.trim()
    ? toolkits.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase()) || t.tag.toLowerCase().includes(searchQuery.toLowerCase()))
    : toolkits;

  return (
    <div className="font-sans min-h-screen bg-black" style={{ letterSpacing: '-0.011em', color: '#f5f5f7' }}>
      
      {needsOnboarding && !showTour && (
        <OnboardingWelcome onStart={startTour} onSkip={completeTour} userName={user?.fullName} />
      )}
      {showTour && <OnboardingTour onComplete={completeTour} onDismiss={dismissTour} />}

      {/* ── HEADER ── */}
      <header className="h-14 shrink-0 z-20 bg-black sticky top-0" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="max-w-[1400px] mx-auto w-full px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
            <span className="text-lg font-semibold tracking-tight text-white border-l border-[#2c2c2e] pl-3">Okiru Hub</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Search icon toggle */}
            <button
              onClick={() => setSearchOpen(prev => !prev)}
              className="p-2 rounded-full bg-[#1c1c1e] hover:bg-[#3a3a3c] smooth press-sm text-[#8e8e93] hover:text-white"
              title="Search toolkits"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={startTour}
              className="p-2 rounded-full bg-[#1c1c1e] hover:bg-[#3a3a3c] smooth press-sm text-[#8e8e93] hover:text-purple-400"
              title="Take a tour"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c1c1e] text-[12px]">
              <span className="inline-flex h-5 w-5 rounded-full bg-purple-600 items-center justify-center text-white font-semibold text-[9px]">
                {(user?.fullName || user?.username || 'U').charAt(0).toUpperCase()}
              </span>
              <span className="text-[#d1d1d6] font-medium">{user?.fullName || user?.username || ''}</span>
            </div>
            <button
              onClick={async () => { await logout(); navigate('/auth'); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-[#3a3a3c] text-[12px] smooth press-sm text-[#8e8e93] hover:text-[#d1d1d6]"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Search bar overlay */}
      {searchOpen && (
        <div className="max-w-[1400px] mx-auto w-full px-6 py-3 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#636366]" />
            <input
              type="text"
              placeholder="Search toolkits..."
              autoFocus
              className="w-full rounded-2xl bg-[#1c1c1e] border border-[#2c2c2e] hover:border-[#3a3a3c] pl-11 pr-10 py-3 text-[14px] text-white outline-none focus:ring-2 focus:ring-purple-500/30 smooth placeholder:text-[#636366]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#636366] hover:text-white smooth">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-12">
        {/* ── HERO ── */}
        <section className="text-center max-w-2xl mx-auto mb-12 fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400 text-[11px] font-semibold tracking-wider uppercase mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
            AI-Powered · South Africa Compliance Suite
          </div>
          <h1 className="text-[36px] leading-[1.1] sm:text-[44px] font-bold tracking-tight text-white mb-4">
            Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-emerald-400 to-blue-400">Intelligent</span><br />Compliance Command Centre
          </h1>
          <p className="text-[15px] text-[#98989f] leading-relaxed max-w-xl mx-auto mb-8 font-light">
            Six integrated toolkits to simplify B-BBEE compliance, ESG reporting, employment equity, and financial auditing — all powered by AI.
          </p>

          {/* Stats row */}
          <div className="flex justify-center gap-0 rounded-2xl bg-[#1c1c1e] border border-[#2c2c2e] overflow-hidden max-w-lg mx-auto mb-8">
            {[
              { value: '6', label: 'Toolkits', color: 'text-purple-400' },
              { value: 'AI', label: 'Enabled', color: 'text-emerald-400' },
              { value: 'Live', label: 'Data Sync', color: 'text-blue-400' },
              { value: '100%', label: 'SA Aligned', color: 'text-amber-400' },
            ].map((stat, i) => (
              <div key={i} className="flex-1 py-4 px-3 text-center border-r border-[#2c2c2e] last:border-r-0 hover:bg-white/[0.03] smooth">
                <div className={`text-[22px] font-bold ${stat.color} tracking-tight`}>{stat.value}</div>
                <div className="text-[10px] text-[#636366] uppercase tracking-widest font-semibold mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── AI ASSISTANT PANEL ── */}
        <section className="max-w-4xl mx-auto mb-12 fade-in stagger-1">
          <div className="rounded-2xl bg-[#1c1c1e] border border-emerald-500/20 p-6 flex flex-col sm:flex-row items-center gap-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.04] to-transparent pointer-events-none"></div>
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-purple-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 relative z-10">
              <Sparkles className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1 relative z-10 text-center sm:text-left">
              <div className="text-[15px] font-semibold text-white tracking-tight">AI Compliance Assistant</div>
              <div className="text-[13px] text-[#8e8e93] mt-1">Ask anything about your compliance status, upcoming deadlines, or regulatory changes.</div>
            </div>
            <div className="flex items-center gap-2 relative z-10 w-full sm:w-auto">
              <input
                type="text"
                placeholder="e.g. What's my B-BBEE scorecard status?"
                className="flex-1 sm:w-[260px] rounded-full bg-white/[0.06] border border-emerald-500/20 px-4 py-2.5 text-[13px] text-white outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-[#636366] smooth"
                onKeyDown={(e) => { if (e.key === 'Enter') handleComingSoon(); }}
              />
              <button
                onClick={handleComingSoon}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-[13px] font-bold text-emerald-950 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 smooth press-sm hover:-translate-y-0.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Ask AI
              </button>
            </div>
          </div>
        </section>

        {/* ── TOOLKITS SECTION ── */}
        <section className="fade-in stagger-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[13px] font-semibold text-[#98989f] uppercase tracking-wider">
              All Toolkits — <span className="text-purple-400">{filteredToolkits.length} modules</span>
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredToolkits.map((toolkit, idx) => {
              const c = colorMap[toolkit.color];
              const isActive = !!toolkit.link;

              const innerContent = (
                <>
                  {/* Hover gradient */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${c.gradient} opacity-0 ${isActive ? 'group-hover:opacity-100' : ''} transition-opacity duration-300`}></div>
                  {/* Top shimmer line */}
                  <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent ${isActive ? `via-${toolkit.color}-400` : 'via-[#3a3a3c]'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>

                  <div className="relative z-10 flex flex-col h-full">
                    {/* Icon + tag row */}
                    <div className="flex items-start justify-between mb-5">
                      <div className={`w-12 h-12 rounded-2xl ${isActive ? 'bg-black/40 border-white/[0.08] shadow-inner' : 'bg-[#141414] border-[#2c2c2e]'} border flex items-center justify-center shrink-0 group-hover:scale-105 smooth ${c.icon}`}>
                        {toolkit.icon}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border tracking-widest ${isActive ? `${c.tag} ${c.tagBorder} ${c.tagBg}` : 'text-[#636366] border-[#2c2c2e] bg-transparent'}`}>
                          {toolkit.tag}
                        </span>
                      </div>
                    </div>

                    {/* AI badge */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className={`w-3 h-3 ${isActive ? 'text-emerald-400' : 'text-[#636366]'}`} />
                      <span className={`text-[10px] font-medium tracking-wide ${isActive ? 'text-emerald-400' : 'text-[#636366]'}`}>{toolkit.aiBadge}</span>
                    </div>
                    
                    {/* Title + desc */}
                    <h3 className={`text-[18px] font-bold mb-2 tracking-tight ${isActive ? 'text-white' : 'text-[#8e8e93]'}`}>
                      {toolkit.title}
                    </h3>
                    <p className={`text-[13px] leading-relaxed font-light flex-1 mb-5 ${isActive ? 'text-[#8e8e93]' : 'text-[#636366]'}`}>
                      {toolkit.description}
                    </p>

                    {/* Features */}
                    <div className="space-y-1.5 mb-5">
                      {toolkit.features.map((feature, fi) => (
                        <div key={fi} className="flex items-center gap-2 text-[11px]">
                          <span className={`w-1 h-1 rounded-full shrink-0 ${isActive ? c.feature : 'bg-[#48484a]'}`}></span>
                          <span className={isActive ? 'text-[#98989f]' : 'text-[#636366]'}>{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="pt-4 border-t border-[#2c2c2e] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isActive ? (
                          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/40"></span> Coming Soon
                          </span>
                        )}
                      </div>
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors duration-300 ${isActive ? `border-purple-500/30 text-purple-400 group-hover:bg-purple-500/10` : 'border-[#2c2c2e] text-[#48484a] group-hover:border-[#3a3a3c]'}`}>
                        {isActive ? <ChevronRight className="w-4 h-4" /> : (
                          <div className="w-2.5 h-2.5 rounded-[3px] border-2 border-[#48484a] border-t-0 relative" style={{ borderTop: '2px solid transparent' }}>
                            <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[7px] border-2 border-[#48484a] border-b-0" style={{ borderTopLeftRadius: '10px', borderTopRightRadius: '10px' }}></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              );

              if (isActive) {
                return (
                  <Link
                    key={toolkit.id}
                    href={toolkit.link!}
                    className={`relative block rounded-3xl bg-[#1c1c1e] p-6 cursor-pointer overflow-hidden transition-all duration-300 border ${c.cardBorder} hover:-translate-y-1 hover:shadow-2xl ${c.glow} fade-in stagger-${Math.min(idx + 1, 6)} group`}
                  >
                    {innerContent}
                  </Link>
                );
              }
              return (
                <div
                  key={toolkit.id}
                  onClick={toolkit.action}
                  className={`relative block rounded-3xl bg-[#141414] p-6 cursor-not-allowed overflow-hidden transition-all duration-300 border border-[#2c2c2e] hover:border-[#3a3a3c] opacity-75 fade-in stagger-${Math.min(idx + 1, 6)} group`}
                >
                  {innerContent}
                </div>
              );
            })}
            
            {filteredToolkits.length === 0 && (
              <div className="col-span-full rounded-3xl bg-[#1c1c1e] p-12 text-center border border-[#2c2c2e]">
                <Search className="w-8 h-8 text-[#3a3a3c] mx-auto mb-3" />
                <p className="text-[14px] text-[#8e8e93]">No toolkits found matching your search.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
