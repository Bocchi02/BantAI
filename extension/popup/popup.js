const STORAGE_KEYS = {
  tabStates: "bantai_v100_tab_states",
  server: "bantai_v100_server",
  autoPopup: "bantai_v100_auto_popup"
};

const SUPPORTED_EMAIL_PROVIDERS = new Set([
  "gmail",
  "outlook",
  "yahoo"
]);

let activeTabId = null;
let countdownTimer = null;

const byId = (id) => document.getElementById(id);

const elements = {
  autoPopupBanner: byId("autoPopupBanner"),
  countdownText: byId("countdownText"),
  countdownBar: byId("countdownBar"),
  serverStatus: byId("serverStatus"),
  serverStatusText: byId("serverStatusText"),

  websiteCard: byId("websiteCard"),
  websiteProgress: byId("websiteProgress"),
  websiteProgressValue: byId("websiteProgressValue"),
  websiteProgressLabel: byId("websiteProgressLabel"),
  websiteDomain: byId("websiteDomain"),
  websiteMessage: byId("websiteMessage"),
  websiteUrl: byId("websiteUrl"),
  websiteScore: byId("websiteScore"),
  websiteThreshold: byId("websiteThreshold"),

  emailCard: byId("emailCard"),
  emailProgress: byId("emailProgress"),
  emailProgressValue: byId("emailProgressValue"),
  emailProgressLabel: byId("emailProgressLabel"),
  emailContext: byId("emailContext"),
  emailResultTitle: byId("emailResultTitle"),
  emailMessage: byId("emailMessage"),
  emailMetadata: byId("emailMetadata"),
  emailSender: byId("emailSender"),
  emailSubject: byId("emailSubject"),
  emailScore: byId("emailScore"),
  emailThreshold: byId("emailThreshold"),
  emailTruncated: byId("emailTruncated"),

  guidanceCard: byId("guidanceCard"),
  guidanceTitle: byId("guidanceTitle"),
  guidanceMessage: byId("guidanceMessage")
};

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentage(value, decimalPlaces = 2) {
  const number = numericValue(value);

  if (number === null) {
    return "--";
  }

  return `${(number * 100).toFixed(decimalPlaces)}%`;
}

function shorten(value, maximum = 160) {
  const text = String(value || "");

  if (text.length <= maximum) {
    return text || "--";
  }

  return `${text.slice(0, maximum - 18)}...${text.slice(-15)}`;
}

function normalizeSignal(signal) {
  const normalized = String(signal || "WAITING").toUpperCase();

  if (
    normalized === "SAFE" ||
    normalized === "SUSPICIOUS" ||
    normalized === "ANALYZING" ||
    normalized === "UNAVAILABLE"
  ) {
    return normalized;
  }

  return "WAITING";
}

function styleForSignal(signal) {
  const normalized = normalizeSignal(signal);

  if (normalized === "SAFE") {
    return "safe";
  }

  if (normalized === "SUSPICIOUS") {
    return "suspicious";
  }

  if (normalized === "ANALYZING") {
    return "analyzing";
  }

  if (normalized === "UNAVAILABLE") {
    return "unavailable";
  }

  return "neutral";
}

function applyDetectorStyle(card, progress, progressLabel, signal) {
  const normalized = normalizeSignal(signal);
  const style = styleForSignal(normalized);

  card.className = `detector-panel ${style}`;
  progress.className = `risk-ring ${style}`;
  progressLabel.textContent = normalized;
}

function renderRisk(progress, valueElement, value) {
  const number = numericValue(value);

  if (number === null) {
    progress.style.setProperty("--progress", "0deg");
    progress.removeAttribute("aria-valuenow");
    progress.setAttribute("aria-valuetext", "Risk percentage unavailable");
    valueElement.textContent = "--";
    return;
  }

  const clamped = Math.max(0, Math.min(1, number));
  const displayed = `${(clamped * 100).toFixed(1)}%`;

  progress.style.setProperty("--progress", `${clamped * 360}deg`);
  progress.setAttribute("aria-valuenow", String(clamped * 100));
  progress.setAttribute("aria-valuetext", `${displayed} suspicious risk`);
  valueElement.textContent = displayed;
}

