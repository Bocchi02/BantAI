"use client";

import { useEffect, useRef } from "react";
import { AlertTriangleIcon, GlobeIcon, MailIcon, RefreshCwIcon, SparklesIcon, XIcon } from "../Icons";
import { cx, StatusBadge } from "./ViewShared";

const PRIVACY_MARKERS = [
    [/[\[]?\s*EMAIL[\s_-]*REDACTED\s*[\]]?/gi, "an email address hidden for privacy"],
    [/[\[]?\s*PHONE[\s_-]*REDACTED\s*[\]]?/gi, "a phone number hidden for privacy"],
    [/[\[]?\s*OTP[\s_-]*REDACTED\s*[\]]?/gi, "a one-time code hidden for privacy"],
    [/[\[]?\s*CARD[\s_-]*REDACTED\s*[\]]?/gi, "payment-card details hidden for privacy"],
    [/[\[]?\s*ACCOUNT[\s_-]*REDACTED\s*[\]]?/gi, "account details hidden for privacy"],
];

function safeExplanationText(value) {
    return PRIVACY_MARKERS.reduce(
        (text, [pattern, replacement]) => text.replace(pattern, replacement),
        String(value || ""),
    );
}

function isSenderRedactionOnly(indicator) {
    const combined = `${indicator?.category || ""} ${indicator?.evidence || ""}`;
    return /EMAIL[\s_-]*REDACTED/i.test(combined)
        && /(sender|identity|email address)/i.test(combined)
        && /(redact|hidden|cannot be verified|unverified|not verified)/i.test(combined);
}

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
    const bodyContextSent = detail?.body_context_sent_to_provider === true;
    const visibleIndicators = (detail?.indicators || []).filter((indicator) => !isSenderRedactionOnly(indicator));
    const scopeMessage = fullContextAvailable
        ? isUrl
            ? "This on-demand request sent only the website origin through the BantAI server. Paths, queries, fragments, and page content were not shared."
            : "This on-demand request included the email provider, sender, subject, and message body. Personal identifiers were redacted and long content was limited before Cloud AI; links and attachments were not opened."
        : isUrl
            ? "This explanation used the stored website origin only. Paths, queries, fragments, and page content were not shared."
            : "The transient email body had expired or was unavailable on this server worker, so this explanation used the stored provider, sender, and subject only. Links and attachments were not opened.";

    return (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-[#22303e]/60 backdrop-blur-xs pointer-events-none" aria-hidden="true"/>
      <section ref={dialog} className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white border border-[#e4e6e8] shadow-[0_4px_24px_0_rgba(34,48,62,0.18)]" role="dialog" aria-modal="true" aria-labelledby="detection-details-title" aria-describedby="detection-details-scope">
        <header className="sticky top-0 z-10 px-5 sm:px-6 py-4 bg-white/95 backdrop-blur border-b border-[#e4e6e8] flex items-start justify-between gap-4 rounded-t-xl">
          <div className="flex items-start gap-3 min-w-0">
            <span className={cx("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-2xs", isSuspicious ? "bg-[#ffe0db] text-[#ff3e1d]" : isSafe ? "bg-[#e8fadf] text-[#71dd37]" : "bg-[#fff1d6] text-[#ffab00]")}>
              {isUrl ? <GlobeIcon className="w-5 h-5"/> : <MailIcon className="w-5 h-5"/>}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">CLOUD AI EXPLANATION</p>
              <h2 id="detection-details-title" className="text-lg font-bold text-[#384551]">{isUrl ? "Website result details" : "Email result details"}</h2>
              <p className="text-xs text-[#8592a3] truncate mt-0.5" title={reference}>{reference}</p>
              {!isUrl && item.sender && <p className="text-xs text-[#8592a3] truncate mt-0.5" title={item.sender}><span className="font-semibold text-[#646e78]">From:</span> {item.sender}</p>}
            </div>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} className="w-8 h-8 rounded-md border border-[#d9dee3] text-[#8592a3] hover:bg-[#f5f5f9] hover:text-[#384551] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#696cff]" aria-label="Close result details">
            <XIcon className="w-4 h-4"/>
          </button>
        </header>

        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#e4e6e8]/70">
            <StatusBadge outcome={item.outcome}/>
            <span className="text-xs font-medium text-[#8592a3]">Decision-support explanation</span>
          </div>

          {loading ? (<div className="py-12 text-center" role="status" aria-live="polite">
              <RefreshCwIcon className="w-8 h-8 mx-auto text-[#696cff] animate-spin"/>
              <strong className="block text-sm text-[#384551] mt-4 font-semibold">Preparing your explanation…</strong>
              <p className="text-xs text-[#8592a3] mt-1">The recorded result is not being changed.</p>
            </div>) : error ? (<div className="my-4 p-4 rounded-lg bg-[#fff1d6] border border-[#ffdd99] text-[#664400]" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="w-5 h-5 text-[#ffab00] shrink-0 mt-0.5"/>
                <div>
                  <strong className="block text-sm font-semibold">Explanation unavailable</strong>
                  <p className="text-xs mt-1 leading-relaxed">{error}</p>
                  <button type="button" onClick={onRetry} className="mt-3 px-3 py-1.5 rounded-md bg-white border border-[#ffdd99] text-xs font-bold hover:bg-[#fff1d6]">Try again</button>
                </div>
              </div>
            </div>) : detail ? (<div className="space-y-4">
              {detail.status === "UNAVAILABLE" && <div className="p-3.5 rounded-lg bg-[#fff1d6] border border-[#ffdd99] text-xs text-[#664400]" role="status"><strong>Cloud AI is temporarily unavailable.</strong> The saved BantAI outcome shown above has not changed.</div>}
              {!isUrl && <div className={cx("p-3.5 rounded-lg border text-xs flex items-start gap-2.5", bodyContextSent ? "bg-[#e8fadf]/70 border-[#c6f1af] text-[#2d5816]" : "bg-[#fff1d6]/70 border-[#ffdd99] text-[#664400]")} role="status">
                <span className="mt-0.5" aria-hidden="true">{bodyContextSent ? "✓" : "!"}</span>
                <div className="flex-1"><strong className="block font-semibold">{bodyContextSent ? "Email body included" : "Email body unavailable for this record"}</strong><span className="block mt-0.5 leading-relaxed">{bodyContextSent ? "Cloud AI received the message text after required privacy redaction." : "Open the email and then open BantAI once to restore its temporary message context."}</span>{!bodyContextSent && <button type="button" onClick={onRetry} className="mt-2 px-3 py-1.5 rounded-md bg-white border border-[#ffdd99] text-xs font-bold hover:bg-[#fff1d6] focus:outline-none focus:ring-2 focus:ring-[#ffab00]">Try again</button>}</div>
              </div>}
              <div className="p-4 rounded-lg bg-[#f5f5f9]/70 border border-[#e4e6e8]">
                <div className="flex items-center gap-2 mb-2">
                  <SparklesIcon className="w-4 h-4 text-[#696cff]"/>
                  <h3 className="text-sm font-bold text-[#384551]">{isSafe ? "What this means" : isSuspicious ? "Why this needs attention" : "Why caution is recommended"}</h3>
                </div>
                <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">{safeExplanationText(detail.reasoning_summary)}</p>
              </div>

              {!isSafe && visibleIndicators.length > 0 && <div>
                <h3 className="text-xs font-semibold text-[#384551] uppercase tracking-wider mb-2">Observed context</h3>
                <ul className="space-y-2">
                  {visibleIndicators.map((indicator, index) => <li key={`${indicator.category}-${index}`} className="p-3 rounded-lg bg-[#f5f5f9]/80 border border-[#e4e6e8] text-xs text-[#646e78]"><strong className="text-[#384551] font-semibold">{safeExplanationText(indicator.category).replaceAll("_", " ")}</strong><span className="block mt-1 leading-relaxed text-[#646e78]">{safeExplanationText(indicator.evidence)}</span></li>)}
                </ul>
              </div>}

              <div className={cx("p-4 rounded-lg border", isSuspicious ? "bg-[#ffe0db]/70 border-[#ffb2a5] text-[#66190c]" : isSafe ? "bg-[#e8fadf]/70 border-[#c6f1af] text-[#2d5816]" : "bg-[#fff1d6]/70 border-[#ffdd99] text-[#664400]")}>
                <h3 className="text-xs font-semibold uppercase tracking-wider">Recommended action</h3>
                <p className="text-xs sm:text-sm leading-relaxed mt-1">{safeExplanationText(detail.recommended_action)}</p>
              </div>
            </div>) : null}

          <p id="detection-details-scope" className="text-xs text-[#8592a3] leading-relaxed pt-3 border-t border-[#e4e6e8]/70"><strong>Privacy scope:</strong> {scopeMessage} The full-detail request and explanation are used for this view only and are not added to dashboard history or stored by this feature.</p>
        </div>
      </section>
    </div>);
}
