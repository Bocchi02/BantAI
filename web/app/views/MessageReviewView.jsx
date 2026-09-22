"use client";
import { useState } from "react";
import { api } from "../api";
import { SparklesIcon, AlertTriangleIcon, CheckCircle2Icon, ShieldAlertIcon } from "../Icons";
import { cx, Notice, PageHeader } from "../components/ViewShared";

const VALID_OUTCOMES = new Set([
    "NO_STRONG_WARNING_SIGNS",
    "NEEDS_CAUTION",
    "SUSPICIOUS_SIGNS_FOUND",
]);

function MessageReviewPage() {
    const [text, setText] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const charCount = text.length;
    const submit = async (event) => {
        event.preventDefault();
        if (!text.trim() || text.length > 10000 || !confirmed) {
            setError("Paste 1 to 10,000 characters and confirm you agree to analyze this text.");
            return;
        }
        setBusy(true);
        setError("");
        setResult(null);
        try {
            const data = await api("/message-review", {
                method: "POST",
                body: JSON.stringify({
                    message: text,
                    confirmed: true,
                }),
            });
            if (data?.status === "COMPLETE" && !VALID_OUTCOMES.has(data.assessment))
                throw new Error("Cloud AI returned an invalid assessment. No result was assigned; try again later.");
            if (!data || !["COMPLETE", "UNAVAILABLE"].includes(data.status))
                throw new Error("Cloud AI returned an incomplete response. No result was assigned; try again later.");
            setResult(data);
        }
        catch (problem) {
            setError(problem instanceof Error ? problem.message : "Signalam could not complete the contextual review.");
        }
        finally {
            setBusy(false);
        }
    };
    const reset = () => {
        setText("");
        setConfirmed(false);
        setResult(null);
        setError("");
    };
    const completeResult = result?.status === "COMPLETE" && VALID_OUTCOMES.has(result?.assessment);
    const isSafe = completeResult && result.assessment === "NO_STRONG_WARNING_SIGNS";
    const isCaution = result?.assessment === "NEEDS_CAUTION";
    return (<>
      <PageHeader eyebrow="TEXT-ONLY CONTEXTUAL REVIEW" title="AI message check" description="Paste suspicious text to check it with Signalam’s Philippine scam contextual engine."/>

      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <section className="sneat-card p-5 sm:p-6" aria-labelledby="form-title">
            <h2 id="form-title" className="text-base font-bold text-[#384551] mb-1">Check a message</h2>
            <p className="text-xs text-[#8592a3] mb-4">Paste text from an SMS, email, or chat to check for Philippine scam tactics, urgent requests, or impersonation patterns.</p>

            {error && <Notice type="error">{error}</Notice>}

            <form onSubmit={submit} className="space-y-4">
              <label className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#384551]">Message text</span>
                  <span className={cx("text-xs font-mono", charCount > 10000 ? "text-[#ff3e1d] font-bold" : "text-[#8592a3]")}>
                    {charCount.toLocaleString()} / 10,000
                  </span>
                </div>
                <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={10000} rows={7} placeholder="Paste the message text here (maximum 10,000 characters)..." required className="w-full p-3.5 rounded-md border border-[#d9dee3] text-xs sm:text-sm text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none transition bg-white resize-y font-sans"/>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8] cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 rounded border-[#d9dee3] text-[#696cff] focus:ring-[#696cff] shrink-0 accent-[#696cff]"/>
                <span className="text-xs text-[#646e78] leading-relaxed">
                  I agree to analyze this pasted text. I understand Signalam redacts reasonably detectable OTPs, phone numbers, email addresses, and account identifiers before cloud analysis.
                </span>
              </label>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={busy || !text.trim() || charCount > 10000 || !confirmed} className="px-5 py-2.5 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs sm:text-sm font-bold shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] transition disabled:opacity-50 flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4"/>
                  <span>{busy ? "Analyzing with Cloud AI..." : "Analyze pasted text"}</span>
                </button>
                {(text || result) && (<button type="button" onClick={reset} className="px-4 py-2.5 rounded-md border border-[#d9dee3] text-xs font-semibold text-[#646e78] hover:bg-[#f5f5f9] transition">
                    Clear
                  </button>)}
              </div>
            </form>
          </section>

          <section className="sneat-card p-5 rounded-lg bg-[#e7e7ff]/40 border-[#c3c4ff] flex gap-3 text-xs text-[#4347d9]">
            <SparklesIcon className="w-5 h-5 text-[#696cff] shrink-0 mt-0.5"/>
            <div className="space-y-1">
              <strong className="block font-bold">This is a text-only contextual check, not a final Signalam email result.</strong>
              <p className="text-[#646e78] leading-relaxed">English, Filipino, and Taglish scam context is reviewed. Language or code-switching alone is never a warning sign.</p>
              <p className="text-[#646e78] leading-relaxed">Sender details, message headers, links, attachments, and the frozen server XLM-R email model are not checked here.</p>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6">
          {result?.status === "UNAVAILABLE" ? <Notice type="error">{result.reasoning_summary || "AI message review is unavailable right now."} No verdict was assigned. You can retry this check.</Notice> : completeResult ? (<section className="sneat-card p-5 sm:p-6 border-t-4 border-t-[#696cff] space-y-4" aria-labelledby="result-title">
              <div className="flex items-center justify-between pb-3 border-b border-[#e4e6e8]">
                <div>
                  <p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">DETAILED ASSESSMENT</p>
                  <h2 id="result-title" className="text-lg font-bold text-[#384551]">Contextual analysis result</h2>
                </div>
                <span className={cx("text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider", isSafe && "bg-[#e8fadf] text-[#2d5816] border border-[#c6f1af]", isCaution && "bg-[#fff1d6] text-[#664400] border border-[#ffdd99]", !isSafe && !isCaution && "bg-[#ffe0db] text-[#66190c] border border-[#ffb2a5]")}>
                  {result.assessment === "NO_STRONG_WARNING_SIGNS" ? "No strong warning signs." : result.assessment === "NEEDS_CAUTION" ? "Needs caution" : "Suspicious signs found"}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs py-2 px-3 rounded-md bg-[#f5f5f9] border border-[#e4e6e8]">
                <span className="text-[#8592a3]">Text-only confidence</span>
                <strong className="text-[#384551] uppercase font-bold">{result.confidence}</strong>
              </div>

              <div className="p-4 rounded-lg bg-[#f5f5f9]/70 border border-[#e4e6e8]">
                <h3 className="text-xs font-bold text-[#384551] uppercase tracking-wider mb-1.5">Assessment summary</h3>
                <p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">{result.reasoning_summary}</p>
              </div>

              {result.indicators?.length > 0 && (<div className="space-y-2">
                  <h3 className="text-xs font-bold text-[#384551] uppercase tracking-wider">Observed scam indicators</h3>
                  <ul className="space-y-2">
                    {result.indicators.map((ind, i) => (<li key={i} className="p-3 rounded-md bg-[#fff1d6]/60 border border-[#ffdd99] text-xs text-[#664400]">
                        <strong className="block font-bold mb-0.5">{ind.category.replaceAll("_", " ")}</strong>
                        <span className="leading-relaxed text-[#646e78]">{ind.evidence}</span>
                      </li>))}
                  </ul>
                </div>)}

              <div className="p-4 rounded-lg bg-[#e8fadf]/60 border border-[#c6f1af] text-xs text-[#2d5816]">
                <strong className="block font-bold mb-1">Safer next steps</strong>
                <p className="leading-relaxed text-[#2d5816]/90">{result.recommended_action}</p>
              </div>

              <p className="text-xs text-[#8592a3] pt-3 border-t border-[#e4e6e8] leading-relaxed">
                “No strong warning signs.” is not a guarantee of legitimacy. This standalone text check does not inspect sender details, headers, links, or attachments; it does not run the frozen server XLM-R email model. The pasted text and result are not stored in activity, reports, training data, browser storage, or logs.
              </p>
            </section>) : (<section className="sneat-card p-8 text-center flex flex-col items-center justify-center h-full min-h-[300px] border-dashed">
              <div className="w-12 h-12 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center mb-3 shadow-2xs">
                <SparklesIcon className="w-6 h-6"/>
              </div>
              <h2 className="text-sm font-bold text-[#384551]">No analysis yet</h2>
              <p className="text-xs text-[#8592a3] max-w-xs mt-1 leading-relaxed">
                Paste message text on the left to see Philippine scam indicators, reasoning, and safer next steps.
              </p>
            </section>)}
        </div>
      </div>
    </>);
}

export default MessageReviewPage;