function renderServer(server) {
  if (server?.status === "connected") {
    elements.serverStatus.className = "server-status connected";
    elements.serverStatusText.textContent = "Ready";
    return;
  }

  if (server?.status === "unavailable") {
    elements.serverStatus.className = "server-status unavailable";
    elements.serverStatusText.textContent = "Server off";
    return;
  }

  elements.serverStatus.className = "server-status checking";
  elements.serverStatusText.textContent = "Checking";
}

function renderWebsite(state) {
  const detector = state?.url_detector || {
    state: "waiting",
    signal: "WAITING",
    message: "Waiting for the current website."
  };
  const result = detector.result || {};
  const signal = result.signal || detector.signal || detector.state;
  const currentUrl = result.current_url || state?.current_url || "";

  applyDetectorStyle(
    elements.websiteCard,
    elements.websiteProgress,
    elements.websiteProgressLabel,
    signal
  );
  renderRisk(
    elements.websiteProgress,
    elements.websiteProgressValue,
    result.suspicious_probability
  );

  elements.websiteDomain.textContent =
    result.hostname || state?.hostname || "Current browser tab";
  if (elements.websiteMessage) {
    elements.websiteMessage.textContent =
      result.message ||
      detector.message ||
      "BantAI checks only the URL shown in the browser address bar.";
  }
  if (elements.websiteUrl) {
    elements.websiteUrl.textContent = shorten(currentUrl);
    elements.websiteUrl.title = currentUrl;
  }
  if (elements.websiteScore) {
    elements.websiteScore.textContent = percentage(
      result.suspicious_probability
    );
  }
  if (elements.websiteThreshold) {
    elements.websiteThreshold.textContent = percentage(result.threshold);
  }
}

function emailTitleForSignal(signal) {
  const normalized = normalizeSignal(signal);

  if (normalized === "SAFE") {
    return "No strong warning sign";
  }

  if (normalized === "SUSPICIOUS") {
    return "Warning sign detected";
  }

  if (normalized === "ANALYZING") {
    return "Checking this email";
  }

  if (normalized === "UNAVAILABLE") {
    return "Check unavailable";
  }

  return "Open an email";
}

function renderEmail(state) {
  const detector = state?.email_detector || {
    state: "disabled",
    signal: "UNAVAILABLE",
    message: "Email checking works only in Gmail, Outlook, and Yahoo."
  };
  const result = detector.result || {};
  const provider = String(
    state?.provider || detector.provider || result.provider || ""
  ).toLowerCase();

  if (!SUPPORTED_EMAIL_PROVIDERS.has(provider)) {
    elements.emailCard.className = "detector-panel neutral hidden";
    return;
  }

  const signal = result.signal || detector.signal || (
    detector.state === "waiting" ? "WAITING" : detector.state
  );

  applyDetectorStyle(
    elements.emailCard,
    elements.emailProgress,
    elements.emailProgressLabel,
    signal
  );
  renderRisk(
    elements.emailProgress,
    elements.emailProgressValue,
    result.suspicious_probability
  );

  elements.emailContext.textContent =
    detector.provider_label ||
    state?.provider_label ||
    provider.charAt(0).toUpperCase() + provider.slice(1);
  elements.emailResultTitle.textContent = emailTitleForSignal(signal);
  if (elements.emailMessage) {
    elements.emailMessage.textContent =
      result.message ||
      detector.message ||
      "Open an email to check its visible message.";
  }

  const sender = detector.sender || result.sender || "";
  const subject = detector.subject || result.subject || "";

  if (sender || subject) {
    elements.emailMetadata.classList.remove("hidden");
    elements.emailSender.textContent = sender || "Not shown";
    elements.emailSubject.textContent = subject || "No subject";
  } else {
    elements.emailMetadata.classList.add("hidden");
  }

  if (elements.emailScore) {
    elements.emailScore.textContent = percentage(
      result.suspicious_probability
    );
  }
  if (elements.emailThreshold) {
    elements.emailThreshold.textContent = percentage(result.threshold);
  }
  if (elements.emailTruncated) {
    elements.emailTruncated.textContent =
      typeof result.was_truncated === "boolean"
        ? result.was_truncated
          ? "Yes"
          : "No"
        : "--";
  }
}

