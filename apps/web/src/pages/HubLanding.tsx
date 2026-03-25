import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@toolkit/lib/auth';
import { useToast } from '@/hooks/use-toast';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  LogOut, HelpCircle, ChevronRight, Search, Sparkles, X,
  BarChart3, Award, Leaf, Users, BookOpen, Briefcase, ShieldCheck, Lock
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
      icon: <BarChart3 className="w-5 h-5" />,
      link: '/dashboard',
      features: ['Automatic level determination', 'Scenario modelling & what-if analysis', 'Compliant with DTI Codes of Good Practice'],
    },
    {
      id: 'bbbee-cert',
      title: 'B-BBEE Certificate Hub',
      description: 'Centralised intelligence hub for managing, verifying and tracking B-BBEE compliance certificates across your entire supplier and partner ecosystem.',
      tag: 'B-BBEE',
      aiBadge: 'AI-Verified',
      icon: <Award className="w-5 h-5" />,
      action: handleComingSoon,
      features: ['AI-powered certificate extraction', 'Expiry alerts & renewal tracking', 'Supplier procurement spend analytics'],
    },
    {
      id: 'esg',
      title: 'ESG Toolkit',
      description: 'Measure, manage and report on Environmental, Social and Governance performance. Align with global ESG frameworks and South African sustainability requirements.',
      tag: 'ESG',
      aiBadge: 'AI-Insights',
      icon: <Leaf className="w-5 h-5" />,
      action: handleComingSoon,
      features: ['Carbon footprint & emissions tracking', 'GRI, TCFD & SASB framework alignment', 'Stakeholder reporting dashboards'],
    },
    {
      id: 'employment-equity',
      title: 'Employment Equity Toolkit',
      description: 'Streamline your Employment Equity Act compliance. Plan, track and report on workforce transformation goals with AI-driven demographic analysis.',
      tag: 'HR & PEOPLE',
      aiBadge: 'AI-Analytics',
      icon: <Users className="w-5 h-5" />,
      action: handleComingSoon,
      features: ['EEA2 & EEA4 report generation', 'Workforce demographic profiling', 'Five-year equity plan management'],
    },
    {
      id: 'wsp-atr',
      title: 'WSP/ATR Reporting Toolkit',
      description: 'Simplify your annual Workplace Skills Plan and Annual Training Report submissions to SETAs. Automate data collection, gap analysis, and compliant report generation.',
      tag: 'HR & PEOPLE',
      aiBadge: 'AI-Assisted',
      icon: <BookOpen className="w-5 h-5" />,
      action: handleComingSoon,
      features: ['SETA-ready WSP & ATR templates', 'Training needs analysis & gap mapping', 'Levy grant optimisation insights'],
    },
    {
      id: 'financial-audit',
      title: 'Financial Audit Toolkit',
      description: 'Comprehensive financial audit preparation and management. Organise audit evidence, track findings, manage remediation actions, and ensure regulatory financial compliance.',
      tag: 'FINANCE',
      aiBadge: 'AI-Reviewed',
      icon: <Briefcase className="w-5 h-5" />,
      action: handleComingSoon,
      features: ['Audit evidence repository', 'Finding & remediation tracker', 'Risk-based audit planning tools'],
    },
  ];

  const filteredToolkits = searchQuery.trim()
    ? toolkits.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase()) || t.tag.toLowerCase().includes(searchQuery.toLowerCase()))
    : toolkits;

  return (
    <div className="font-sans min-h-screen bg-black" style={{ letterSpacing: '-0.011em', color: '#f5f5f7' }}>
      
      {needsOnboarding && !showTour && (
        <OnboardingWelcome onStart={startTour} onSkip={completeTour} userName={user?.fullName} />
      )}
      {showTour && <OnboardingTour onComplete={completeTour} onDismiss={dismissTour} />}

      <header className="h-14 shrink-0 z-20 bg-black sticky top-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="max-w-[1400px] mx-auto w-full px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
            <span className="text-lg font-semibold tracking-tight text-white border-l border-white/[0.07] pl-3">Okiru Hub</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(prev => !prev)}
              className="p-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] smooth press-sm text-[#8e8e93] hover:text-white"
              title="Search toolkits"
              data-testid="btn-search-toolkits"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={startTour}
              className="p-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] smooth press-sm text-[#8e8e93] hover:text-white"
              title="Take a tour"
              data-testid="btn-tour"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            {user?.role === 'admin' && (
              <button
                onClick={() => navigate('/admin/users')}
                className="p-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] smooth press-sm text-[#8e8e93] hover:text-green-400"
                title="User Management"
                data-testid="btn-admin-users"
              >
                <ShieldCheck className="h-4 w-4" />
              </button>
            )}
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] text-[12px]">
              <span className="inline-flex h-5 w-5 rounded-full bg-white/[0.10] items-center justify-center text-white font-semibold text-[9px]">
                {(user?.fullName || user?.username || 'U').charAt(0).toUpperCase()}
              </span>
              <span className="text-[#d1d1d6] font-medium">{user?.fullName || user?.username || ''}</span>
            </div>
            <button
              onClick={async () => { await logout(); navigate('/auth'); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[12px] smooth press-sm text-[#8e8e93] hover:text-[#d1d1d6]"
              data-testid="btn-sign-out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="max-w-[1400px] mx-auto w-full px-6 py-3 bg-black" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#48484a]" />
            <input
              type="text"
              placeholder="Search toolkits..."
              autoFocus
              className="w-full rounded-2xl bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.12] pl-11 pr-10 py-3 text-[14px] text-white outline-none focus:ring-2 focus:ring-white/[0.10] smooth placeholder:text-[#48484a]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-toolkits"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#636366] hover:text-white smooth" data-testid="btn-clear-search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16">
        <section className="text-center max-w-2xl mx-auto mb-16 fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[#8e8e93] text-[11px] font-semibold tracking-wider uppercase mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse"></span>
            Compliance Suite · South Africa
          </div>
          <h1 className="text-[38px] leading-[1.08] sm:text-[48px] font-bold tracking-tight text-white mb-4" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Your compliance<br />command centre.
          </h1>
          <p className="text-[15px] text-[#636366] leading-relaxed max-w-md mx-auto font-light">
            Six integrated toolkits to simplify B-BBEE compliance, ESG reporting, employment equity, and financial auditing.
          </p>
        </section>

        <section className="max-w-5xl mx-auto fade-in stagger-1">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[12px] font-semibold text-[#48484a] uppercase tracking-widest">
              Toolkits · <span className="text-[#8e8e93]">{filteredToolkits.length}</span>
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredToolkits.map((toolkit, idx) => {
              const isActive = !!toolkit.link;

              const innerContent = (
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400' : 'bg-white/[0.02] border border-white/[0.04] text-[#48484a]'}`}>
                      {toolkit.icon}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-widest ${isActive ? 'text-[#8e8e93] border border-white/[0.08] bg-white/[0.03]' : 'text-[#3a3a3c] border border-white/[0.04]'}`}>
                        {toolkit.tag}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className={`w-3 h-3 ${isActive ? 'text-emerald-400/70' : 'text-[#2c2c2e]'}`} />
                    <span className={`text-[10px] font-medium tracking-wide ${isActive ? 'text-emerald-400/70' : 'text-[#2c2c2e]'}`}>{toolkit.aiBadge}</span>
                  </div>
                  
                  <h3 className={`text-[16px] font-semibold mb-2 tracking-tight leading-snug ${isActive ? 'text-indigo-300' : 'text-[#48484a]'}`}>
                    {toolkit.title}
                  </h3>
                  <p className={`text-[12px] leading-relaxed font-light flex-1 mb-4 ${isActive ? 'text-[#8e8e93]' : 'text-[#3a3a3c]'}`}>
                    {toolkit.description}
                  </p>

                  <div className="space-y-1.5 mb-4">
                    {toolkit.features.map((feature, fi) => (
                      <div key={fi} className="flex items-center gap-2 text-[11px]">
                        <span className={`w-1 h-1 rounded-full shrink-0 ${isActive ? 'bg-[#636366]' : 'bg-[#2c2c2e]'}`}></span>
                        <span className={isActive ? 'text-[#636366]' : 'text-[#3a3a3c]'}>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <div className={`pt-3 border-t flex items-center justify-between ${isActive ? 'border-white/[0.06]' : 'border-white/[0.03]'}`}>
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400/80" data-testid={`status-active-${toolkit.id}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80"></span> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#3a3a3c]" data-testid={`status-coming-${toolkit.id}`}>
                          <Lock className="w-3 h-3" /> Coming Soon
                        </span>
                      )}
                    </div>
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center ${isActive ? 'border-white/[0.10] text-[#8e8e93] group-hover:bg-white/[0.06] group-hover:text-white' : 'border-white/[0.04] text-[#2c2c2e]'} smooth`}>
                      {isActive ? <ChevronRight className="w-3.5 h-3.5" /> : <Lock className="w-3 h-3" />}
                    </div>
                  </div>
                </div>
              );

              if (isActive) {
                return (
                  <Link
                    key={toolkit.id}
                    href={toolkit.link!}
                    className={`relative block rounded-2xl bg-white/[0.03] p-5 cursor-pointer overflow-hidden transition-all duration-300 border border-indigo-500/15 hover:border-indigo-500/30 hover:-translate-y-0.5 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-indigo-500/5 fade-in stagger-${Math.min(idx + 1, 6)} group`}
                    data-testid={`card-toolkit-${toolkit.id}`}
                  >
                    {innerContent}
                  </Link>
                );
              }
              return (
                <div
                  key={toolkit.id}
                  onClick={toolkit.action}
                  className={`relative block rounded-2xl bg-white/[0.015] p-5 cursor-not-allowed overflow-hidden border border-white/[0.03] opacity-50 fade-in stagger-${Math.min(idx + 1, 6)} group`}
                  data-testid={`card-toolkit-${toolkit.id}`}
                >
                  {innerContent}
                </div>
              );
            })}
            
            {filteredToolkits.length === 0 && (
              <div className="col-span-full rounded-2xl bg-white/[0.03] p-12 text-center border border-white/[0.06]">
                <Search className="w-8 h-8 text-[#2c2c2e] mx-auto mb-3" />
                <p className="text-[14px] text-[#636366]" data-testid="text-no-results">No toolkits found matching your search.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
