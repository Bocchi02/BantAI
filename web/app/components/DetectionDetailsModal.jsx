"use client";

import { useEffect, useRef } from "react";
import { AlertTriangleIcon, GlobeIcon, MailIcon, RefreshCwIcon, SparklesIcon, XIcon } from "../Icons";
import { cx, StatusBadge } from "./ViewShared";

export default function DetectionDetailsModal({ item, detail, loading, error, onClose, onRetry }) {
    const closeButton = useRef(null);
    const dialog = useRef(null);
    useEffect(() => {
        const previous = document.activeElement;
        const onKeyDown = (event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Tab") {
                const focusable = [...(dialog.current?.querySelectorAll("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") || [])];
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
                else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener("keydown", onKeyDown);
        document.body.style.overflow = "hidden";
        closeButton.current?.focus();
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = "";
            previous?.focus?.();
        };
    }, [onClose]);

    const isUrl = item.event_type === "URL";
    const isSafe = item.outcome === "NO_STRONG_WARNING_SIGNS";
    const isSuspicious = item.outcome === "SUSPICIOUS_SIGNS_FOUND";
    const reference = isUrl ? item.origin : item.subject || "No subject";
    const fullContextAvailable = detail?.full_context_available === true;
    const scopeMessage = fullContextAvailable
        ? isUrl
            ? "This on-demand request sent the complete website address, including its path, query, and fragment, through BantAI Companion. BantAI did not open or read the webpage."
            : "This on-demand request included the email provider, sender, subject, and message body. Personal identifiers were redacted and long content was limited before Cloud AI; links and attachments were not opened."
        : isUrl
            ? "The complete address was no longer in Companion memory, so this explanation used the stored website origin only. BantAI did not open or read the webpage."
            : "The email body was no longer in Companion memory, so this explanation used the stored provider, sender, and subject only. Links and attachments were not opened.";

    return (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-[#04142F]/60 backdrop-blur-sm pointer-events-none" aria-hidden="true"/>
      <section ref={dialog} className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white border border-slate-200 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="detection-details-title" aria-describedby="detection-details-scope">
        <header className="sticky top-0 z-10 px-5 sm:px-6 py-4 sm:py-5 bg-white/95 backdrop-blur border-b border-slate-100 flex items-start justify-between gap-4 rounded-t-3xl">
          <div className="flex items-start gap-3 min-w-0">
            <span className={cx("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", isSuspicious ? "bg-rose-50 text-rose-700" : isSafe ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
              {isUrl ? <GlobeIcon className="w-5 h-5"/> : <MailIcon className="w-5 h-5"/>}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#087EFF] uppercase tracking-wider">CLOUD AI EXPLANATION</p>
              <h2 id="detection-details-title" className="text-lg font-bold text-[#04142F]">{isUrl ? "Website result details" : "Email result details"}</h2>
              <p className="text-xs text-slate-500 truncate mt-0.5" title={reference}>{reference}</p>
            </div>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} className="w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#087EFF]" aria-label="Close result details">
            <XIcon className="w-4 h-4"/>
          </button>
        </header>

        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <StatusBadge outcome={item.outcome}/>
            <span className="text-xs font-medium text-slate-400">Decision-support explanation</span>
          </div>

          {loading ? (<div className="py-12 text-center" role="status" aria-live="polite">
              <RefreshCwIcon className="w-7 h-7 mx-auto text-[#087EFF] animate-spin"/>
              <strong className="block text-sm text-[#04142F] mt-4 font-semibold">Preparing your explanation…</strong>
              <p className="text-xs text-slate-500 mt-1">The recorded result is not being changed.</p>
            </div>) : error ? (<div className="my-6 p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="w-5 h-5 text-amber-700 shrink-0 mt-0.5"/>
                <div>
                  <strong className="block text-sm font-semibold">Explanation unavailable</strong>
                  <p className="text-xs mt-1 leading-relaxed">{error}</p>
                  <button type="button" onClick={onRetry} className="mt-3 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-bold hover:bg-amber-100">Try again</button>
                </div>
              </div>
            </div>) : detail ? (<div className="pt-4 space-y-4">
              {detail.status === "UNAVAILABLE" && <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950" role="status"><strong>Cloud AI is temporarily unavailable.</strong> The saved BantAI outcome shown above has not changed.</div>}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <SparklesIcon className="w-4 h-4 text-[#087EFF]"/>
                  <h3 className="text-sm font-bold text-[#04142F]">{isSafe ? "What this means" : isSuspicious ? "Why this needs attention" : "Why caution is recommended"}</h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{detail.reasoning_summary}</p>
              </div>

              {!isSafe && detail.indicators?.length > 0 && <div>
                <h3 className="text-xs font-semibold text-[#04142F] uppercase tracking-wider mb-2">Observed context</h3>
                <ul className="space-y-2">
                  {detail.indicators.map((indicator, index) => <li key={`${indicator.category}-${index}`} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700"><strong className="text-slate-900 font-semibold">{indicator.category.replaceAll("_", " ")}</strong><span className="block mt-1 leading-relaxed">{indicator.evidence}</span></li>)}
                </ul>
              </div>}

              <div className={cx("p-4 rounded-xl border", isSuspicious ? "bg-rose-50 border-rose-200" : isSafe ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200")}>
                <h3 className="text-xs font-semibold text-[#04142F] uppercase tracking-wider">Recommended action</h3>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mt-1">{detail.recommended_action}</p>
              </div>
            </div>) : null}

          <p id="detection-details-scope" className="text-xs text-slate-400 leading-relaxed mt-6 pt-4 border-t border-slate-100"><strong>Privacy scope:</strong> {scopeMessage} The full-detail request and explanation are used for this view only and are not added to dashboard history or stored by this feature.</p>
        </div>
      </section>
    </div>);
}