function renderGuidance(state) {
  const websiteSignal =
    state?.url_detector?.result?.signal ||
    state?.url_detector?.signal ||
    "";
  const emailSignal =
    state?.email_detector?.result?.signal ||
    state?.email_detector?.signal ||
    "";
  const suspicious =
    websiteSignal === "SUSPICIOUS" || emailSignal === "SUSPICIOUS";

  elements.guidanceCard.className = suspicious
    ? "guidance-card warning"
    : "guidance-card";

  if (suspicious) {
    elements.guidanceTitle.textContent = "Stop and verify";
    elements.guidanceMessage.textContent =
      "A warning sign was found. Verify the request through an official channel before sharing passwords, OTPs, personal information, or payment details.";
    return;
  }

  elements.guidanceTitle.textContent = "Continue carefully";
  elements.guidanceMessage.textContent =
    "Verify unexpected requests before clicking, paying, or sharing information.";
}

function renderState(state) {
  renderWebsite(state);
  renderEmail(state);
  renderGuidance(state);
}

async function loadActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  const tab = tabs[0];
  activeTabId = tab?.id ?? null;
  return tab;
}

async function loadStoredState() {
  const stored = await chrome.storage.session.get([
    STORAGE_KEYS.tabStates,
    STORAGE_KEYS.server
  ]);

  renderServer(stored[STORAGE_KEYS.server]);

  const states = stored[STORAGE_KEYS.tabStates] || {};
  renderState(states[String(activeTabId)] || {});
}

async function configureAutoClose() {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.autoPopup);
  const popup = stored[STORAGE_KEYS.autoPopup];

  if (!popup || popup.consumed || popup.tab_id !== activeTabId) {
    return;
  }

  const remaining = popup.deadline - Date.now();

  if (remaining <= 0) {
    return;
  }

  await chrome.storage.session.set({
    [STORAGE_KEYS.autoPopup]: {
      ...popup,
      consumed: true,
      consumed_at: Date.now()
    }
  });

  elements.autoPopupBanner.classList.remove("hidden");

  const duration = Number(popup.duration_ms) || 5000;
  const startedAt = Date.now();

  function updateCountdown() {
    const elapsed = Date.now() - startedAt;
    const timeLeft = Math.max(0, remaining - elapsed);
    const seconds = Math.max(1, Math.ceil(timeLeft / 1000));
    const ratio = Math.max(0, Math.min(1, timeLeft / duration));

    elements.countdownText.textContent =
      `Closing in ${seconds} second${seconds === 1 ? "" : "s"}`;
    elements.countdownBar.style.transform = `scaleX(${ratio})`;

    if (timeLeft <= 0) {
      window.clearInterval(countdownTimer);
      window.close();
    }
  }

  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 100);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "session") {
    return;
  }

  if (changes[STORAGE_KEYS.server]) {
    renderServer(changes[STORAGE_KEYS.server].newValue);
  }

  if (changes[STORAGE_KEYS.tabStates] && activeTabId !== null) {
    const states = changes[STORAGE_KEYS.tabStates].newValue || {};
    renderState(states[String(activeTabId)] || {});
  }
});

async function initialize() {
  await loadActiveTab();
  await loadStoredState();
  await configureAutoClose();

  void chrome.runtime.sendMessage({
    type: "BANTAI_CHECK_SERVER"
  });

  /* A manual popup requests a fresh address-bar scan. */
  void chrome.runtime.sendMessage({
    type: "BANTAI_REFRESH_ACTIVE_TAB"
  });
}

void initialize();
