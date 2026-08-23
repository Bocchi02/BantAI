"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { LaptopIcon, LockIcon } from "../Icons";
import { cx, niceDate, relativeTime, Notice, EmptyState, PageHeader } from "../components/ViewShared";

function DevicesPage() {
    const [devices, setDevices] = useState([]);
    const [pair, setPair] = useState(null);
    const [error, setError] = useState("");
    const load = useCallback(() => api("/devices").then((result) => setDevices(result.items)).catch((reason) => setError(reason.message)), []);
    useEffect(() => { load(); }, [load]);
    const createPair = async () => { try {
        setPair(await api("/pairing", { method: "POST" }));
    }
    catch (reason) {
        setError(reason.message);
    } };
    const revoke = async (id) => { if (!confirm("Revoke this device? It will stop sending activity until paired again."))
        return; await api(`/devices/${id}`, { method: "DELETE" }); load(); };
    return (<>
      <PageHeader eyebrow="LOCAL COMPANION" title="Paired devices" description="Connect or revoke computers that can send privacy-minimized results to your account." actions={<button className="px-4 py-2 rounded-xl bg-[#087EFF] hover:bg-[#071E4A] text-white text-xs font-bold shadow-sm transition" onClick={createPair}>+ Pair a device</button>}/>
      {error && <Notice type="error">{error}</Notice>}
      {pair && (<section className="p-6 rounded-2xl bg-gradient-to-r from-[#071E4A] to-[#04142F] text-white flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-md">
          <div>
            <p className="text-[10px] font-bold text-[#1495FF] uppercase tracking-wider mb-1">ONE-TIME PAIRING CODE</p>
            <h2 className="text-3xl font-mono font-bold tracking-widest">{pair.code.slice(0, 4)} {pair.code.slice(4)}</h2>
            <p className="text-xs text-slate-300 mt-1">Enter this code in the BantAI extension. It expires {relativeTime(pair.expires_at)} and can be used once.</p>
          </div>
          <button onClick={() => navigator.clipboard.writeText(pair.code)} className="px-4 py-2 rounded-xl bg-white text-[#04142F] hover:bg-slate-100 text-xs font-bold shadow-sm transition shrink-0">
            Copy code
          </button>
        </section>)}
      <section className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
        <div className="mb-4 pb-3 border-b border-slate-100">
          <p className="text-[10px] font-bold text-[#087EFF] uppercase tracking-wider">YOUR COMPUTERS</p>
          <h2 className="text-base font-bold text-[#04142F]">{devices.length} paired {devices.length === 1 ? "device" : "devices"}</h2>
        </div>
        {!devices.length ? (<EmptyState icon="◇" title="No devices paired" text="Generate a one-time code, then enter it in the BantAI extension on your computer."/>) : (<div className="divide-y divide-slate-100">
            {devices.map((device) => (<div className="py-4 flex items-center justify-between gap-4" key={device.id}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <LaptopIcon className="w-5 h-5"/>
                  </div>
                  <div>
                    <strong className="text-sm font-bold text-slate-900 block">{device.label}</strong>
                    <p className="text-xs text-slate-400">Paired {niceDate(device.paired_at)} · Last seen {niceDate(device.last_seen_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cx("text-[10px] font-bold px-2.5 py-1 rounded-full", device.status === "REVOKED" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-800")}>
                    {device.status === "REVOKED" ? "Revoked" : "Active"}
                  </span>
                  {device.status !== "REVOKED" && (<button className="text-xs font-bold text-rose-600 hover:text-rose-800 px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 transition" onClick={() => revoke(device.id)}>
                      Revoke
                    </button>)}
                </div>
              </div>))}
          </div>)}
      </section>
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#071E4A] mt-6">
        <LockIcon className="w-5 h-5 text-[#087EFF] shrink-0"/>
        <div>
          <h3 className="font-bold block">What leaves your computer?</h3>
          <p className="text-slate-600 mt-0.5">Routine activity sends only the final outcome, website origin, or email provider/sender/subject. A complete URL leaves the device only when you explicitly submit a report or feedback; email bodies and AI payloads are never stored in your dashboard.</p>
        </div>
      </div>
    </>);
}

export default DevicesPage;
