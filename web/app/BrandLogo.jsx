export function ShieldLogoMark(props) {
    return (<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      {/* Outer Shield Geometry */}
      <path d="M24 3L42 9V22C42 33.6 34.3 42.4 24 45C13.7 42.4 6 33.6 6 22V9L24 3Z" fill="#071E4A"/>
      {/* Faceted Geometry - Left Wing */}
      <path d="M24 3L6 9V22C6 33.6 13.7 42.4 24 45V24L12 14L24 3Z" fill="#04142F"/>
      {/* Faceted Geometry - Right Upper Wing */}
      <path d="M24 3L42 9V22C42 28.5 39.5 34.4 35 38.8L24 24L36 14L24 3Z" fill="#087EFF"/>
      {/* Angular Guardian / Shield Core Facets */}
      <path d="M24 10L32 16L24 32L16 16L24 10Z" fill="#1495FF"/>
      {/* Inner Highlight Geometry */}
      <path d="M24 10L24 32L16 16L24 10Z" fill="#FFFFFF" fillOpacity="0.9"/>
      {/* Bottom Anchor Accent */}
      <path d="M24 32L30 24L24 38L18 24L24 32Z" fill="#EAF4FF"/>
    </svg>);
}
export function Logo({ compact = false, light = false, size = "md", className = "", }) {
    const isSm = size === "sm";
    return (<div className={`flex items-center ${isSm ? "gap-2.5" : "gap-3"} select-none ${className}`}>
      <div className={`relative flex items-center justify-center ${isSm ? "w-8 h-8 rounded-lg p-1" : "w-9 h-9 sm:w-10 sm:h-10 rounded-xl p-1.5"} bg-gradient-to-br from-[#071E4A] to-[#04142F] shadow-md shadow-[#04142F]/20 border border-slate-700/30 shrink-0`}>
        <ShieldLogoMark className="w-full h-full"/>
      </div>
      {!compact && (<div className="flex flex-col">
          <span className={`${isSm ? "text-base sm:text-[17px]" : "text-xl"} font-bold tracking-tight leading-none ${light ? "text-white" : "text-[#04142F]"}`}>
            Signalam
          </span>
          <span className={`text-[10px] sm:text-[11px] font-medium tracking-wide uppercase mt-0.5 ${light ? "text-slate-300" : "text-slate-500"}`}>
            Intelligent Threat Protection
          </span>
        </div>)}
    </div>);
}
