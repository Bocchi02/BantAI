"use client";
import { useState } from "react";
import { Logo } from "../BrandLogo";
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
    { id: "message-review", icon: SparklesIcon, label: "AI message check" },
    { id: "reports", icon: GlobeIcon, label: "URL reports" },
    { id: "email-reports", icon: MailIcon, label: "Email reports" },
    { id: "devices", icon: LaptopIcon, label: "Paired devices" },
  ];
  const adminNav = [
    { id: "admin", icon: ShieldIcon, label: "Admin overview" },
    { id: "review-reports", icon: FileCheckIcon, label: "User reviews" },
    { id: "admin-email-reports", icon: MailIcon, label: "Email reports" },
    { id: "training-data", icon: DatabaseIcon, label: "Training data" },
    { id: "users", icon: UsersIcon, label: "Users" },
  ];
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop & Mobile Slide-over Sidebar */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 p-5 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 shadow-sm",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-8 px-1">
            <Logo />
            <button
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-6" aria-label="Primary navigation">
            <div>
              <p className="px-3 text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-2">
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
                <p className="px-3 text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-2">
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
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-100">
          <button
            className={cx(
              "w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors border",
              page === "profile"
                ? "bg-blue-50/80 border-blue-200 text-[#087EFF]"
                : "hover:bg-slate-100 border-transparent text-slate-700",
            )}
            onClick={() => {
              navigate("profile");
              setMenuOpen(false);
            }}
            title="Open profile"
          >
            <span className="w-8 h-8 rounded-lg bg-[#071E4A] text-white flex items-center justify-center text-xs font-bold shrink-0">
              {userName(user).slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <strong className="text-xs font-semibold text-slate-900 block truncate">
                {userName(user)}
              </strong>
              <small className="text-[10px] text-slate-500 block truncate">
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
          className="fixed inset-0 bg-[#04142F]/40 backdrop-blur-xs z-30 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen min-w-0">
        <header className="h-16 border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
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

        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">
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
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left",
        active
          ? "bg-[#EAF4FF] text-[#087EFF] font-bold border-l-4 border-[#087EFF] shadow-2xs"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
      onClick={onClick}
    >
      <Icon
        className={cx(
          "w-4 h-4 shrink-0",
          active ? "text-[#087EFF]" : "text-slate-400",
        )}
      />
      <span>{item.label}</span>
    </button>
  );
}

export default AppShell;
