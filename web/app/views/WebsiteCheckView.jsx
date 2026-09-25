"use client";

import { useState } from "react";
import { api } from "../api";
import { GlobeIcon, SparklesIcon } from "../Icons";
import { cx, Notice, PageHeader } from "../components/ViewShared";

const OUTCOMES = new Set([
  "NO_STRONG_WARNING_SIGNS",
  "NEEDS_CAUTION",
  "SUSPICIOUS_SIGNS_FOUND",
]);

export default function WebsiteCheckPage() {
  const [address, setAddress] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!address.trim() || address.length > 2048 || !confirmed) {
      setError("Enter a website address and confirm the one-page cloud check.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await api("/website-check", {
        method: "POST",
        body: JSON.stringify({ website_url: address.trim(), confirmed: true }),
      });
      if (!data || !["COMPLETE", "UNAVAILABLE"].includes(data.status) ||
          (data.status === "COMPLETE" && !OUTCOMES.has(data.assessment))) {
        throw new Error("The website check returned an incomplete result. No verdict was assigned.");
      }
      setResult(data);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Signalam could not check that website right now.");
    } finally {
      setBusy(false);
    }
  };

  const complete = result?.status === "COMPLETE" && OUTCOMES.has(result.assessment);
  const green = complete && result.assessment === "NO_STRONG_WARNING_SIGNS";
  const yellow = complete && result.assessment === "NEEDS_CAUTION";
  const outcomeLabel = green ? "No strong warning signs" : yellow ? "Needs caution" : "Suspicious signs found";

  return (<>
    <PageHeader eyebrow="ON-DEMAND WEBSITE REVIEW" title="AI website check" description="Paste a public website address to review one page’s readable content and website origin." />
    <div className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 flex flex-col gap-6">
        <section className="sneat-card p-5 sm:p-6" aria-labelledby="website-check-form-title">
          <h2 id="website-check-form-title" className="text-base font-bold text-[#384551] mb-1">Check a website</h2>
          <p className="text-xs text-[#8592a3] mb-4">Enter the page address you want reviewed. Signalam will not follow redirects or open links on that page.</p>
          {error && <Notice type="error">{error}</Notice>}
          <form onSubmit={submit} className="space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#384551]">Website address</span>
              <input type="text" inputMode="url" autoComplete="url" value={address} onChange={(event) => { setAddress(event.target.value); setResult(null); setError(""); }} disabled={busy} maxLength={2048} placeholder="https://example.com/page" required className="w-full px-3.5 py-3 rounded-md border border-[#d9dee3] text-xs sm:text-sm text-[#384551] focus:ring-2 focus:ring-[#696cff]/20 focus:border-[#696cff] outline-none bg-white disabled:opacity-60" />
            </label>
            <label className="flex items-start gap-3 p-3.5 rounded-lg bg-[#f5f5f9] border border-[#e4e6e8] cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setResult(null); }} disabled={busy} className="mt-0.5 shrink-0 accent-[#696cff] disabled:opacity-60" />
              <span className="text-xs text-[#646e78] leading-relaxed">I agree to have Signalam retrieve this public page. Its website origin and privacy-redacted readable text will be sent to cloud AI for this check. The pasted address, page text, and result are not saved to my activity history.</span>
            </label>
            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={busy || !address.trim() || !confirmed} className="px-5 py-2.5 rounded-md bg-[#696cff] hover:bg-[#5f61e6] text-white text-xs sm:text-sm font-bold shadow-[0_2px_4px_0_rgba(105,108,255,0.4)] disabled:opacity-50 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4" />
                {busy ? "Checking this page..." : "Check website"}
              </button>
              {(address || result) && <button type="button" onClick={() => { setAddress(""); setConfirmed(false); setResult(null); setError(""); }} disabled={busy} className="px-4 py-2.5 rounded-md border border-[#d9dee3] text-xs font-semibold text-[#646e78] hover:bg-[#f5f5f9] disabled:opacity-50">Clear</button>}
            </div>
          </form>
        </section>
        <section className="sneat-card p-5 rounded-lg bg-[#e7e7ff]/40 border-[#c3c4ff] flex gap-3 text-xs text-[#4347d9]">
          <GlobeIcon className="w-5 h-5 text-[#696cff] shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <strong className="block font-bold">What this check can and cannot see</strong>
            <p className="text-[#646e78]">Only one public HTML or text page is fetched. Sign-in-only content, JavaScript-rendered content, images, downloads, other pages, and redirects are not inspected. The extension’s frozen URL model is not run by this on-demand check.</p>
            <p className="text-[#646e78]">The full address is used only to retrieve the chosen page. Cloud AI receives the origin—not the path, query, or fragment—plus redacted page text. A green result is not a guarantee that a website is legitimate.</p>
          </div>
        </section>
      </div>
      <div className="lg:col-span-5" aria-live="polite">
        {result?.status === "UNAVAILABLE" ? <Notice type="error"><strong>No website verdict was assigned.</strong> {result.reasoning_summary || "This page could not be checked right now."}</Notice> : complete ? <section className="sneat-card p-5 sm:p-6 space-y-4" aria-labelledby="website-result-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e6e8] pb-3">
            <div><p className="text-xs font-semibold text-[#696cff] uppercase tracking-wider">PAGE SNAPSHOT ASSESSMENT</p><h2 id="website-result-title" className="text-lg font-bold text-[#384551]">Website check result</h2></div>
            <span className={cx("text-xs font-bold px-3 py-1 rounded-full", green && "bg-[#e8fadf] text-[#2d5816] border border-[#c6f1af]", yellow && "bg-[#fff1d6] text-[#664400] border border-[#ffdd99]", !green && !yellow && "bg-[#ffe0db] text-[#66190c] border border-[#ffb2a5]")}>{outcomeLabel}</span>
          </div>
          <p className="text-xs text-[#8592a3] break-all">Origin checked: {result.checked_origin}</p>
          {result.content_truncated && <p className="text-xs text-[#664400] rounded-md bg-[#fff1d6] p-3">The page was long, so only a limited text snapshot was reviewed.</p>}
          <div className="p-4 rounded-lg bg-[#f5f5f9]/70 border border-[#e4e6e8]"><h3 className="text-xs font-bold text-[#384551] uppercase tracking-wider mb-1.5">Why this result appeared</h3><p className="text-xs sm:text-sm text-[#646e78] leading-relaxed">{result.reasoning_summary}</p></div>
          {result.indicators?.length > 0 && <div className="space-y-2"><h3 className="text-xs font-bold text-[#384551] uppercase tracking-wider">Observed signs</h3><ul className="space-y-2">{result.indicators.map((indicator, index) => <li key={index} className="p-3 rounded-md bg-[#fff1d6]/60 border border-[#ffdd99] text-xs text-[#664400]"><strong className="block font-bold mb-0.5">{indicator.category.replaceAll("_", " ")}</strong><span className="leading-relaxed text-[#646e78]">{indicator.evidence}</span></li>)}</ul></div>}
          <div className="p-4 rounded-lg bg-[#e8fadf]/60 border border-[#c6f1af] text-xs text-[#2d5816]"><strong className="block font-bold mb-1">Safer next steps</strong><p className="leading-relaxed">{result.recommended_action}</p></div>
          <p className="text-xs text-[#8592a3] pt-3 border-t border-[#e4e6e8] leading-relaxed">This cloud-only result is decision support, not a guarantee of safety or a replacement for the extension’s address-bar detection.</p>
        </section> : <section className="sneat-card p-8 text-center flex flex-col items-center justify-center min-h-[300px] border-dashed"><div className="w-12 h-12 rounded-lg bg-[#e7e7ff] text-[#696cff] flex items-center justify-center mb-3"><GlobeIcon className="w-6 h-6" /></div><h2 className="text-sm font-bold text-[#384551]">No website checked yet</h2><p className="text-xs text-[#8592a3] max-w-xs mt-1 leading-relaxed">Paste a public page address and give consent to see an on-demand content review.</p></section>}
      </div>
    </div>
  </>);
}
