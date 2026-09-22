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
    { id: "help", icon: HelpCircleIcon, label: "Help & Setup" },
  ];
  const adminNav = [
    { id: "admin", icon: ShieldIcon, label: "Admin Overview" },
    { id: "review-reports", icon: FileCheckIcon, label: "User Reviews" },
    { id: "admin-email-reports", icon: MailIcon, label: "Email Reports" },
    { id: "training-data", icon: DatabaseIcon, label: "Training Data" },
    { id: "users", icon: UsersIcon, label: "Users" },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f9] flex text-[#646e78]">
      {/* Desktop & Mobile Slide-over Sidebar (Sneat Layout Menu) */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 w-[260px] bg-white border-r border-[#e4e6e8] flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 shadow-[0_2px_6px_0_rgba(67,89,113,0.08)]",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#e4e6e8]/70 shrink-0">
          <div className="flex items-center gap-3 select-none">
            <ShieldLogoMark className="w-[34px] h-[34px] object-contain shrink-0" />
            <span className="text-xl font-bold tracking-tight text-[#384551]">
              Signalam
            </span>
          </div>
          <button
            className="lg:hidden p-1.5 rounded-md text-[#8592a3] hover:bg-[#f5f5f9] hover:text-[#384551] transition-colors"
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
            <p className="px-3 text-[11px] font-semibold text-[#a1acb8] uppercase tracking-wider mb-2">
              MY SIGNALAM
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
              <p className="px-3 text-[11px] font-semibold text-[#a1acb8] uppercase tracking-wider mb-2">
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

        {/* Bottom User Account Card */}
        <div className="p-3 border-t border-[#e4e6e8]/80 flex flex-col gap-2 shrink-0 bg-white">
          <button
            className={cx(
              "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors border",
              page === "profile"
                ? "bg-[#e7e7ff] border-[#c3c4ff] text-[#696cff]"
                : "hover:bg-[#f5f5f9] border-transparent text-[#646e78]",
            )}
            onClick={() => {
              navigate("profile");
              setMenuOpen(false);
            }}
            title="Open profile"
            aria-label="User profile"
          >
            <span className="w-8 h-8 rounded-full bg-[#696cff] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
              {userName(user).slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <strong className="text-xs font-semibold text-[#384551] block truncate">
                {userName(user)}
              </strong>
              <small className="text-[11px] text-[#8592a3] block truncate">
                {user.email}
              </small>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-[#8592a3] shrink-0" />
          </button>
        </div>
      </aside>

      {/* Backdrop for Mobile Drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-[#22303e]/50 backdrop-blur-xs z-30 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Page Content Wrapper */}
      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen min-w-0">
        {/* Sneat Floating Detached Top Navbar */}
        <div className="px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4">
          <header className="sneat-navbar h-14 sm:h-16 px-4 sm:px-6 flex items-center justify-between sticky top-3 sm:top-4 z-20">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 rounded-md text-[#646e78] hover:bg-[#f5f5f9]"
                onClick={() => setMenuOpen(true)}
                aria-label="Open navigation"
              >
                <MenuIcon className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 bg-[#e8fadf] text-[#2d5816] px-3 py-1 rounded-full text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#71dd37] animate-live-dot" />
                <span>Account signed in</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="w-8 h-8 rounded-full border border-[#d9dee3] text-[#8592a3] hover:bg-[#f5f5f9] hover:text-[#384551] flex items-center justify-center text-xs font-bold transition-colors"
                title="Signalam help"
                aria-label="Signalam help"
                aria-current={page === "help" ? "page" : undefined}
                onClick={() => navigate("help")}
              >
                <HelpCircleIcon className="w-4 h-4" />
              </button>
            </div>
          </header>
        </div>

        <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 min-w-0">
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
        "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all text-left group relative",
        active
          ? "bg-[#e7e7ff] text-[#696cff] font-semibold"
          : "text-[#646e78] hover:bg-[#f5f5f9] hover:text-[#384551]",
      )}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={cx(
          "w-[18px] h-[18px] shrink-0 transition-colors",
          active
            ? "text-[#696cff]"
            : "text-[#8592a3] group-hover:text-[#384551]",
        )}
      />
      <span className="truncate">{item.label}</span>
      {active && (
        <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#696cff] rounded-l-md" />
      )}
    </button>
  );
}

export default AppShell;
