(() => {
  "use strict";

  if (window.__SIGNAMAL_ANALYSIS_MODAL_LOADED) {
    return;
  }
  window.__SIGNAMAL_ANALYSIS_MODAL_LOADED = true;

  const MODAL_ROOT_ID = "signalam-extension-root";

  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getDecisionConfig(rawDecision) {
    const norm = String(rawDecision || "").toUpperCase();
    if (norm === "SUSPICIOUS_SIGNS_FOUND" || norm === "HIGH" || norm === "HIGH_RISK" || norm === "DANGEROUS") {
      return {
        level: "DANGEROUS",
        title: "DANGEROUS",
        statusClass: "dangerous",
        color: "#ff3e1d",
        bgLight: "rgba(255, 62, 29, 0.08)",
        border: "rgba(255, 62, 29, 0.25)",
        icon: `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#ff3e1d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
        summary: "Signalam recommends that you avoid providing sensitive information on this website.",
        explanation: "Signalam identified characteristics commonly associated with unsafe or deceptive websites. Attackers frequently use deceptive address patterns to mislead visitors into sharing credentials or financial details.",
        recommendation: "Avoid entering passwords, OTPs, payment information, or other sensitive information unless you can independently verify the website through an official channel.",
        isWarning: true
      };
    }
    if (norm === "NEEDS_CAUTION" || norm === "SUSPICIOUS" || norm === "MEDIUM") {
      return {
        level: "SUSPICIOUS",
        title: "SUSPICIOUS",
        statusClass: "suspicious",
        color: "#ffab00",
        bgLight: "rgba(255, 171, 0, 0.08)",
        border: "rgba(255, 171, 0, 0.25)",
        icon: `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#ffab00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        summary: "Signalam recommends caution when interacting with this website.",
        explanation: "Signalam identified characteristics that look unusual or potentially misleading. Check the website address carefully before interacting with forms or buttons.",
        recommendation: "Proceed carefully. Verify the website before entering passwords, personal information, OTPs, or payment details.",
        isWarning: true
      };
    }
    if (norm === "NO_STRONG_WARNING_SIGNS" || norm === "LOW" || norm === "LOW_RISK" || norm === "SAFE") {
      return {
        level: "SAFE",
        title: "SAFE",
        statusClass: "safe",
        color: "#71dd37",
        bgLight: "rgba(113, 221, 55, 0.08)",
        border: "rgba(113, 221, 55, 0.25)",
        icon: `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#71dd37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path></svg>`,
        summary: "No major security concerns were identified.",
        explanation: "Signalam analyzed the address of this website and did not identify strong warning signs. Please note that this is not a guarantee that the website is legitimate.",
        recommendation: "No major security concerns were identified. Continue following normal online safety practices.",
        isWarning: false
      };
    }
    return {
      level: "ANALYZING",
      title: norm === "UNAVAILABLE" ? "UNABLE TO ANALYZE" : "ANALYSIS IN PROGRESS",
      statusClass: "neutral",
      color: "#8592a3",
      bgLight: "rgba(133, 146, 163, 0.08)",
      border: "rgba(133, 146, 163, 0.25)",
      icon: `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#8592a3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
      summary: norm === "UNAVAILABLE" ? "Signalam could not complete the website analysis." : "Signalam is checking this page.",
      explanation: norm === "UNAVAILABLE" ? "The security service is currently unavailable. Avoid submitting sensitive credentials or financial details until verified." : "Analysis is currently taking place. Please check back shortly.",
      recommendation: "Exercise standard security precautions. Check that the address matches the expected official website.",
      isWarning: false
    };
  }

  function renderModal(data = {}) {
    const existing = document.getElementById(MODAL_ROOT_ID);
    if (existing) {
      existing.remove();
    }

    const previouslyFocusedElement = document.activeElement;

    // Use Shadow DOM for complete CSS isolation from host page
    const host = document.createElement("div");
    host.id = MODAL_ROOT_ID;
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    const decision = getDecisionConfig(data.finalDecision || data.riskLevel || data.finalResult);
    const targetUrl = data.targetUrl || window.location.href;
    let targetDomain = data.targetDomain || "";
    if (!targetDomain) {
      try {
        targetDomain = new URL(targetUrl).hostname;
      } catch {
        targetDomain = window.location.hostname || "Current Webpage";
      }
    }

    const indicators = Array.isArray(data.indicators) ? data.indicators : [];
    const explanations = Array.isArray(data.explanations) ? data.explanations : [];

    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        font-family: "Public Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #566a7f;
        box-sizing: border-box;
      }
      *, *::before, *::after {
        box-sizing: inherit;
        margin: 0;
        padding: 0;
      }
      .signalam-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(20, 20, 30, 0.55);
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        padding: 16px;
        animation: signalamFadeIn 0.2s ease-out;
      }
      .signalam-modal {
        background: #ffffff;
        color: #566a7f;
        border: 1px solid #d9dee3;
        border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
        width: 100%;
        max-width: 640px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: signalamScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes signalamFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes signalamScaleIn {
        from { opacity: 0; transform: scale(0.97) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .signalam-header {
        padding: 20px 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid #d9dee3;
        background: #ffffff;
      }
      .signalam-header-left {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .signalam-logo-badge {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: linear-gradient(135deg, #696cff, #5052c9);
        display: grid;
        place-items: center;
        color: #ffffff;
        box-shadow: 0 2px 6px rgba(105, 108, 255, 0.35);
        flex-shrink: 0;
      }
      .signalam-header-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .signalam-title {
        font-size: 18px;
        font-weight: 700;
        color: #384554;
        line-height: 1.2;
      }
      .signalam-domain-subtitle {
        font-size: 12px;
        color: #a1acb8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .signalam-close-btn {
        background: none;
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        display: grid;
        place-items: center;
        color: #a1acb8;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        flex-shrink: 0;
      }
      .signalam-close-btn:hover {
        background: #f5f5f9;
        color: #384554;
      }
      .signalam-close-btn:focus-visible {
        outline: 2px solid #696cff;
        outline-offset: 2px;
      }
      .signalam-body {
        padding: 24px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      /* Final Decision Section */
      .signalam-decision-card {
        padding: 16px 20px;
        border-radius: 10px;
        border: 1px solid ${decision.border};
        background: linear-gradient(180deg, #ffffff 0%, ${decision.bgLight} 100%);
        display: flex;
        align-items: center;
        gap: 16px;
        box-shadow: 0 2px 6px 0 rgba(67, 89, 113, 0.08);
      }
      .signalam-decision-icon {
        width: 52px;
        height: 52px;
        border-radius: 10px;
        background: ${decision.bgLight};
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .signalam-decision-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .signalam-decision-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 2px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        width: fit-content;
        text-transform: uppercase;
        background: ${decision.bgLight};
        color: ${decision.color};
        border: 1px solid ${decision.border};
      }
      .signalam-decision-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .signalam-decision-title {
        font-size: 22px;
        font-weight: 700;
        color: #384554;
        line-height: 1.2;
      }
      .signalam-decision-summary {
        font-size: 13px;
        color: #566a7f;
        line-height: 1.45;
      }
      /* Section Cards */
      .signalam-section-card {
        background: #fbfbfd;
        border: 1px solid #e9ecee;
        border-radius: 8px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .signalam-section-label {
        font-size: 12px;
        font-weight: 700;
        color: #384554;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .signalam-section-text {
        font-size: 13px;
        color: #566a7f;
        line-height: 1.5;
      }
      .signalam-indicators-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 4px;
      }
      .signalam-indicator-item {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-size: 13px;
        color: #566a7f;
      }
      .signalam-indicator-bullet {
        color: #ffab00;
        font-size: 16px;
        line-height: 1;
      }
      .signalam-safe-notice {
        font-size: 11px;
        color: #a1acb8;
        line-height: 1.4;
        border-top: 1px dashed #e9ecee;
        padding-top: 8px;
        margin-top: 4px;
      }
      /* Modal Actions Footer */
      .signalam-footer {
        padding: 16px 24px;
        border-top: 1px solid #d9dee3;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
        background: #ffffff;
      }
      .signalam-btn {
        padding: 9px 18px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        border: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .signalam-btn-primary {
        background: #696cff;
        color: #ffffff;
        box-shadow: 0 2px 4px 0 rgba(105, 108, 255, 0.4);
      }
      .signalam-btn-primary:hover {
        background: #5f61e6;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px 0 rgba(105, 108, 255, 0.5);
      }
      .signalam-btn-primary:active {
        transform: translateY(0);
      }
      .signalam-btn-secondary {
        background: #8592a3;
        color: #ffffff;
      }
      .signalam-btn-secondary:hover {
        background: #788393;
        transform: translateY(-1px);
      }
      .signalam-btn-outline {
        background: transparent;
        border: 1px solid #d9dee3;
        color: #8592a3;
      }
      .signalam-btn-outline:hover {
        background: #f5f5f9;
        color: #566a7f;
      }
      .signalam-btn:focus-visible {
        outline: 2px solid #696cff;
        outline-offset: 2px;
      }
    `;
    shadow.appendChild(style);

    const backdrop = document.createElement("div");
    backdrop.className = "signalam-backdrop";

    const modal = document.createElement("div");
    modal.className = "signalam-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "signalamAnalysisModalTitle");

    // Indicators HTML if any
    let indicatorsHtml = "";
    if (indicators.length > 0) {
      indicatorsHtml = `
        <ul class="signalam-indicators-list">
          ${indicators.map(ind => `
            <li class="signalam-indicator-item">
              <span class="signalam-indicator-bullet">•</span>
              <span>${escapeHtml(ind.title || ind.category)}</span>
            </li>
          `).join("")}
        </ul>
      `;
    }

    // Explanations HTML if any
    let explanationsHtml = "";
    if (explanations.length > 0) {
      explanationsHtml = explanations.map(exp => `
        <p class="signalam-section-text">${escapeHtml(exp.description)}</p>
      `).join("");
    }

    // Modal Action Buttons
    const hasWarning = decision.isWarning;
    const actionsHtml = `
      ${hasWarning ? `<button id="signalamContinueBtn" class="signalam-btn signalam-btn-outline" type="button">Continue Anyway</button>` : ""}
      <button id="signalamBackBtn" class="signalam-btn ${hasWarning ? "signalam-btn-primary" : "signalam-btn-outline"}" type="button">Go Back</button>
      <button id="signalamCloseBtn" class="signalam-btn ${hasWarning ? "signalam-btn-secondary" : "signalam-btn-primary"}" type="button">Close</button>
    `;

    modal.innerHTML = `
      <!-- Modal Header -->
      <header class="signalam-header">
        <div class="signalam-header-left">
          <div class="signalam-logo-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <div class="signalam-header-text">
            <h1 id="signalamAnalysisModalTitle" class="signalam-title">Security Analysis</h1>
            <span class="signalam-domain-subtitle">${escapeHtml(targetDomain)}</span>
          </div>
        </div>
        <button id="signalamDismissBtn" class="signalam-close-btn" type="button" aria-label="Close dialog">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <!-- Modal Body -->
      <div class="signalam-body">
        <!-- 1. Final Decision Section -->
        <section class="signalam-decision-card">
          <div class="signalam-decision-icon" aria-hidden="true">
            ${decision.icon}
          </div>
          <div class="signalam-decision-info">
            <div class="signalam-decision-badge">
              <span class="signalam-decision-dot"></span>
              <span>${escapeHtml(decision.level)}</span>
            </div>
            <h2 class="signalam-decision-title">${escapeHtml(decision.title)}</h2>
            <p class="signalam-decision-summary">${escapeHtml(decision.summary)}</p>
          </div>
        </section>

        <!-- 2. What This Means -->
        <section class="signalam-section-card">
          <h3 class="signalam-section-label">What This Means</h3>
          <p class="signalam-section-text">${escapeHtml(decision.explanation)}</p>
          ${indicatorsHtml}
          ${explanationsHtml}
          <p class="signalam-safe-notice">A safe result indicates no strong warning signs were detected by Signalam. This is not a guarantee that the website or sender is legitimate.</p>
        </section>

        <!-- 3. Recommended Action -->
        <section class="signalam-section-card">
          <h3 class="signalam-section-label">Recommended Action</h3>
          <p class="signalam-section-text">${escapeHtml(decision.recommendation)}</p>
        </section>
      </div>

      <!-- Modal Actions Footer -->
      <footer class="signalam-footer">
        ${actionsHtml}
      </footer>
    `;

    backdrop.appendChild(modal);
    shadow.appendChild(backdrop);

    function closeModal() {
      host.remove();
      document.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === "function") {
        try {
          previouslyFocusedElement.focus();
        } catch {}
      }
    }

    // Dismiss button
    const dismissBtn = shadow.getElementById("signalamDismissBtn");
    if (dismissBtn) dismissBtn.addEventListener("click", closeModal);

    // Close button
    const closeBtn = shadow.getElementById("signalamCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    // Go Back button
    const backBtn = shadow.getElementById("signalamBackBtn");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        closeModal();
        if (window.history.length > 1) {
          window.history.back();
        }
      });
    }

    // Continue button
    const continueBtn = shadow.getElementById("signalamContinueBtn");
    if (continueBtn) {
      continueBtn.addEventListener("click", closeModal);
    }

    // Backdrop click dismiss
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        closeModal();
      }
    });

    // Keyboard navigation and Focus trap
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
        return;
      }

      if (e.key === "Tab") {
        const focusable = shadow.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (shadow.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (shadow.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    // Focus first primary button
    setTimeout(() => {
      const primaryBtn = shadow.querySelector(".signalam-btn-primary") || closeBtn || dismissBtn;
      if (primaryBtn) primaryBtn.focus();
    }, 50);
  }

  // Listen for message from popup
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "BANTAI_SHOW_ANALYSIS_MODAL" || message?.type === "SIGNAMAL_SHOW_ANALYSIS_MODAL") {
        renderModal(message.data || {});
        sendResponse({ ok: true });
        return true;
      }
    });
  }

  // Support direct DOM triggering in preview testing
  window.addEventListener("SIGNAMAL_TRIGGER_MODAL", (event) => {
    renderModal(event.detail || {});
  });
  window.SignalamModal = { render: renderModal };
})();
