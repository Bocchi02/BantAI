"use client";

import Link from "next/link";
import { Logo } from "../BrandLogo";

export default function AuthLayout({ children, eyebrow, title, description }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-12 bg-[#f5f5f9] selection:bg-[#696cff] selection:text-white">
      <section className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 bg-gradient-to-b from-[#071e4a] via-[#04142f] to-[#071e4a] text-white">
        <Logo light />
        <div className="my-auto max-w-md">
          <p className="text-[11px] font-bold text-[#aeb0ff] tracking-wider uppercase mb-2">SERVER MODELS + PRIVACY MINIMIZED INSIGHTS</p>
          <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight leading-tight mb-4 text-white">Clear checks, carefully handled.</h1>
          <p className="text-sm text-slate-300 leading-relaxed">Signalam checks websites and supported opened emails, then shows understandable guidance in your private dashboard.</p>
        </div>
        <p className="text-[11px] text-slate-400">Signalam v1.1 · Privacy first hybrid analysis</p>
      </section>
      <section className="lg:col-span-7 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md sneat-card p-6 sm:p-8 bg-white border border-[#e4e6e8]">
          <div className="lg:hidden mb-6 flex justify-center"><Logo /></div>
          <p className="text-xs font-semibold text-[#696cff] tracking-wider uppercase mb-1">{eyebrow}</p>
          <h2 className="text-2xl font-bold text-[#384551] tracking-tight">{title}</h2>
          <p className="text-xs text-[#8592a3] mt-1 mb-6 leading-relaxed">{description}</p>
          {children}
          <p className="mt-6 pt-4 border-t border-[#e4e6e8] text-center text-[11px] text-[#8592a3]">
            By using Signalam, you acknowledge the <Link href="/privacy" className="font-semibold text-[#696cff] hover:underline">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
