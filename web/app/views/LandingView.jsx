"use client";
import { Logo } from "../BrandLogo";
import { ShieldIcon, GlobeIcon, MailIcon, LockIcon, ArrowRightIcon, CheckIcon } from "../Icons";

function LandingPage({ authenticated, onNavigate, }) {
    return (<main className="min-h-screen bg-gradient-to-b from-[#04142F] via-[#071E4A] to-[#04142F] text-slate-100 flex flex-col selection:bg-[#087EFF] selection:text-white">
      {/* Header */}
      <header className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 h-20 flex items-center justify-between z-10 border-b border-slate-800/60">
        <Logo light/>
        <nav className="hidden md:flex items-center gap-8 text-xs sm:text-sm font-semibold text-slate-300" aria-label="Landing page navigation">
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#coverage" className="hover:text-white transition-colors">What it checks</a>
          <a href="#privacy" className="hover:text-white transition-colors">Privacy</a>
        </nav>
        <div className="flex items-center gap-3">
          {!authenticated && (<button className="text-xs sm:text-sm font-semibold text-slate-200 hover:text-white px-3 py-2 transition-colors" onClick={() => onNavigate("/login")}>
              Sign in
            </button>)}
          <button className="text-xs sm:text-sm font-semibold bg-[#087EFF] hover:bg-[#1495FF] text-white px-4 sm:px-5 py-2.5 rounded-xl transition-all shadow-md shadow-[#087EFF]/25 active:scale-95" onClick={() => onNavigate(authenticated ? "/dashboard" : "/register")}>
            {authenticated ? "Open dashboard" : "Create account"}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 pt-16 pb-24 grid lg:grid-cols-12 gap-12 items-center" aria-labelledby="landing-title">
        <div className="lg:col-span-7 flex flex-col">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/20 text-[#1495FF] text-xs font-semibold tracking-wider uppercase mb-6 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-[#087EFF] animate-pulse"/>
            LOCAL DETECTION · PRIVACY-MINIMIZED INSIGHTS
          </div>
          <h1 id="landing-title" className="text-4xl sm:text-5xl lg:text-5xl xl:text-6xl font-extrabold text-white tracking-tight leading-[1.08] mb-6">
            Clear warnings.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1495FF] to-[#68C4FF]">
              Private by design.
            </span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg lg:text-xl leading-relaxed max-w-xl mb-8">
            BantAI checks websites and supported emails with local AI, adds contextual cloud review when needed,
            and gives you a clear result without claiming certainty.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button className="flex items-center gap-2 bg-[#087EFF] hover:bg-[#1495FF] text-white text-sm font-semibold px-6 py-3.5 rounded-xl transition-all shadow-lg shadow-[#087EFF]/30 active:scale-95" onClick={() => onNavigate(authenticated ? "/dashboard" : "/register")}>
              <span>{authenticated ? "Go to your dashboard" : "Get started with BantAI"}</span>
              <ArrowRightIcon className="w-4 h-4"/>
            </button>
            {!authenticated && (<button className="text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-sm font-semibold px-5 py-3.5 rounded-xl transition-colors" onClick={() => onNavigate("/login")}>
                I already have an account
              </button>)}
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-400 mt-6">
            <LockIcon className="w-3.5 h-3.5 text-[#087EFF]"/>
            Complete URLs and email content stay inside the local detector boundary
          </p>
        </div>

        {/* Hero Browser Mockup */}
        <div className="lg:col-span-5 relative" aria-label="Example BantAI website assessment">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#087EFF] to-[#1495FF] rounded-2xl blur-xl opacity-30 animate-pulse"/>
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/80 shadow-2xl">
            <div className="h-12 bg-slate-950 border-b border-slate-800 px-4 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80"/>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80"/>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"/>
              </div>
              <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-400 font-mono truncate">
                <GlobeIcon className="w-3.5 h-3.5 text-[#087EFF] shrink-0"/>
                <span>secure-example.ph</span>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live-dot"/>
                Local models ready
              </span>
            </div>
            <div className="p-6 bg-slate-900/90 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#087EFF]/20 border border-[#087EFF]/30 flex items-center justify-center text-[#1495FF]">
                    <ShieldIcon className="w-5 h-5"/>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 tracking-wider uppercase">WEBSITE CHECK</span>
                    <strong className="text-xs font-semibold text-white">Address-bar analysis</strong>
                  </div>
                </div>
                <span className="text-xs font-bold text-amber-300 bg-amber-950/70 border border-amber-700/60 px-2.5 py-1 rounded-full uppercase tracking-wide">
                  Needs caution
                </span>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30">
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block mb-1">CURRENT WEBSITE</span>
                <h2 className="text-base font-bold text-white mb-2">secure-example.ph</h2>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  The address shows patterns worth checking before you enter passwords, codes, or payment details.
                </p>
                <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Local URL model</span>
                    <strong className="text-amber-300">Warning detected</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Contextual review</span>
                    <strong className="text-amber-300">Supporting evidence found</strong>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center leading-normal">
                BantAI supports decisions—it does not guarantee that a website is legitimate or malicious.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Pillars */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6" aria-label="BantAI protection layers">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 sm:p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md">
          <div className="flex gap-3.5 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <span className="text-sm font-extrabold text-[#087EFF] font-mono">01</span>
            <div>
              <strong className="text-sm font-bold text-white block">Local AI models</strong>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Website and email signals are checked on your computer.</p>
            </div>
          </div>
          <div className="flex gap-3.5 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <span className="text-sm font-extrabold text-[#087EFF] font-mono">02</span>
            <div>
              <strong className="text-sm font-bold text-white block">Contextual cloud review</strong>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Only minimized, redacted evidence is reviewed when required.</p>
            </div>
          </div>
          <div className="flex gap-3.5 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <span className="text-sm font-extrabold text-[#087EFF] font-mono">03</span>
            <div>
              <strong className="text-sm font-bold text-white block">Clear final guidance</strong>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Deterministic rules combine evidence into a human-readable outcome.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How BantAI Works */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-20" id="how-it-works" aria-labelledby="how-title">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-semibold text-[#087EFF] tracking-wider uppercase mb-2">HOW BANTAI WORKS</p>
          <h2 id="how-title" className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Protection that works quietly in the background.</h2>
          <p className="text-sm text-slate-300 mt-3 leading-relaxed">The Companion and browser extension handle the technical steps. You see the result and the evidence that matters.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <article className="p-6 sm:p-7 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#087EFF]/20 border border-[#087EFF]/30 text-[#1495FF] flex items-center justify-center font-bold font-mono text-sm">1</div>
            <h3 className="text-base sm:text-lg font-bold text-white">Check locally</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Frozen URL and email models analyze the active address or supported opened email on your device.</p>
          </article>
          <article className="p-6 sm:p-7 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#087EFF]/20 border border-[#087EFF]/30 text-[#1495FF] flex items-center justify-center font-bold font-mono text-sm">2</div>
            <h3 className="text-base sm:text-lg font-bold text-white">Add context safely</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Redacted cloud review adds context while local rules remain responsible for the final result.</p>
          </article>
          <article className="p-6 sm:p-7 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#087EFF]/20 border border-[#087EFF]/30 text-[#1495FF] flex items-center justify-center font-bold font-mono text-sm">3</div>
            <h3 className="text-base sm:text-lg font-bold text-white">Understand the result</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Receive clear guidance, then review activity and submit corrections from your private dashboard.</p>
          </article>
        </div>
      </section>

      {/* Coverage Section */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-20 border-t border-slate-800/80" id="coverage" aria-labelledby="coverage-title">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 flex flex-col">
            <p className="text-xs font-semibold text-[#087EFF] tracking-wider uppercase mb-2">FOCUSED BY DESIGN</p>
            <h2 id="coverage-title" className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">The right signal for the right context.</h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
              BantAI keeps website and email checks independent, so an ordinary webmail address never hides warning signs in an opened message.
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Supported email providers">
              <span className="px-3.5 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">Gmail</span>
              <span className="px-3.5 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">Outlook</span>
              <span className="px-3.5 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">Yahoo Mail</span>
            </div>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <article className="p-6 sm:p-7 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col">
              <GlobeIcon className="w-8 h-8 text-[#087EFF] mb-4"/>
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">WEBSITES</p>
              <h3 className="text-base sm:text-lg font-bold text-white mb-2">Address-bar URL checks</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Analyzes the exact active-tab URL locally. Routine dashboard history stores only the website origin.</p>
            </article>
            <article className="p-6 sm:p-7 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col">
              <MailIcon className="w-8 h-8 text-[#087EFF] mb-4"/>
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">EMAIL</p>
              <h3 className="text-base sm:text-lg font-bold text-white mb-2">Opened-message checks</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Supports Gmail, Outlook, and Yahoo Mail. Dashboard history keeps provider, sender, and subject—not the body.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Outcomes Grid */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-20 border-t border-slate-800/80" aria-labelledby="outcomes-title">
        <div className="text-center max-w-xl mx-auto mb-12">
          <p className="text-xs font-semibold text-[#087EFF] tracking-wider uppercase mb-2">RESULTS WITHOUT FALSE CERTAINTY</p>
          <h2 id="outcomes-title" className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Three clear outcomes. No made-up risk score.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <article className="p-6 sm:p-7 rounded-2xl bg-emerald-950/20 border border-emerald-800/40 flex flex-col">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold mb-4">✓</div>
            <h3 className="text-base sm:text-lg font-bold text-emerald-300 mb-2">No strong warning signs</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">No strong warning sign was detected by the completed checks. This is not a guarantee of legitimacy.</p>
          </article>
          <article className="p-6 sm:p-7 rounded-2xl bg-amber-950/20 border border-amber-800/40 flex flex-col">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold mb-4">!</div>
            <h3 className="text-base sm:text-lg font-bold text-amber-300 mb-2">Needs caution</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Some evidence deserves a closer look before you share information or continue.</p>
          </article>
          <article className="p-6 sm:p-7 rounded-2xl bg-rose-950/20 border border-rose-800/40 flex flex-col">
            <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center text-sm font-bold mb-4">×</div>
            <h3 className="text-base sm:text-lg font-bold text-rose-300 mb-2">Suspicious signs found</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">Multiple warning signs were found. Pause and independently verify the website or sender.</p>
          </article>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-16" id="privacy" aria-labelledby="privacy-title">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-[#071E4A] to-[#04142F] border border-blue-900/60 shadow-2xl flex flex-col lg:flex-row items-center gap-8">
          <div className="w-20 h-20 rounded-2xl bg-[#087EFF]/10 border border-[#087EFF]/30 flex items-center justify-center text-[#1495FF] shrink-0">
            <LockIcon className="w-10 h-10"/>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-[#1495FF] tracking-wider uppercase mb-1">PRIVACY BOUNDARY</p>
            <h2 id="privacy-title" className="text-2xl sm:text-3xl font-extrabold text-white mb-3">Your sensitive content is not dashboard content.</h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              Complete browsing paths and routine email bodies stay outside shared activity history. Cloud evidence is minimized and redacted before it leaves the local detector boundary.
            </p>
          </div>
          <ul className="grid sm:grid-cols-2 gap-3 text-xs text-slate-300 shrink-0">
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-emerald-400 shrink-0"/> Origin-only routine website history</li>
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-emerald-400 shrink-0"/> No stored routine email bodies</li>
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-emerald-400 shrink-0"/> Revocable paired-device access</li>
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-emerald-400 shrink-0"/> 90-day activity retention</li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-12" aria-labelledby="landing-cta-title">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-[#087EFF] to-[#1495FF] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-[#087EFF]/20">
          <div>
            <p className="text-xs font-semibold text-blue-100 tracking-wider uppercase mb-1">READY WHEN YOU ARE</p>
            <h2 id="landing-cta-title" className="text-2xl sm:text-3xl font-black tracking-tight">Make the next click a more informed one.</h2>
            <p className="text-xs sm:text-sm text-blue-100 mt-2 max-w-xl">Set up your BantAI account, pair your computer, and let the Companion handle detection without a terminal.</p>
          </div>
          <button className="flex items-center gap-2 bg-white text-[#04142F] hover:bg-slate-100 text-sm font-bold px-6 py-3.5 rounded-xl transition-all shadow-md shrink-0 active:scale-95" onClick={() => onNavigate(authenticated ? "/dashboard" : "/register")}>
            <span>{authenticated ? "Open dashboard" : "Create your BantAI account"}</span>
            <ArrowRightIcon className="w-4 h-4"/>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-12 mt-auto border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <Logo light compact/>
        <p className="text-center">Decision support for safer browsing—not a guarantee that a website or email is legitimate.</p>
        <span>© 2026 BantAI · v1.1</span>
      </footer>
    </main>);
}

export default LandingPage;
