"use client";
import { useState } from "react";
import { ShieldLogoMark } from "../BrandLogo";
import {
  ShieldIcon,
  LayoutDashboardIcon,
  ActivityIcon,
  SparklesIcon,
  GlobeIcon,
  MailIcon,
  LaptopIcon,
  UsersIcon,
  DatabaseIcon,
  FileCheckIcon,
  MenuIcon,
  XIcon,
  HelpCircleIcon,
  ChevronRightIcon,
} from "../Icons";
import { cx, userName } from "./ViewShared";

function AppShell({ user, page, navigate, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = [
    { id: "dashboard", icon: LayoutDashboardIcon, label: "Dashboard" },
    { id: "activity", icon: ActivityIcon, label: "Activity" },
    { id: "message-review", icon: SparklesIcon, label: "AI Message Check" },
    { id: "reports", icon: GlobeIcon, label: "URL Reports" },
    { id: "email-reports", icon: MailIcon, label: "Email Reports" },
    { id: "devices", icon: LaptopIcon, label: "Paired Devices" },
  ];
  const adminNav = [
    { id: "admin", icon: ShieldIcon, label: "Admin Overview" },
    { id: "review-reports", icon: FileCheckIcon, label: "User Reviews" },
    { id: "admin-email-reports", icon: MailIcon, label: "Email Reports" },
    { id: "training-data", icon: DatabaseIcon, label: "Training Data" },
    { id: "users", icon: UsersIcon, label: "Users" },
  ];
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop & Mobile Slide-over Sidebar */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 shadow-xs",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand Header: Official Logo + BantAI */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200/70 shrink-0">
          <div className="flex items-center gap-3 select-none">
            <ShieldLogoMark className="w-[38px] h-[38px] object-contain shrink-0" />
            <span className="text-[17px] sm:text-lg font-bold tracking-tight text-[#071E4A]">
              BantAI
            </span>
          </div>
          <button
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation */}
        <nav
          className="flex-1 overflow-y-auto px-3 py-4 space-y-5 min-h-0"
          aria-label="Primary navigation"
        >
          <div>
            <p className="px-3 text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              MY BANTAI
            </p>
            <div className="space-y-1">
              {nav.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={page === item.id}
                  onClick={() => {
                    navigate(item.id);
                    setMenuOpen(false);
                  }}
                />
              ))}
            </div>
          </div>

          {user.role === "ADMIN" && (
            <div>
              <p className="px-3 text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                ADMINISTRATION
              </p>
              <div className="space-y-1">
                {adminNav.map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    active={page === item.id}
                    onClick={() => {
                      navigate(item.id);
                      setMenuOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Bottom Area: Privacy Card + User Account */}
        <div className="p-3 border-t border-slate-100/80 flex flex-col gap-2.5 shrink-0 bg-white">
          <button
            className={cx(
              "w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors border",
              page === "profile"
                ? "bg-blue-50/80 border-blue-200 text-[#087EFF]"
                : "hover:bg-slate-100 border-transparent text-slate-700",
            )}
            onClick={() => {
              navigate("profile");
              setMenuOpen(false);
            }}
            title="Open profile"
            aria-label="User profile"
          >
            <span className="w-8 h-8 rounded-lg bg-[#071E4A] text-white flex items-center justify-center text-xs font-bold shrink-0">
              {userName(user).slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <strong className="text-xs sm:text-sm font-semibold text-slate-900 block truncate">
                {userName(user)}
              </strong>
              <small className="text-[11px] text-slate-500 block truncate">
                {user.email}
              </small>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </div>
      </aside>

      {/* Backdrop for Mobile Drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-[#04142F]/50 backdrop-blur-xs z-30 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen min-w-0">
        <header className="h-14 sm:h-16 border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-live-dot" />
              <span className="text-xs font-semibold text-slate-700">
                Account signed in
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center text-xs font-bold transition-colors"
              title="BantAI help"
              aria-label="BantAI help"
            >
              <HelpCircleIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-5 md:px-6 lg:px-8 xl:px-8 2xl:px-10 py-6 sm:py-8 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
function NavButton({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      className={cx(
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all text-left group",
        active
          ? "bg-[#EAF4FF] text-[#04142F] font-semibold border-l-[3px] border-[#087EFF] shadow-2xs"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-l-[3px] border-transparent",
      )}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={cx(
          "w-[18px] h-[18px] shrink-0 transition-colors",
          active
            ? "text-[#087EFF]"
            : "text-slate-400 group-hover:text-slate-600",
        )}
      />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

export default AppShell;
