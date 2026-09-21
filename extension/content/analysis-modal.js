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

  function getStatusConfig(rawSignal) {
    const norm = String(rawSignal || "").toUpperCase();
    if (norm === "SAFE" || norm === "NO_STRONG_WARNING_SIGNS" || norm === "LOW" || norm === "LOW_RISK") {
      return {
        level: "SAFE",
        title: "SAFE",
        badgeClass: "safe",
        color: "#71dd37",
        bgLight: "rgba(113, 221, 55, 0.08)",
        border: "rgba(113, 221, 55, 0.25)",
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#71dd37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path></svg>`,
        isWarning: false,
        isDangerous: false
      };
    }
    if (norm === "SUSPICIOUS" || norm === "NEEDS_CAUTION" || norm === "MEDIUM") {
      return {
        level: "SUSPICIOUS",
        title: "SUSPICIOUS",
        badgeClass: "suspicious",
        color: "#ffab00",
        bgLight: "rgba(255, 171, 0, 0.08)",
        border: "rgba(255, 171, 0, 0.25)",
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ffab00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        isWarning: true,
        isDangerous: false
      };
    }
    if (norm === "DANGEROUS" || norm === "SUSPICIOUS_SIGNS_FOUND" || norm === "HIGH" || norm === "HIGH_RISK") {
      return {
        level: "DANGEROUS",
        title: "DANGEROUS",
        badgeClass: "dangerous",
        color: "#ff3e1d",
        bgLight: "rgba(255, 62, 29, 0.08)",
        border: "rgba(255, 62, 29, 0.25)",
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ff3e1d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
        isWarning: true,
        isDangerous: true
      };
    }
    if (norm === "ANALYZING" || norm === "CHECKING") {
      return {
        level: "ANALYZING",
        title: "ANALYZING",
        badgeClass: "analyzing",
        color: "#696cff",
        bgLight: "rgba(105, 108, 255, 0.08)",
        border: "rgba(105, 108, 255, 0.25)",
        icon: `<svg class="spinner" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#696cff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`,
        isWarning: false,
        isDangerous: false
      };
    }
    if (norm === "UNABLE TO ANALYZE" || norm === "UNAVAILABLE" || norm === "ERROR") {
      return {
        level: "UNABLE TO ANALYZE",
        title: "UNABLE TO ANALYZE",
        badgeClass: "unavailable",
        color: "#8592a3",
        bgLight: "rgba(133, 146, 163, 0.08)",
        border: "rgba(133, 146, 163, 0.25)",
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8592a3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
        isWarning: false,
        isDangerous: false
      };
    }
    if (norm === "NOT AVAILABLE") {
      return {
        level: "NOT AVAILABLE",
        title: "NOT AVAILABLE",
        badgeClass: "neutral",
        color: "#8592a3",
        bgLight: "rgba(133, 146, 163, 0.08)",
        border: "rgba(133, 146, 163, 0.25)",
        icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8592a3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
        isWarning: false,
        isDangerous: false
      };
    }
    return {
      level: "NOT DETECTED",
      title: "NOT DETECTED",
      badgeClass: "neutral",
      color: "#8592a3",
      bgLight: "rgba(133, 146, 163, 0.08)",
      border: "rgba(133, 146, 163, 0.25)",
      icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8592a3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`,
      isWarning: false,
      isDangerous: false
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

    const targetUrl = data.targetUrl || window.location.href;
    let targetDomain = data.targetDomain || "";
    if (!targetDomain) {
      try {
        targetDomain = new URL(targetUrl).hostname;
      } catch {
        targetDomain = window.location.hostname || "Current Webpage";
      }
    }

    // Extract Website Analysis
    const webData = data.websiteAnalysis || {};
    const rawWebSignal = webData.signal || data.finalDecision || "SAFE";
    const webConfig = getStatusConfig(rawWebSignal);

    // Extract Email Analysis
    const emailData = data.emailAnalysis || {};
    const rawEmailSignal = emailData.signal || (data.isEmail ? data.finalDecision : "NOT DETECTED");
    const emailConfig = getStatusConfig(rawEmailSignal);

    // Check if overall decision is provided by backend
    const hasOverall = Boolean(data.overallDecision);
    const overallConfig = hasOverall ? getStatusConfig(data.overallDecision) : null;

    // Overall warning state
    const isWarning = webConfig.isWarning || emailConfig.isWarning || (overallConfig && overallConfig.isWarning);
    const isDangerous = webConfig.isDangerous || emailConfig.isDangerous || (overallConfig && overallConfig.isDangerous);

    // Indicators
    const indicators = Array.isArray(emailData.indicators) && emailData.indicators.length > 0
      ? emailData.indicators
      : (Array.isArray(data.indicators) ? data.indicators : []);

    // Explanations for website
    let webMeaning = webData.explanation || "";
    if (!webMeaning) {
      if (webConfig.level === "SAFE") {
        webMeaning = "No major website-related security concerns were detected.";
      } else if (webConfig.level === "SUSPICIOUS") {
        webMeaning = "Signalam detected characteristics that look unusual or potentially misleading. Check the website address carefully before interacting with forms or buttons.";
      } else if (webConfig.level === "DANGEROUS") {
        webMeaning = "Signalam identified characteristics commonly associated with unsafe or deceptive websites. Attackers frequently use deceptive address patterns to mislead visitors into sharing credentials or financial details.";
      } else if (webConfig.level === "ANALYZING") {
        webMeaning = "Signalam is currently analyzing this website address.";
      } else {
        webMeaning = "Signalam could not complete the website check right now.";
      }
    }

    // Explanations for email
    let emailMeaning = emailData.explanation || "";
    if (!emailMeaning) {
      if (emailConfig.level === "SAFE") {
        emailMeaning = "No major phishing or social engineering concerns were detected in the analyzed message.";
      } else if (emailConfig.level === "SUSPICIOUS") {
        emailMeaning = "The analyzed message contains characteristics that require additional caution.";
      } else if (emailConfig.level === "DANGEROUS") {
        emailMeaning = "Signalam detected characteristics commonly associated with potentially harmful or deceptive messages.";
      } else if (emailConfig.level === "ANALYZING") {
        emailMeaning = "Email content is currently being analyzed...";
      } else if (emailConfig.level === "UNABLE TO ANALYZE") {
        emailMeaning = "Signalam could not complete the email analysis.";
      } else if (emailConfig.level === "NOT AVAILABLE") {
        emailMeaning = "Email analysis cannot be performed on the current page.";
      } else {
        emailMeaning = "No email content found on this page.";
      }
    }

    // Recommended Action
    let recommendedAction = emailData.recommendation || "";
    if (!recommendedAction) {
      if (isDangerous) {
        recommendedAction = "Do not provide passwords, OTPs, banking information, payment details, or other sensitive information unless you independently verify the sender through an official channel.";
      } else if (isWarning) {
        recommendedAction = "Verify the sender and destination of links before entering passwords, OTPs, personal information, or payment details.";
      } else {
        recommendedAction = "No major security concerns were detected. Continue following normal online safety practices.";
      }
    }

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
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .spinner {
        animation: spin 1s linear infinite;
      }
      .signalam-header {
        padding: 18px 22px;
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
        padding: 20px 22px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      /* Optional Overall Decision Banner */
      .signalam-overall-card {
        padding: 14px 18px;
        border-radius: 10px;
        border: 1px solid ${overallConfig ? overallConfig.border : "transparent"};
        background: linear-gradient(180deg, #ffffff 0%, ${overallConfig ? overallConfig.bgLight : "transparent"} 100%);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }
      .signalam-overall-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .signalam-overall-title {
        font-size: 14px;
        font-weight: 700;
        color: #384554;
      }
      /* Detection Cards (Website & Email) */
      .signalam-card {
        background: #ffffff;
        border: 1px solid #d9dee3;
        border-radius: 10px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        box-shadow: 0 2px 6px 0 rgba(67, 89, 113, 0.06);
      }
      .signalam-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #f0f2f4;
      }
      .signalam-card-title-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .signalam-card-icon {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: rgba(105, 108, 255, 0.08);
        color: #696cff;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .signalam-card-heading {
        font-size: 14px;
        font-weight: 700;
        color: #384554;
      }
      /* Badges */
      .signalam-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        width: fit-content;
      }
      .signalam-badge-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .signalam-badge.safe {
        color: #71dd37;
        background: rgba(113, 221, 55, 0.08);
        border: 1px solid rgba(113, 221, 55, 0.25);
      }
      .signalam-badge.suspicious {
        color: #ffab00;
        background: rgba(255, 171, 0, 0.08);
        border: 1px solid rgba(255, 171, 0, 0.25);
      }
      .signalam-badge.dangerous {
        color: #ff3e1d;
        background: rgba(255, 62, 29, 0.08);
        border: 1px solid rgba(255, 62, 29, 0.25);
      }
      .signalam-badge.analyzing {
        color: #696cff;
        background: rgba(105, 108, 255, 0.08);
        border: 1px solid rgba(105, 108, 255, 0.25);
      }
      .signalam-badge.neutral, .signalam-badge.unavailable {
        color: #8592a3;
        background: rgba(133, 146, 163, 0.1);
        border: 1px solid #d9dee3;
      }
      /* Section Details */
      .signalam-subheading {
        font-size: 11px;
        font-weight: 700;
        color: #a1acb8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
      }
      .signalam-text {
        font-size: 13px;
        color: #566a7f;
        line-height: 1.45;
      }
      .signalam-email-meta {
        font-size: 12px;
        color: #8592a3;
        background: #fbfbfd;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid #e9ecee;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .signalam-email-meta strong {
        color: #384554;
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
        font-size: 14px;
        line-height: 1;
      }
      .signalam-safe-notice {
        font-size: 11px;
        color: #a1acb8;
        line-height: 1.4;
        text-align: center;
        padding: 4px 0;
      }
      /* Modal Actions Footer */
      .signalam-footer {
        padding: 14px 22px;
        border-top: 1px solid #d9dee3;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        background: #ffffff;
      }
      .signalam-btn {
        padding: 8px 18px;
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
        <div style="margin-top: 6px;">
          <h4 class="signalam-subheading">Characteristics Identified</h4>
          <ul class="signalam-indicators-list">
            ${indicators.map(ind => `
              <li class="signalam-indicator-item">
                <span class="signalam-indicator-bullet">•</span>
                <span>${escapeHtml(ind.title || ind.category)}</span>
              </li>
            `).join("")}
          </ul>
        </div>
      `;
    }

    // Email metadata snippet if provided
    let emailMetaHtml = "";
    if (emailData.sender || emailData.subject) {
      emailMetaHtml = `
        <div class="signalam-email-meta">
          ${emailData.sender ? `<div><strong>Sender:</strong> ${escapeHtml(emailData.sender)}</div>` : ""}
          ${emailData.subject ? `<div><strong>Subject:</strong> ${escapeHtml(emailData.subject)}</div>` : ""}
        </div>
      `;
    }

    // Overall Detection section (only if present)
    let overallHtml = "";
    if (hasOverall && overallConfig) {
      overallHtml = `
        <section class="signalam-overall-card">
          <div class="signalam-overall-left">
            <div aria-hidden="true">${overallConfig.icon}</div>
            <span class="signalam-overall-title">Overall Detection</span>
          </div>
          <span class="signalam-badge ${overallConfig.badgeClass}">
            <span class="signalam-badge-dot"></span>
            <span>${escapeHtml(overallConfig.title)}</span>
          </span>
        </section>
      `;
    }

    // Determine whether the result is Safe in URL only or in both detections
    const isUrlSafe = webConfig.level === "SAFE";
    const isEmailSafe = emailConfig.level === "SAFE";
    const isEmailNeutral = ["NOT DETECTED", "NOT AVAILABLE", "ANALYZING", "UNABLE TO ANALYZE", "WAITING"].includes(emailConfig.level);

    // If result is Safe in URL only or in both detections, remove the Go Back button.
    // If one of the two is not Safe, display the button.
    const isSafeOverall = (isUrlSafe && isEmailNeutral) || (isUrlSafe && isEmailSafe);
    let showGoBack = !isSafeOverall;
    if (overallConfig && (overallConfig.level === "SUSPICIOUS" || overallConfig.level === "DANGEROUS")) {
      showGoBack = true;
    }

    // Modal Action Buttons
    let actionsHtml = "";
    if (showGoBack) {
      actionsHtml = `
        <button id="signalamContinueBtn" class="signalam-btn signalam-btn-outline" type="button">Continue Anyway</button>
        <button id="signalamBackBtn" class="signalam-btn signalam-btn-primary" type="button">Go Back</button>
      `;
    }

    const footerHtml = showGoBack ? `
      <!-- Modal Actions Footer -->
      <footer class="signalam-footer">
        ${actionsHtml}
      </footer>
    ` : "";

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
        ${overallHtml}

        <!-- 1. Website Detection Card -->
        <section class="signalam-card" aria-label="Website Detection">
          <div class="signalam-card-header">
            <div class="signalam-card-title-group">
              <div class="signalam-card-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
              </div>
              <h2 class="signalam-card-heading">Website Detection</h2>
            </div>
            <span class="signalam-badge ${webConfig.badgeClass}">
              <span class="signalam-badge-dot"></span>
              <span>${escapeHtml(webConfig.title)}</span>
            </span>
          </div>
          <div>
            <h3 class="signalam-subheading">What This Means</h3>
            <p class="signalam-text">${escapeHtml(webMeaning)}</p>
          </div>
        </section>

        <!-- 2. Email Detection Card -->
        <section class="signalam-card" aria-label="Email Detection">
          <div class="signalam-card-header">
            <div class="signalam-card-title-group">
              <div class="signalam-card-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
              </div>
              <h2 class="signalam-card-heading">Email Detection</h2>
            </div>
            <span class="signalam-badge ${emailConfig.badgeClass}">
              <span class="signalam-badge-dot"></span>
              <span>${escapeHtml(emailConfig.title)}</span>
            </span>
          </div>
          <div>
            <h3 class="signalam-subheading">What This Means</h3>
            <p class="signalam-text">${escapeHtml(emailMeaning)}</p>
            ${emailMetaHtml}
            ${indicatorsHtml}
          </div>
        </section>

        <!-- 3. Recommended Action Card -->
        <section class="signalam-card" aria-label="Recommended Action">
          <div class="signalam-card-header">
            <div class="signalam-card-title-group">
              <div class="signalam-card-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <h2 class="signalam-card-heading">Recommended Action</h2>
            </div>
          </div>
          <div>
            <p class="signalam-text">${escapeHtml(recommendedAction)}</p>
          </div>
        </section>

        <p class="signalam-safe-notice">A safe result indicates no strong warning signs were detected by Signalam. This is not a guarantee that the website or sender is legitimate.</p>
      </div>

      ${footerHtml}
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
      const primaryBtn = shadow.querySelector(".signalam-btn-primary") || dismissBtn;
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

