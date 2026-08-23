"use client";
import { useState } from "react";
import { api } from "../api";
import { SparklesIcon, AlertTriangleIcon } from "../Icons";
import { cx, Notice, PageHeader } from "../components/ViewShared";

function MessageReviewPage() {
    const [message, setMessage] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);
    const submit = async (event) => {
        event.preventDefault();
        if (!message.trim() || !confirmed)
            return;
        setBusy(true);
        setError("");
        setResult(null);
        try {
            setResult(await api("/message-review", {
                method: "POST",
                body: JSON.stringify({ message, confirmed: true }),
            }));
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "BantAI could not review this message.");
        }
        finally {
            setBusy(false);
        }
    };
    const clear = () => {
        setMessage("");
        setConfirmed(false);
        setResult(null);
        setError("");
    };
    const assessmentTitle = result?.assessment === "SUSPICIOUS_SIGNS_FOUND"
        ? "AI found suspicious wording"
        : result?.assessment === "NEEDS_CAUTION"
            ? "AI review suggests caution"
            : "No strong warning signs in the pasted text";
    const confidenceLabel = result?.confidence === "HIGH"
        ? "High"
        : result?.confidence === "MEDIUM"
            ? "Moderate"
            : "Limited";
    return (<>
      <PageHeader eyebrow="ON-DEMAND AI REVIEW" title="Check a message" description="Paste an email body, SMS, chat, or other message for a one-time contextual review."/>
      {error && <Notice type="error">{error}</Notice>}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm" aria-labelledby="message-review-form-title">
          <div className="mb-4">
            <p className="text-[10px] font-bold text-[#087EFF] tracking-wider uppercase">PASTED TEXT</p>
            <h2 id="message-review-form-title" className="text-base font-bold text-[#04142F]">What message would you like to check?</h2>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Message text</span>
              <textarea value={message} onChange={(event) => { setMessage(event.target.value); setResult(null); }} maxLength={10_000} placeholder="Paste the message here. Remove any details you do not want processed." aria-describedby="message-review-help message-review-count" required className="w-full h-44 p-3.5 rounded-xl border border-slate-300 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-[#087EFF] outline-none"/>
            </label>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <p id="message-review-help" className="max-w-md">BantAI redacts reasonably detectable OTPs, phone numbers, email addresses, cards, and account identifiers before the AI request.</p>
              <span id="message-review-count" className="font-mono font-bold text-slate-600">{message.length.toLocaleString()} / 10,000</span>
            </div>
            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 rounded text-[#087EFF] focus:ring-[#087EFF]"/>
              <div className="text-xs">
                <strong className="text-[#071E4A] block">Review this text with Cloud AI</strong>
                <small className="text-slate-500 block mt-0.5">I understand the redacted text will be sent to Cloud AI for this one-time analysis. It will not be saved to activity or training data.</small>
              </div>
            </label>
            <div className="flex items-center gap-3">
              <button className="px-5 py-2.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" type="submit" disabled={busy || !message.trim() || !confirmed}>
                {busy ? "Reviewing message..." : "Analyze pasted text"}
              </button>
              <button className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition disabled:opacity-40" type="button" onClick={clear} disabled={busy || (!message && !result)}>
                Clear
              </button>
            </div>
          </form>
        </section>

        <aside className="lg:col-span-4 p-6 rounded-2xl bg-gradient-to-br from-[#071E4A] to-[#04142F] text-white flex flex-col justify-between" aria-label="AI message check limitations">
          <div>
            <div className="w-9 h-9 rounded-xl bg-[#087EFF]/20 border border-[#087EFF]/30 flex items-center justify-center text-[#1495FF] mb-3">
              <SparklesIcon className="w-5 h-5"/>
            </div>
            <p className="text-[10px] font-bold text-[#1495FF] uppercase tracking-wider mb-1">CONTEXTUAL SIGNAL ONLY</p>
            <h2 className="text-lg font-bold text-white mb-2">One part of the picture</h2>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">This check analyzes only the wording you paste. It does not inspect the sender, email headers, attachments, websites, or your local XLM-R model.</p>
            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-center gap-2"><span className="text-[#1495FF]">✓</span> English, Filipino, and Taglish scam context is reviewed</li>
              <li className="flex items-center gap-2"><span className="text-[#1495FF]">✓</span> Language or code-switching alone is never a warning sign</li>
              <li className="flex items-center gap-2"><span className="text-[#1495FF]">✓</span> No message is added to history or training data</li>
              <li className="flex items-center gap-2"><span className="text-[#1495FF]">✓</span> No links are opened or followed</li>
            </ul>
          </div>
        </aside>
      </div>

      {result?.status === "UNAVAILABLE" && (<section className="p-6 rounded-2xl bg-amber-50 border border-amber-200 mt-6 flex items-start gap-4" role="status">
          <AlertTriangleIcon className="w-6 h-6 text-amber-600 shrink-0 mt-0.5"/>
          <div>
            <p className="text-[10px] font-bold text-amber-700 uppercase">AI REVIEW UNAVAILABLE</p>
            <h2 className="text-base font-bold text-amber-950">Message review could not be completed</h2>
            <p className="text-xs text-amber-900 mt-1">{result.reasoning_summary} {result.recommended_action}</p>
          </div>
        </section>)}

      {result?.status === "COMPLETE" && result.assessment && (<section className={cx("p-6 rounded-2xl border shadow-sm mt-6 space-y-6", result.assessment === "NO_STRONG_WARNING_SIGNS" ? "bg-emerald-50/30 border-emerald-200" : result.assessment === "NEEDS_CAUTION" ? "bg-amber-50/30 border-amber-200" : "bg-rose-50/30 border-rose-200")} aria-live="polite">
          <div className="flex items-center gap-4">
            <div className={cx("w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0", result.assessment === "NO_STRONG_WARNING_SIGNS" ? "bg-emerald-600" : result.assessment === "NEEDS_CAUTION" ? "bg-amber-600" : "bg-rose-600")}>
              {result.assessment === "NO_STRONG_WARNING_SIGNS" ? "✓" : "!"}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">CLOUD AI TEXT SIGNAL</p>
              <h2 className="text-lg font-bold text-[#04142F]">{assessmentTitle}</h2>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">DETAILED ASSESSMENT</p>
                <h3 className="text-sm font-bold text-[#04142F]">Why BantAI reached this result</h3>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Text-only confidence</span>
                <strong className="text-xs font-bold text-[#071E4A]">{confidenceLabel}</strong>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mt-2">{result.reasoning_summary}</p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider mb-1">OBSERVED WORDING</p>
            <h3 className="text-sm font-bold text-[#04142F] mb-3">{result.indicators.length > 0 ? `${result.indicators.length} contextual indicator${result.indicators.length === 1 ? "" : "s"}` : "No specific warning indicators"}</h3>
            {result.indicators.length > 0 ? (<div className="grid sm:grid-cols-2 gap-3" aria-label="Observed message indicators">
                {result.indicators.map((indicator, index) => (<article key={`${indicator.category}-${index}`} className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span className="font-bold uppercase">{indicator.severity.toLowerCase()}</span>
                        <em>Signal {index + 1}</em>
                      </div>
                      <strong className="text-xs font-bold text-[#04142F] block">{indicator.category}</strong>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{indicator.evidence}</p>
                    </div>
                  </article>))}
              </div>) : (<p className="text-xs text-slate-500 p-4 rounded-xl bg-white border border-slate-200">The pasted wording did not provide a specific scam or social-engineering signal. This does not verify the sender or message.</p>)}
          </div>

          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs">
            <strong className="text-[#071E4A] block mb-1">Safer next steps</strong>
            <p className="text-slate-600 leading-relaxed">{result.recommended_action}</p>
          </div>

          <p className="text-[11px] text-slate-400"><strong>Cloud-only review:</strong> This is not a final BantAI email result and cannot confirm that a message is legitimate or malicious.</p>
        </section>)}
    </>);
}

export default MessageReviewPage;
