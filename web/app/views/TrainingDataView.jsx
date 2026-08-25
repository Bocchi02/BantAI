"use client";
import { useCallback, useEffect, useState } from "react";
import { api, downloadApiFile } from "../api";
import { GlobeIcon, MailIcon, LockIcon, DownloadIcon } from "../Icons";
import { cx, feedbackReasonLabel, niceDate, StatusBadge, Notice, EmptyState, PageHeader, DashboardSkeleton } from "../components/ViewShared";

function approvedTrainingLabel(value) {
    return value === "LEGITIMATE" ? "Legitimate" : "Suspicious";
}
function feedbackSourceLabel(value) {
    return value === "RECENT_DETECTION" ? "Detection review" : "Manual URL report";
}
function TrainingDataPage() {
    const [page, setPage] = useState(1);
    const [labelFilter, setLabelFilter] = useState("");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [exporting, setExporting] = useState(null);
    const load = useCallback(() => {
        const params = new URLSearchParams({ page: String(page), page_size: "25" });
        if (labelFilter)
            params.set("approved_label", labelFilter);
        return api(`/admin/training-data?${params}`)
            .then(setData)
            .catch((reason) => setError(reason.message || "BantAI could not load the training-data inventory."));
    }, [labelFilter, page]);
    useEffect(() => { void load(); }, [load]);
    const copyUrl = async (url) => {
        try {
            await navigator.clipboard.writeText(url);
            setMessage("Complete website address copied.");
        }
        catch {
            setError("The website address could not be copied from this browser.");
        }
    };
    const exportManifest = async (candidateType) => {
        setExporting(candidateType);
        setError("");
        setMessage("");
        try {
            const params = new URLSearchParams({ candidate_type: candidateType });
            if (labelFilter)
                params.set("approved_label", labelFilter);
            const { blob, filename } = await downloadApiFile(`/admin/training-data/export.csv?${params}`);
            const href = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = href;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(href);
            setMessage(candidateType === "URL" ? "URL training data exported." : "Email training manifest exported. Email bodies and encrypted body values were not included.");
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : `BantAI could not export the ${candidateType.toLowerCase()} training data.`);
        }
        finally {
            setExporting(null);
        }
    };
    const exportAutomaticSamples = async (sampleType) => {
        const exportKey = `AUTO_${sampleType}`;
        setExporting(exportKey);
        setError("");
        setMessage("");
        try {
            const params = new URLSearchParams({ sample_type: sampleType });
            const { blob, filename } = await downloadApiFile(`/admin/training-data/automatic-export.csv?${params}`);
            const href = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = href;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(href);
            setMessage(sampleType === "URL"
                ? "Automatic URL samples exported."
                : "Automatic email sample manifest exported. Email bodies were not included.");
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : `BantAI could not export the automatic ${sampleType.toLowerCase()} samples.`);
        }
        finally {
            setExporting(null);
        }
    };
    return (<>
      <PageHeader eyebrow="ADMINISTRATION" title="Training data" description="Inspect the approved, de-identified records currently reserved for a future, separately authorized model-training cycle."/>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-label="Training data summary">
        <article className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#EAF4FF] text-[#087EFF] flex items-center justify-center shrink-0">
              <GlobeIcon className="w-5 h-5"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#087EFF] uppercase tracking-wider">URL MODEL</p>
              <h2 className="text-2xl font-bold text-[#04142F]">{data ? data.urls.candidate_total : "—"}</h2>
              <strong className="text-xs font-semibold text-slate-700 block">approved URL candidates</strong>
              <p className="text-xs text-slate-400 mt-0.5">{data ? `${data.urls.evidence_total} approved user ${data.urls.evidence_total === 1 ? "review" : "reviews"}` : "Loading evidence count..."}</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-[#087EFF] border border-blue-200 self-start">{data?.urls.model_version || "RF V4-B"}</span>
        </article>

        <article className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#071E4A] flex items-center justify-center shrink-0">
              <MailIcon className="w-5 h-5"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#087EFF] uppercase tracking-wider">EMAIL MODEL</p>
              <h2 className="text-2xl font-bold text-[#04142F]">{data ? data.emails.candidate_total : "—"}</h2>
              <strong className="text-xs font-semibold text-slate-700 block">encrypted email candidates</strong>
              <p className="text-xs text-slate-400 mt-0.5">{data ? `${data.emails.evidence_total} approved user ${data.emails.evidence_total === 1 ? "report" : "reports"}` : "Loading collection status..."}</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 self-start">{data?.emails.model_version || "XLM-R V1"}</span>
        </article>

        <article className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#EAF7F5] text-[#008F7A] flex items-center justify-center shrink-0">
              <GlobeIcon className="w-5 h-5"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#008F7A] uppercase tracking-wider">URL SAMPLES</p>
              <h2 className="text-2xl font-bold text-[#04142F]">{data ? data.automatic_samples.urls.total : "—"}</h2>
              <strong className="text-xs font-semibold text-slate-700 block">opt-in URL samples</strong>
              <p className="text-xs text-slate-400 mt-0.5">Randomly collected</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-[#008F7A] border border-emerald-200 self-start">Opt-in</span>
        </article>

        <article className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#EAF7F5] text-[#008F7A] flex items-center justify-center shrink-0">
              <MailIcon className="w-5 h-5"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#008F7A] uppercase tracking-wider">EMAIL SAMPLES</p>
              <h2 className="text-2xl font-bold text-[#04142F]">{data ? data.automatic_samples.emails.total : "—"}</h2>
              <strong className="text-xs font-semibold text-slate-700 block">opt-in email samples</strong>
              <p className="text-xs text-slate-400 mt-0.5">Encrypted bodies</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-[#008F7A] border border-emerald-200 self-start">Opt-in</span>
        </article>
      </div>

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#071E4A] mb-6">
        <LockIcon className="w-5 h-5 text-[#087EFF] shrink-0"/>
        <div>
          <strong className="block font-bold">This inventory does not train the live models</strong>
          <p className="text-slate-600 mt-0.5">Approved URL records and encrypted email content remain de-identified references. Email bodies cannot be opened here, and both frozen models remain unchanged.</p>
        </div>
      </div>

      {error && <Notice type="error">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <label className="flex flex-col gap-1 max-w-xs">
          <span className="font-semibold text-slate-600 text-xs">Approved training label</span>
          <select value={labelFilter} onChange={(event) => { setPage(1); setLabelFilter(event.target.value); }} className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs">
            <option value="">All approved labels</option>
            <option value="LEGITIMATE">Legitimate</option>
            <option value="SUSPICIOUS">Suspicious</option>
          </select>
        </label>
        <div className="text-left md:text-right">
          <p className="text-slate-500 text-xs"><strong>Separate CSV exports.</strong> URL and email candidates download independently. Email bodies are not included and remain encrypted for a future restricted training process.</p>
          {data && (<div className="flex items-center md:justify-end gap-3 mt-1.5" aria-label="URL candidate label totals">
              <span className="flex items-center gap-1.5 font-bold text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500"/>{data.urls.label_counts.LEGITIMATE} legitimate</span>
              <span className="flex items-center gap-1.5 font-bold text-rose-700"><span className="w-2 h-2 rounded-full bg-rose-500"/>{data.urls.label_counts.SUSPICIOUS} suspicious</span>
            </div>)}
        </div>
      </section>

      <section className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6" aria-labelledby="url-training-title">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-[#087EFF] uppercase tracking-wider">COLLECTED URLS</p>
            <h2 id="url-training-title" className="text-base font-bold text-[#04142F]">Approved URL candidates</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">No user identity</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" type="button" onClick={() => void exportManifest("URL")} disabled={exporting !== null || !data || data.urls.candidate_total === 0}>
              <DownloadIcon className="w-3.5 h-3.5"/>
              <span>{exporting === "URL" ? "Preparing URL CSV..." : "Export URL CSV"}</span>
            </button>
          </div>
        </div>
        {data && data.urls.items.length > 0 ? (<div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3.5">Complete website address</th>
                  <th className="pb-3 px-3.5">Approved label</th>
                  <th className="pb-3 px-3.5">Detector result</th>
                  <th className="pb-3 px-3.5">Evidence</th>
                  <th className="pb-3 px-3.5">Model</th>
                  <th className="pb-3 px-3.5">Last approved</th>
                  <th className="pb-3 px-3.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.urls.items.map((candidate) => (<tr key={candidate.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3.5 max-w-xs">
                      <strong className="block truncate font-semibold text-slate-900" title={candidate.url}>{candidate.url}</strong>
                      <small className="text-xs text-slate-400 block">{feedbackSourceLabel(candidate.feedback_source)} · {feedbackReasonLabel(candidate.feedback_reason)}</small>
                    </td>
                    <td className="py-3 px-3.5"><span className={cx("text-xs font-semibold px-2 py-0.5 rounded-full", candidate.approved_label === "LEGITIMATE" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{approvedTrainingLabel(candidate.approved_label)}</span></td>
                    <td className="py-3 px-3.5"><StatusBadge outcome={candidate.detector_outcome}/></td>
                    <td className="py-3 px-3.5 text-xs"><strong className="text-slate-800">{candidate.evidence_count}</strong> {candidate.evidence_count === 1 ? "review" : "reviews"}</td>
                    <td className="py-3 px-3.5 text-xs text-slate-400 font-mono">{candidate.detector_model_version}</td>
                    <td className="py-3 px-3.5 text-xs text-slate-400 whitespace-nowrap">{niceDate(candidate.last_approved_at)}</td>
                    <td className="py-3 px-3.5"><button className="text-xs font-bold text-[#087EFF] hover:underline" type="button" onClick={() => void copyUrl(candidate.url)}>Copy address</button></td>
                  </tr>))}
              </tbody>
            </table>
          </div>) : data ? (<EmptyState icon="◎" title="No approved URL candidates" text="Approve suitable entries from User reviews before they appear in this training inventory."/>) : (<DashboardSkeleton />)}
        {data && data.urls.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.urls.pages}</span>
            <button disabled={page >= data.urls.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>)}
      </section>

      <section className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm mb-6" aria-labelledby="email-training-title">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-[#087EFF] uppercase tracking-wider">COLLECTED EMAILS</p>
            <h2 id="email-training-title" className="text-base font-bold text-[#04142F]">Encrypted email candidates</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Bodies encrypted</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" type="button" onClick={() => void exportManifest("EMAIL")} disabled={exporting !== null || !data || data.emails.candidate_total === 0}>
              <DownloadIcon className="w-3.5 h-3.5"/>
              <span>{exporting === "EMAIL" ? "Preparing email CSV..." : "Export email CSV"}</span>
            </button>
          </div>
        </div>
        {data && data.emails.items.length > 0 ? (<div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3.5">Email reference</th>
                  <th className="pb-3 px-3.5">Approved label</th>
                  <th className="pb-3 px-3.5">Detector result</th>
                  <th className="pb-3 px-3.5">Training content</th>
                  <th className="pb-3 px-3.5">Evidence</th>
                  <th className="pb-3 px-3.5">Model</th>
                  <th className="pb-3 px-3.5">Last approved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.emails.items.map((candidate) => (<tr key={candidate.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3.5 max-w-xs">
                      <strong className="block truncate font-semibold text-slate-900" title={candidate.subject || "No subject"}>{candidate.subject || "No subject"}</strong>
                      <small className="text-xs text-slate-400 block">{candidate.sender} · {candidate.provider.toUpperCase()}</small>
                    </td>
                    <td className="py-3 px-3.5"><span className={cx("text-xs font-semibold px-2 py-0.5 rounded-full", candidate.approved_label === "LEGITIMATE" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{approvedTrainingLabel(candidate.approved_label)}</span></td>
                    <td className="py-3 px-3.5"><StatusBadge outcome={candidate.detector_outcome}/></td>
                    <td className="py-3 px-3.5"><span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-[#071E4A]">Encrypted · {candidate.body_character_count.toLocaleString()} chars</span></td>
                    <td className="py-3 px-3.5 text-xs font-bold">{candidate.evidence_count}</td>
                    <td className="py-3 px-3.5 text-xs text-slate-400 font-mono">{candidate.detector_model_version}</td>
                    <td className="py-3 px-3.5 text-xs text-slate-400 whitespace-nowrap">{niceDate(candidate.last_approved_at)}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>) : data ? (<div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <strong className="text-slate-900 block font-bold">No approved encrypted email candidates.</strong>
            <p>{data.emails.privacy_message}</p>
            <p className="text-slate-400">Users must explicitly submit an email and an administrator must approve it before it appears here.</p>
          </div>) : (<DashboardSkeleton />)}
        {data && data.emails.pages > 1 && (<div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">← Previous</button>
            <span>Page {page} of {data.emails.pages}</span>
            <button disabled={page >= data.emails.pages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold hover:bg-slate-50 disabled:opacity-40">Next →</button>
          </div>)}
      </section>

      <section className="p-5 sm:p-6 rounded-2xl bg-white border border-[#BFE4DC] shadow-sm mb-6" aria-labelledby="automatic-url-samples-title">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-[#008F7A] uppercase tracking-wider">OPT-IN RANDOM COLLECTION</p>
            <h2 id="automatic-url-samples-title" className="text-base font-bold text-[#04142F]">Automatic URL samples</h2>
            <p className="text-xs text-slate-500 mt-1">Complete addresses randomly collected from consenting users. These detector references are not confirmed labels.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[#087EFF]">{data?.automatic_samples.urls.total || 0} URLs</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" type="button" onClick={() => void exportAutomaticSamples("URL")} disabled={exporting !== null || !data || data.automatic_samples.urls.total === 0}>
              <DownloadIcon className="w-3.5 h-3.5"/>
              <span>{exporting === "AUTO_URL" ? "Preparing URL CSV..." : "Export URL samples"}</span>
            </button>
          </div>
        </div>
        {data && data.automatic_samples.urls.items.length > 0 ? (<div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3.5">Complete website address</th>
                  <th className="pb-3 px-3.5">Detector result</th>
                  <th className="pb-3 px-3.5">Model</th>
                  <th className="pb-3 px-3.5">Collected</th>
                  <th className="pb-3 px-3.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.automatic_samples.urls.items.map((sample) => (<tr key={sample.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3.5 max-w-lg"><strong className="block truncate font-semibold text-slate-900" title={sample.url}>{sample.url}</strong></td>
                    <td className="py-3 px-3.5"><StatusBadge outcome={sample.detector_outcome}/></td>
                    <td className="py-3 px-3.5 text-xs text-slate-400 font-mono">{sample.detector_model_version}</td>
                    <td className="py-3 px-3.5 text-xs text-slate-400 whitespace-nowrap">{niceDate(sample.collected_at)}</td>
                    <td className="py-3 px-3.5"><button className="text-xs font-bold text-[#087EFF] hover:underline" type="button" onClick={() => void copyUrl(sample.url)}>Copy address</button></td>
                  </tr>))}
              </tbody>
            </table>
          </div>) : data ? (<EmptyState icon="◇" title="No automatic URL samples" text="URL samples appear only after a user explicitly opts in and a completed URL check is randomly selected."/>) : (<DashboardSkeleton />)}
      </section>

      <section className="p-5 sm:p-6 rounded-2xl bg-white border border-[#BFE4DC] shadow-sm" aria-labelledby="automatic-email-samples-title">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-[#008F7A] uppercase tracking-wider">OPT-IN RANDOM COLLECTION</p>
            <h2 id="automatic-email-samples-title" className="text-base font-bold text-[#04142F]">Automatic email samples</h2>
            <p className="text-xs text-slate-500 mt-1">Email metadata and encrypted bodies randomly collected from consenting users. These detector references are not confirmed labels.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800">{data?.automatic_samples.emails.total || 0} emails</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition disabled:opacity-50" type="button" onClick={() => void exportAutomaticSamples("EMAIL")} disabled={exporting !== null || !data || data.automatic_samples.emails.total === 0}>
              <DownloadIcon className="w-3.5 h-3.5"/>
              <span>{exporting === "AUTO_EMAIL" ? "Preparing email CSV..." : "Export email samples"}</span>
            </button>
          </div>
        </div>
        {data && data.automatic_samples.emails.items.length > 0 ? (<div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="pb-3 px-3.5">Email reference</th>
                  <th className="pb-3 px-3.5">Detector result</th>
                  <th className="pb-3 px-3.5">Training content</th>
                  <th className="pb-3 px-3.5">Model</th>
                  <th className="pb-3 px-3.5">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.automatic_samples.emails.items.map((sample) => (<tr key={sample.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3.5 max-w-sm">
                      <strong className="block truncate font-semibold text-slate-900" title={sample.subject || "No subject"}>{sample.subject || "No subject"}</strong>
                      <small className="text-xs text-slate-400 block">{sample.sender || "Sender unavailable"} · {sample.provider?.toUpperCase()}</small>
                    </td>
                    <td className="py-3 px-3.5"><StatusBadge outcome={sample.detector_outcome}/></td>
                    <td className="py-3 px-3.5"><span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-[#071E4A]">Encrypted body · {sample.body_character_count.toLocaleString()} chars</span></td>
                    <td className="py-3 px-3.5 text-xs text-slate-400 font-mono">{sample.detector_model_version}</td>
                    <td className="py-3 px-3.5 text-xs text-slate-400 whitespace-nowrap">{niceDate(sample.collected_at)}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>) : data ? (<EmptyState icon="◇" title="No automatic email samples" text="Email samples appear only after a user explicitly opts in and a completed email check is randomly selected."/>) : (<DashboardSkeleton />)}
        <p className="text-xs text-slate-400 mt-4 leading-relaxed"><strong>Email body privacy:</strong> CSV exports include metadata and body size only. Administrators cannot open, retrieve, or export the automatically collected email body. Opting out deletes that user’s automatic samples.</p>
      </section>
      <p className="text-xs text-slate-400 text-center max-w-2xl mx-auto mt-6 leading-relaxed"><strong>Training inventory only.</strong> These records require offline quality checks, dataset versioning, and explicit authorization before any future model work.</p>
    </>);
}

export default TrainingDataPage;
