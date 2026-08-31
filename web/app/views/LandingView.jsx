"use client";
import { Logo } from "../BrandLogo";
import { ShieldIcon, GlobeIcon, MailIcon, LockIcon, ArrowRightIcon, CheckIcon } from "../Icons";

function LandingPage({ authenticated, onNavigate, }) {
    return (<main className="min-h-screen bg-[#f5f5f9] text-[#646e78] flex flex-col selection:bg-[#696cff] selection:text-white">
      {/* Sneat Front-Page Navbar */}
      <header className="w-full bg-white/90 backdrop-blur-md border-b border-[#e4e6e8] sticky top-0 z-30 shadow-[0_2px_6px_0_rgba(67,89,113,0.06)]">
        <div className="max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 h-18 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-xs sm:text-sm font-semibold text-[#646e78]" aria-label="Landing page navigation">
            <a href="#how-it-works" className="hover:text-[#696cff] transition-colors">How it works</a>
            <a href="#coverage" className="hover:text-[#696cff] transition-colors">What it checks</a>
            <a href="#privacy" className="hover:text-[#696cff] transition-colors">Privacy</a>
          </nav>
          <div className="flex items-center gap-3">
            {!authenticated && (<button className="text-xs sm:text-sm font-semibold text-[#646e78] hover:text-[#696cff] px-3 py-2 transition-colors" onClick={() => onNavigate("/login")}>
                Sign in
              </button>)}
            <button className="text-xs sm:text-sm font-semibold bg-[#696cff] hover:bg-[#5f61e6] text-white px-4 sm:px-5 py-2.5 rounded-md transition-all shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] active:scale-95" onClick={() => onNavigate(authenticated ? "/dashboard" : "/register")}>
              {authenticated ? "Open dashboard" : "Create account"}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 pt-16 pb-20 grid lg:grid-cols-12 gap-12 items-center" aria-labelledby="landing-title">
        <div className="lg:col-span-7 flex flex-col">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e7e7ff] border border-[#c3c4ff] text-[#696cff] text-xs font-semibold tracking-wider uppercase mb-6 w-fit shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#696cff] animate-pulse"/>
            LOCAL DETECTION · PRIVACY-MINIMIZED INSIGHTS
          </div>
          <h1 id="landing-title" className="text-4xl sm:text-5xl lg:text-5xl xl:text-6xl font-extrabold text-[#384551] tracking-tight leading-[1.12] mb-6">
            Clear warnings.<br />
            <span className="text-[#696cff]">
              Private by design.
            </span>
          </h1>
          <p className="text-[#646e78] text-base sm:text-lg lg:text-xl leading-relaxed max-w-xl mb-8">
            BantAI checks websites and supported emails with local AI, adds contextual cloud review when needed,
            and gives you a clear result without claiming certainty.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button className="flex items-center gap-2 bg-[#696cff] hover:bg-[#5f61e6] text-white text-sm font-semibold px-6 py-3.5 rounded-md transition-all shadow-[0_4px_12px_0_rgba(105,108,255,0.4)] active:scale-95" onClick={() => onNavigate(authenticated ? "/dashboard" : "/register")}>
              <span>{authenticated ? "Go to your dashboard" : "Get started with BantAI"}</span>
              <ArrowRightIcon className="w-4 h-4"/>
            </button>
            {!authenticated && (<button className="text-[#646e78] hover:text-[#384551] bg-white hover:bg-[#f5f5f9] border border-[#d9dee3] text-sm font-semibold px-5 py-3.5 rounded-md transition-colors shadow-xs" onClick={() => onNavigate("/login")}>
                I already have an account
              </button>)}
          </div>
          <p className="flex items-center gap-2 text-xs text-[#8592a3] mt-6">
            <LockIcon className="w-4 h-4 text-[#696cff]"/>
            Complete URLs and email content stay inside the local detector boundary
          </p>
        </div>

        {/* Hero Browser Mockup */}
        <div className="lg:col-span-5 relative" aria-label="Example BantAI website assessment">
          <div className="absolute -inset-2 bg-gradient-to-r from-[#e7e7ff] to-[#d7f5fc] rounded-2xl blur-xl opacity-70"/>
          <div className="relative rounded-xl overflow-hidden bg-white border border-[#e4e6e8] shadow-[0_4px_18px_0_rgba(34,48,62,0.14)]">
            <div className="h-11 bg-[#f5f5f9] border-b border-[#e4e6e8] px-4 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff3e1d]"/>
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffab00]"/>
                <span className="w-2.5 h-2.5 rounded-full bg-[#71dd37]"/>
              </div>
              <div className="flex-1 flex items-center gap-2 bg-white border border-[#d9dee3] rounded-md px-3 py-1 text-xs text-[#646e78] font-mono truncate">
                <GlobeIcon className="w-3.5 h-3.5 text-[#696cff] shrink-0"/>
                <span>secure-example.ph</span>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#2d5816] bg-[#e8fadf] border border-[#c6f1af] px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#71dd37] animate-live-dot"/>
                Local models ready
              </span>
            </div>
            <div className="p-6 bg-white flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#e4e6e8]/80">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center shadow-2xs">
                    <ShieldIcon className="w-5 h-5"/>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-[#8592a3] tracking-wider uppercase">WEBSITE CHECK</span>
                    <strong className="text-xs font-semibold text-[#384551]">Address-bar analysis</strong>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#664400] bg-[#fff1d6] border border-[#ffdd99] px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                  Needs caution
                </span>
              </div>
              <div className="p-4 rounded-lg bg-[#f5f5f9]/70 border border-[#ffdd99]">
                <span className="text-xs font-semibold text-[#ffab00] uppercase tracking-wider block mb-1">CURRENT WEBSITE</span>
                <h2 className="text-base font-bold text-[#384551] mb-1.5">secure-example.ph</h2>
                <p className="text-xs text-[#646e78] leading-relaxed mb-3">
                  The address shows patterns worth checking before you enter passwords, codes, or payment details.
                </p>
                <div className="space-y-2 pt-2 border-t border-[#e4e6e8] text-xs">
                  <div className="flex items-center justify-between text-[#646e78]">
                    <span>Local URL model</span>
                    <strong className="text-[#ffab00] font-semibold">Warning detected</strong>
                  </div>
                  <div className="flex items-center justify-between text-[#646e78]">
                    <span>Contextual review</span>
                    <strong className="text-[#ffab00] font-semibold">Supporting evidence found</strong>
                  </div>
                </div>
              </div>
              <p className="text-xs text-[#8592a3] text-center leading-normal">
                BantAI supports decisions—it does not guarantee that a website is legitimate or malicious.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Pillars */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6" aria-label="BantAI protection layers">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="sneat-card p-5 flex gap-4 items-start">
            <span className="w-8 h-8 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center font-bold text-sm shrink-0">01</span>
            <div>
              <strong className="text-sm font-bold text-[#384551] block">Local AI models</strong>
              <p className="text-xs text-[#8592a3] mt-1 leading-relaxed">Website and email signals are checked on your computer.</p>
            </div>
          </div>
          <div className="sneat-card p-5 flex gap-4 items-start">
            <span className="w-8 h-8 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center font-bold text-sm shrink-0">02</span>
            <div>
              <strong className="text-sm font-bold text-[#384551] block">Contextual cloud review</strong>
              <p className="text-xs text-[#8592a3] mt-1 leading-relaxed">Only minimized, redacted evidence is reviewed when required.</p>
            </div>
          </div>
          <div className="sneat-card p-5 flex gap-4 items-start">
            <span className="w-8 h-8 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center font-bold text-sm shrink-0">03</span>
            <div>
              <strong className="text-sm font-bold text-[#384551] block">Clear final guidance</strong>
              <p className="text-xs text-[#8592a3] mt-1 leading-relaxed">Deterministic rules combine evidence into a human-readable outcome.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How BantAI Works */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-20" id="how-it-works" aria-labelledby="how-title">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase mb-2">HOW BANTAI WORKS</p>
          <h2 id="how-title" className="text-3xl sm:text-4xl font-extrabold text-[#384551] tracking-tight">Protection that works quietly in the background.</h2>
          <p className="text-sm text-[#8592a3] mt-3 leading-relaxed">The Companion and browser extension handle the technical steps. You see the result and the evidence that matters.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <article className="sneat-card p-6 sm:p-7 flex flex-col gap-3">
            <div className="w-9 h-9 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center font-bold text-sm">1</div>
            <h3 className="text-base sm:text-lg font-bold text-[#384551]">Check locally</h3>
            <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">Frozen URL and email models analyze the active address or supported opened email on your device.</p>
          </article>
          <article className="sneat-card p-6 sm:p-7 flex flex-col gap-3">
            <div className="w-9 h-9 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center font-bold text-sm">2</div>
            <h3 className="text-base sm:text-lg font-bold text-[#384551]">Add context safely</h3>
            <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">Redacted cloud review adds context while local rules remain responsible for the final result.</p>
          </article>
          <article className="sneat-card p-6 sm:p-7 flex flex-col gap-3">
            <div className="w-9 h-9 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center font-bold text-sm">3</div>
            <h3 className="text-base sm:text-lg font-bold text-[#384551]">Understand the result</h3>
            <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">Receive clear guidance, then review activity and submit corrections from your private dashboard.</p>
          </article>
        </div>
      </section>

      {/* Coverage Section */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-20 border-t border-[#e4e6e8]" id="coverage" aria-labelledby="coverage-title">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 flex flex-col">
            <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase mb-2">FOCUSED BY DESIGN</p>
            <h2 id="coverage-title" className="text-3xl sm:text-4xl font-extrabold text-[#384551] tracking-tight mb-4">The right signal for the right context.</h2>
            <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed mb-6">
              BantAI keeps website and email checks independent, so an ordinary webmail address never hides warning signs in an opened message.
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Supported email providers">
              <span className="px-3.5 py-1.5 rounded-full bg-white border border-[#d9dee3] text-xs font-semibold text-[#384551] shadow-2xs">Gmail</span>
              <span className="px-3.5 py-1.5 rounded-full bg-white border border-[#d9dee3] text-xs font-semibold text-[#384551] shadow-2xs">Outlook</span>
              <span className="px-3.5 py-1.5 rounded-full bg-white border border-[#d9dee3] text-xs font-semibold text-[#384551] shadow-2xs">Yahoo Mail</span>
            </div>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <article className="sneat-card p-6 sm:p-7 flex flex-col">
              <div className="w-10 h-10 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center mb-4 shadow-2xs">
                <GlobeIcon className="w-5 h-5"/>
              </div>
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider mb-1">WEBSITES</p>
              <h3 className="text-base sm:text-lg font-bold text-[#384551] mb-2">Address-bar URL checks</h3>
              <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">Analyzes the exact active-tab URL locally. Routine dashboard history stores only the website origin.</p>
            </article>
            <article className="sneat-card p-6 sm:p-7 flex flex-col">
              <div className="w-10 h-10 rounded-md bg-[#e7e7ff] text-[#696cff] flex items-center justify-center mb-4 shadow-2xs">
                <MailIcon className="w-5 h-5"/>
              </div>
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider mb-1">EMAIL</p>
              <h3 className="text-base sm:text-lg font-bold text-[#384551] mb-2">Opened-message checks</h3>
              <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">Supports Gmail, Outlook, and Yahoo Mail. Dashboard history keeps provider, sender, and subject—not the body.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Outcomes Grid */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-20 border-t border-[#e4e6e8]" aria-labelledby="outcomes-title">
        <div className="text-center max-w-xl mx-auto mb-12">
          <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase mb-2">RESULTS WITHOUT FALSE CERTAINTY</p>
          <h2 id="outcomes-title" className="text-3xl sm:text-4xl font-extrabold text-[#384551] tracking-tight">Three clear outcomes. No made-up risk score.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <article className="sneat-card p-6 sm:p-7 border-t-4 border-t-[#71dd37] flex flex-col">
            <div className="w-8 h-8 rounded-full bg-[#71dd37] text-white flex items-center justify-center text-sm font-bold mb-4">✓</div>
            <h3 className="text-base sm:text-lg font-bold text-[#2d5816] mb-2">No strong warning signs</h3>
            <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">No strong warning sign was detected by the completed checks. This is not a guarantee of legitimacy.</p>
          </article>
          <article className="sneat-card p-6 sm:p-7 border-t-4 border-t-[#ffab00] flex flex-col">
            <div className="w-8 h-8 rounded-full bg-[#ffab00] text-white flex items-center justify-center text-sm font-bold mb-4">!</div>
            <h3 className="text-base sm:text-lg font-bold text-[#664400] mb-2">Needs caution</h3>
            <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">Some evidence deserves a closer look before you share information or continue.</p>
          </article>
          <article className="sneat-card p-6 sm:p-7 border-t-4 border-t-[#ff3e1d] flex flex-col">
            <div className="w-8 h-8 rounded-full bg-[#ff3e1d] text-white flex items-center justify-center text-sm font-bold mb-4">×</div>
            <h3 className="text-base sm:text-lg font-bold text-[#66190c] mb-2">Suspicious signs found</h3>
            <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">Multiple warning signs were found. Pause and independently verify the website or sender.</p>
          </article>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-16" id="privacy" aria-labelledby="privacy-title">
        <div className="p-8 sm:p-12 rounded-xl bg-gradient-to-br from-[#071e4a] to-[#04142f] text-white shadow-[0_4px_18px_0_rgba(34,48,62,0.18)] flex flex-col lg:flex-row items-center gap-8">
          <div className="w-16 h-16 rounded-xl bg-[#696cff]/20 border border-[#696cff]/30 flex items-center justify-center text-[#696cff] shrink-0">
            <LockIcon className="w-8 h-8 text-[#696cff]"/>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase mb-1">PRIVACY BOUNDARY</p>
            <h2 id="privacy-title" className="text-2xl sm:text-3xl font-extrabold text-white mb-3">Your sensitive content is not dashboard content.</h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              Complete browsing paths and routine email bodies stay outside shared activity history. Cloud evidence is minimized and redacted before it leaves the local detector boundary.
            </p>
          </div>
          <ul className="grid sm:grid-cols-2 gap-3 text-xs text-slate-300 shrink-0">
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-[#71dd37] shrink-0"/> Origin-only routine website history</li>
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-[#71dd37] shrink-0"/> No stored routine email bodies</li>
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-[#71dd37] shrink-0"/> Revocable paired-device access</li>
            <li className="flex items-center gap-2"><CheckIcon className="w-4 h-4 text-[#71dd37] shrink-0"/> 90-day activity retention</li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-12" aria-labelledby="landing-cta-title">
        <div className="p-8 sm:p-12 rounded-xl bg-gradient-to-r from-[#696cff] to-[#5f61e6] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_4px_18px_0_rgba(105,108,255,0.35)]">
          <div>
            <p className="text-xs font-semibold text-white/80 tracking-wider uppercase mb-1">READY WHEN YOU ARE</p>
            <h2 id="landing-cta-title" className="text-2xl sm:text-3xl font-black tracking-tight">Make the next click a more informed one.</h2>
            <p className="text-xs sm:text-sm text-white/90 mt-2 max-w-xl">Set up your BantAI account, pair your computer, and let the Companion handle detection without a terminal.</p>
          </div>
          <button className="flex items-center gap-2 bg-white text-[#384551] hover:bg-[#f5f5f9] text-sm font-bold px-6 py-3.5 rounded-md transition-all shadow-md shrink-0 active:scale-95" onClick={() => onNavigate(authenticated ? "/dashboard" : "/register")}>
            <span>{authenticated ? "Open dashboard" : "Create your BantAI account"}</span>
            <ArrowRightIcon className="w-4 h-4"/>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-[#e4e6e8] py-8 mt-auto text-xs text-[#8592a3]">
        <div className="max-w-[1440px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo compact/>
          <p className="text-center">Decision support for safer browsing—not a guarantee that a website or email is legitimate.</p>
          <span>© 2026 BantAI · v1.1</span>
        </div>
      </footer>
    </main>);
}

export default LandingPage;
