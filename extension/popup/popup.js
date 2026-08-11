const STORAGE_KEYS = {
  tabStates: "bantai_v110_tab_states",
  server: "bantai_v110_server",
  autoPopup: "bantai_v110_auto_popup",
  cloudReviewEnabled: "bantai_cloud_ai_review_enabled",
  cloudUrlReviewEnabled: "bantai_cloud_url_review_enabled"
};

const SUPPORTED_EMAIL_PROVIDERS = new Set(["gmail", "outlook", "yahoo"]);

const FINAL_LABELS = {
  NO_STRONG_WARNING_SIGNS: "NO STRONG WARNING SIGNS",
  NEEDS_CAUTION: "NEEDS CAUTION",
  SUSPICIOUS_SIGNS_FOUND: "SUSPICIOUS SIGNS FOUND",
  UNAVAILABLE: "UNABLE TO CHECK",
  WAITING: "WAITING",
  ANALYZING: "ANALYZING"
};

const INDICATOR_LABELS = {
  URGENCY: "Urgent action requested",
  ACCOUNT_SECURITY_SCARE: "Uses an account-security scare",
  CREDENTIAL_REQUEST: "Requests account credentials",
  OTP_REQUEST: "Message asks for an OTP",
  MPIN_REQUEST: "Message asks for an MPIN",
  PASSWORD_REQUEST: "Message asks for a password",
  PIN_OR_CVV_REQUEST: "Message asks for a PIN or CVV",
  PRIZE_OR_REWARD: "Promises a prize or reward",
  ADVANCE_FEE: "Requests payment before a promised benefit",
  INVESTMENT_PROMISE: "Promises unusually certain investment returns",
  JOB_OR_TASK_OFFER: "Uses a job or paid-task offer",
  PAYMENT_REQUEST: "Requests money or payment",
  EMERGENCY_REQUEST: "Uses an emergency money request",
  AUTHORITY_IMPERSONATION: "Claims to represent a trusted organization",
  ACTION_DEMAND: "Demands an action",
  THREAT_OR_COERCION: "Uses threats or pressure",
  DELIVERY_PAYMENT_REQUEST: "Requests a delivery or parcel payment",
  AUTHORITY: "Uses authority to pressure the reader",
  FEAR: "Uses fear to push an action",
  SCARCITY: "Uses a limited-time or limited-slot claim",
  REWARD: "Uses a promised reward as pressure",
  FAMILIARITY: "Claims familiarity while requesting something sensitive",
  EMERGENCY: "Uses an emergency as social pressure",
  EMPLOYMENT_LURE: "Uses work or earnings as a lure",
  ADVANCE_FEE_MANIPULATION: "Requires money before a promised benefit",
  CREDENTIAL_VERIFICATION_PRETEXT: "Uses verification as a reason to request credentials",
  IMPERSONATION: "May be impersonating a trusted person or organization",
  COERCION: "Uses coercion or a threatened consequence",
  ROMANCE_OR_EMOTIONAL_MANIPULATION: "Uses emotional pressure for money",
  COMMITMENT_ESCALATION: "Asks for another task or payment"
};

let activeTabId = null;
let countdownTimer = null;
let cloudReviewEnabled = false;
let cloudUrlReviewEnabled = false;
let backgroundSupportsCloudUrlReview = null;
let latestState = {};

const byId = (id) => document.getElementById(id);

const elements = {
  autoPopupBanner: byId("autoPopupBanner"),
  countdownText: byId("countdownText"),
  countdownBar: byId("countdownBar"),
  serverStatus: byId("serverStatus"),
  serverStatusText: byId("serverStatusText"),
  websiteCard: byId("websiteCard"),
  websiteDomain: byId("websiteDomain"),
  websiteStatus: byId("websiteStatus"),
  websiteMessage: byId("websiteMessage"),
  websiteAiReviewStatus: byId("websiteAiReviewStatus"),
  websiteAiReviewMessage: byId("websiteAiReviewMessage"),
  emailCard: byId("emailCard"),
  emailProvider: byId("emailProvider"),
  emailFinalStatus: byId("emailFinalStatus"),
  emailMetadata: byId("emailMetadata"),
  emailSender: byId("emailSender"),
  emailSubject: byId("emailSubject"),
  emailModelStatus: byId("emailModelStatus"),
  emailModelMessage: byId("emailModelMessage"),
  aiReviewCard: byId("aiReviewCard"),
  aiReviewStatus: byId("aiReviewStatus"),
  aiReviewMessage: byId("aiReviewMessage"),
  indicatorsCard: byId("indicatorsCard"),
  indicatorList: byId("indicatorList"),
  guidanceCard: byId("guidanceCard"),
  guidanceTitle: byId("guidanceTitle"),
  guidanceMessage: byId("guidanceMessage"),
  websiteScore: byId("websiteScore"),
  websiteThreshold: byId("websiteThreshold"),
  websiteModelSignal: byId("websiteModelSignal"),
  emailScore: byId("emailScore"),
  emailThreshold: byId("emailThreshold"),
  emailTruncated: byId("emailTruncated"),
  cloudReviewToggle: byId("cloudReviewToggle"),
  cloudSettingStatus: byId("cloudSettingStatus"),
  cloudPrivacyText: byId("cloudPrivacyText"),
  cloudUrlReviewToggle: byId("cloudUrlReviewToggle"),
  cloudUrlSettingStatus: byId("cloudUrlSettingStatus"),
  cloudUrlPrivacyText: byId("cloudUrlPrivacyText")
};

function percentage(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : "--";
}

function technicalStyle(signal) {
  const normalized = String(signal || "WAITING").toUpperCase();
  if (normalized === "SAFE") return "safe";
  if (normalized === "SUSPICIOUS") return "suspicious";
  if (normalized === "ANALYZING" || normalized === "CHECKING") return "analyzing";
  if (normalized === "UNAVAILABLE") return "unavailable";
  return "neutral";
}

function finalStyle(result) {
  if (result === "NO_STRONG_WARNING_SIGNS") return "safe";
  if (result === "NEEDS_CAUTION") return "caution";
  if (result === "SUSPICIOUS_SIGNS_FOUND") return "suspicious";
  if (result === "ANALYZING" || result === "CHECKING") return "analyzing";
  if (result === "UNAVAILABLE") return "unavailable";
  return "neutral";
}

function setStatus(element, label, style) {
  element.textContent = label;
  element.className = `${element === elements.emailFinalStatus ? "final-result" : element === elements.emailModelStatus ? "mini-badge" : "result-badge"} ${style}`;
}

function conciseCloudReviewMessage(status, isUrlReview = false) {
  const normalized = String(status || "OFF").toUpperCase();
  if (normalized === "NO_STRONG_WARNING_SIGNS") {
    return isUrlReview
      ? "No strong hostname warning signs were found. Page content and user accounts were not evaluated."
      : "No strong contextual warning signs were found. This does not guarantee that the message is legitimate.";
  }
  if (normalized === "NEEDS_CAUTION") {
    return isUrlReview
      ? "Some hostname details require caution. Verify the address before sharing sensitive information."
      : "Some details require caution. Verify unexpected requests through an official channel.";
  }
  if (normalized === "SUSPICIOUS_SIGNS_FOUND") {
    return isUrlReview
      ? "The hostname shows warning signs. Verify the address before entering sensitive information."
      : "The message contains warning signs. Do not share passwords, OTPs, or payment details until verified.";
  }
  if (normalized === "CHECKING") {
    return "Reviewing the available information.";
  }
  if (normalized === "UNAVAILABLE") {
    return isUrlReview
      ? "Cloud review is unavailable. The address-bar result still applies."
      : "Cloud review is unavailable. The local email result still applies.";
  }
  return "";
}

function renderServer(server) {
  if (server?.status === "connected") {
    elements.serverStatus.className = "server-status connected";
    elements.serverStatusText.textContent = "Ready";
  } else if (server?.status === "unavailable") {
    elements.serverStatus.className = "server-status unavailable";
    elements.serverStatusText.textContent = "Server off";
  } else {
    elements.serverStatus.className = "server-status checking";
    elements.serverStatusText.textContent = "Checking";
  }
}

function renderWebsite(state) {
  const detector = state?.url_detector || {};
  const result = detector.result || {};
  const finalResult = String(
    result.final_result || detector.signal || result.signal || "WAITING"
  ).toUpperCase();
  const style = FINAL_LABELS[finalResult]
    ? finalStyle(finalResult)
    : technicalStyle(finalResult);
  elements.websiteCard.className = `card ${style}`;
  elements.websiteDomain.textContent = result.hostname || state?.hostname || "Current browser tab";
  setStatus(
    elements.websiteStatus,
    finalResult === "UNAVAILABLE"
      ? "UNABLE TO CHECK"
      : FINAL_LABELS[finalResult] || finalResult,
    style
  );
  elements.websiteMessage.textContent = result.message || detector.message || "BantAI checks only the URL shown in the browser address bar.";
  elements.websiteScore.textContent = percentage(result.suspicious_probability);
  elements.websiteThreshold.textContent = percentage(result.threshold);
  elements.websiteModelSignal.textContent = result.signal || "--";

  const review = detector.cloud_review || result.llm_review || {};
  let reviewStatus = cloudUrlReviewEnabled
    ? String(review.status || "OFF").toUpperCase()
    : "OFF";
  if (
    cloudUrlReviewEnabled &&
    reviewStatus === "OFF" &&
    result.signal === "SAFE"
  ) {
    reviewStatus = "NOT_NEEDED";
  }
  setStatus(
    elements.websiteAiReviewStatus,
    reviewStatus === "UNAVAILABLE" && review.failure_reason === "QUOTA_REACHED"
      ? "QUOTA REACHED"
      : reviewStatus === "UNAVAILABLE"
        ? "UNAVAILABLE"
      : reviewStatus === "NOT_NEEDED"
        ? "NOT NEEDED"
        : FINAL_LABELS[reviewStatus] || reviewStatus,
    reviewStatus === "NOT_NEEDED" ? "safe" : finalStyle(reviewStatus)
  );
  if (cloudUrlReviewEnabled && backgroundSupportsCloudUrlReview === false) {
    setStatus(
      elements.websiteAiReviewStatus,
      "RELOAD REQUIRED",
      "unavailable"
    );
    elements.websiteAiReviewMessage.textContent =
      "The popup is newer than the background service worker. Reload BantAI on the extensions page.";
  } else {
    const reviewSummary = conciseCloudReviewMessage(reviewStatus, true);
    elements.websiteAiReviewMessage.textContent = cloudUrlReviewEnabled
      ? reviewStatus === "NOT_NEEDED"
        ? "The local URL model found no warning, so no cloud request was needed."
        : reviewSummary || "Cloud URL Review runs only when the local URL model warns."
      : "Cloud URL Review is off. Only the local URL model is used.";
  }
}

function renderIndicators(state, fusionResult) {
  if (![
    "NEEDS_CAUTION",
    "SUSPICIOUS_SIGNS_FOUND"
  ].includes(fusionResult)) {
    elements.indicatorsCard.classList.add("hidden");
    elements.indicatorList.replaceChildren();
    return;
  }

  const combined = [
    ...(state?.local_indicators?.markers || []),
    ...(state?.llm_review?.indicators || [])
  ];
  const seen = new Set();
  const labels = [];
  for (const marker of combined) {
    const category = String(marker?.category || "").toUpperCase();
    if (!category || seen.has(category)) continue;
    seen.add(category);
    labels.push(INDICATOR_LABELS[category] || marker.evidence || category.replaceAll("_", " "));
    if (labels.length >= 5) break;
  }
  elements.indicatorList.replaceChildren();
  for (const label of labels) {
    const item = document.createElement("li");
    item.textContent = label;
    elements.indicatorList.append(item);
  }
  elements.indicatorsCard.classList.toggle("hidden", labels.length === 0);
}

function renderEmail(state) {
  const detector = state?.email_detector || {};
  const result = detector.result || {};
  const provider = String(state?.provider || detector.provider || result.provider || "").toLowerCase();
  if (!SUPPORTED_EMAIL_PROVIDERS.has(provider)) {
    elements.emailCard.classList.add("hidden");
    elements.aiReviewCard.classList.add("hidden");
    elements.indicatorsCard.classList.add("hidden");
    renderGuidance(state, null);
    return;
  }

  elements.emailCard.classList.remove("hidden");
  elements.aiReviewCard.classList.remove("hidden");
  elements.emailProvider.textContent = detector.provider_label || state.provider_label || provider;

  const fusionResult = state?.fusion?.final_result || (detector.state === "analyzing" ? "ANALYZING" : detector.signal || "WAITING");
  const fusionStyle = finalStyle(fusionResult);
  elements.emailCard.className = `card ${fusionStyle}`;
  setStatus(elements.emailFinalStatus, FINAL_LABELS[fusionResult] || fusionResult, fusionStyle);

  const sender = detector.sender || result.sender || "";
  const subject = detector.subject || result.subject || "";
  elements.emailMetadata.classList.toggle("hidden", !sender && !subject);
  elements.emailSender.textContent = sender || "Not shown";
  elements.emailSubject.textContent = subject || "No subject";

  const modelSignal = String(result.signal || detector.signal || "WAITING").toUpperCase();
  setStatus(
    elements.emailModelStatus,
    modelSignal === "UNAVAILABLE" ? "UNABLE TO CHECK" : modelSignal,
    technicalStyle(modelSignal)
  );
  elements.emailModelMessage.textContent = result.message || detector.message || "Open an email to run the local detector.";
  elements.emailScore.textContent = percentage(result.suspicious_probability);
  elements.emailThreshold.textContent = percentage(result.threshold);
  elements.emailTruncated.textContent = typeof result.was_truncated === "boolean" ? (result.was_truncated ? "Yes" : "No") : "--";

  const review = state?.llm_review || {};
  const reviewStatus = cloudReviewEnabled ? String(review.status || "OFF").toUpperCase() : "OFF";
  setStatus(
    elements.aiReviewStatus,
    reviewStatus === "UNAVAILABLE" ? "UNAVAILABLE" : FINAL_LABELS[reviewStatus] || reviewStatus,
    finalStyle(reviewStatus)
  );
  const reviewSummary = conciseCloudReviewMessage(reviewStatus);
  elements.aiReviewMessage.textContent = cloudReviewEnabled
    ? reviewSummary || "Open or reopen an email to use Cloud AI Review."
    : "Cloud AI Review is off. Your email is checked only by BantAI's local detectors.";

  renderIndicators(state, fusionResult);
  renderGuidance(state, fusionResult);
}

function renderGuidance(state, fusionResult) {
  const websiteSignal = state?.url_detector?.result?.final_result || state?.url_detector?.signal;
  if (fusionResult && FINAL_LABELS[fusionResult]) {
    const style = finalStyle(fusionResult);
    elements.guidanceCard.className = `guidance ${style}`;
    elements.guidanceTitle.textContent = FINAL_LABELS[fusionResult];
    elements.guidanceMessage.textContent = state?.fusion?.message || "Continue carefully and verify unexpected requests.";
    return;
  }
  if (websiteSignal === "SUSPICIOUS" || websiteSignal === "SUSPICIOUS_SIGNS_FOUND") {
    elements.guidanceCard.className = "guidance suspicious";
    elements.guidanceTitle.textContent = "SUSPICIOUS SIGNS FOUND";
    elements.guidanceMessage.textContent = "Warning signs were found in this web address. Verify it before entering passwords, OTPs, personal information, or payment details.";
    return;
  }
  if (websiteSignal === "NEEDS_CAUTION") {
    elements.guidanceCard.className = "guidance caution";
    elements.guidanceTitle.textContent = "NEEDS CAUTION";
    elements.guidanceMessage.textContent = state?.url_detector?.result?.message || "Some details require caution. Verify the address before sharing sensitive information.";
    return;
  }
  elements.guidanceCard.className = "guidance neutral";
  elements.guidanceTitle.textContent = "Continue carefully";
  elements.guidanceMessage.textContent = "Verify unexpected requests before clicking, paying, or sharing information.";
}

function renderState(state) {
  latestState = state || {};
  renderWebsite(latestState);
  renderEmail(latestState);
}

function renderCloudSetting() {
  elements.cloudReviewToggle.checked = cloudReviewEnabled;
  elements.cloudSettingStatus.textContent = cloudReviewEnabled ? "ON" : "OFF";
  elements.cloudPrivacyText.textContent = cloudReviewEnabled
    ? "BantAI may send a limited, cleaned version of the opened email to the configured AI service for additional scam analysis."
    : "Your email is checked only by BantAI's local detectors.";
}

function renderCloudUrlSetting() {
  elements.cloudUrlReviewToggle.checked = cloudUrlReviewEnabled;
  elements.cloudUrlSettingStatus.textContent = cloudUrlReviewEnabled ? "ON" : "OFF";
  elements.cloudUrlPrivacyText.textContent = cloudUrlReviewEnabled
    ? "After a local URL warning, BantAI may send only the website origin to the configured AI service. Page content and browsing paths are not shared."
    : "Website addresses are checked only by BantAI's local URL model.";
}

async function loadActiveTab() {
  const tabs = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  activeTabId = tabs[0]?.id ?? null;
}

async function loadCloudSetting() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.cloudReviewEnabled);
  cloudReviewEnabled = stored[STORAGE_KEYS.cloudReviewEnabled] === true;
  renderCloudSetting();
}

async function loadCloudUrlSetting() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.cloudUrlReviewEnabled);
  cloudUrlReviewEnabled = stored[STORAGE_KEYS.cloudUrlReviewEnabled] === true;
  renderCloudUrlSetting();
}

async function checkBackgroundCapabilities() {
  try {
    const capabilities = await chrome.runtime.sendMessage({
      type: "BANTAI_GET_CAPABILITIES"
    });
    backgroundSupportsCloudUrlReview = capabilities?.cloud_url_review === true;
  } catch {
    backgroundSupportsCloudUrlReview = false;
  }
}

async function loadStoredState() {
  const stored = await chrome.storage.session.get([STORAGE_KEYS.tabStates, STORAGE_KEYS.server]);
  renderServer(stored[STORAGE_KEYS.server]);
  const states = stored[STORAGE_KEYS.tabStates] || {};
  renderState(states[String(activeTabId)] || {});
}

async function configureAutoClose() {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.autoPopup);
  const popup = stored[STORAGE_KEYS.autoPopup];
  if (!popup || popup.consumed || popup.tab_id !== activeTabId) return;
  const remaining = popup.deadline - Date.now();
  if (remaining <= 0) return;
  await chrome.storage.session.set({
    [STORAGE_KEYS.autoPopup]: {...popup, consumed: true, consumed_at: Date.now()}
  });
  const startedAt = Date.now();
  const duration = Number(popup.duration_ms) || 5000;
  function updateCountdown() {
    const timeLeft = Math.max(0, remaining - (Date.now() - startedAt));
    elements.countdownText.textContent = `Closing in ${Math.max(1, Math.ceil(timeLeft / 1000))} seconds`;
    elements.countdownBar.style.transform = `scaleX(${Math.max(0, Math.min(1, timeLeft / duration))})`;
    if (timeLeft <= 0) {
      window.clearInterval(countdownTimer);
      window.close();
    }
  }
  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 100);
}

elements.cloudReviewToggle.addEventListener("change", async () => {
  cloudReviewEnabled = elements.cloudReviewToggle.checked === true;
  await chrome.storage.local.set({[STORAGE_KEYS.cloudReviewEnabled]: cloudReviewEnabled});
  renderCloudSetting();
  renderEmail(latestState);
  void chrome.runtime.sendMessage({
    type: "BANTAI_CLOUD_REVIEW_SETTING_CHANGED",
    enabled: cloudReviewEnabled
  });
});

elements.cloudUrlReviewToggle.addEventListener("change", async () => {
  cloudUrlReviewEnabled = elements.cloudUrlReviewToggle.checked === true;
  await chrome.storage.local.set({
    [STORAGE_KEYS.cloudUrlReviewEnabled]: cloudUrlReviewEnabled
  });
  renderCloudUrlSetting();
  renderWebsite(latestState);
  void chrome.runtime.sendMessage({
    type: "BANTAI_CLOUD_URL_REVIEW_SETTING_CHANGED",
    enabled: cloudUrlReviewEnabled
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "session") {
    if (changes[STORAGE_KEYS.server]) renderServer(changes[STORAGE_KEYS.server].newValue);
    if (changes[STORAGE_KEYS.tabStates] && activeTabId !== null) {
      const states = changes[STORAGE_KEYS.tabStates].newValue || {};
      renderState(states[String(activeTabId)] || {});
    }
  }
  if (areaName === "local" && changes[STORAGE_KEYS.cloudReviewEnabled]) {
    cloudReviewEnabled = changes[STORAGE_KEYS.cloudReviewEnabled].newValue === true;
    renderCloudSetting();
    renderEmail(latestState);
  }
  if (areaName === "local" && changes[STORAGE_KEYS.cloudUrlReviewEnabled]) {
    cloudUrlReviewEnabled = changes[STORAGE_KEYS.cloudUrlReviewEnabled].newValue === true;
    renderCloudUrlSetting();
    renderWebsite(latestState);
  }
});

async function initialize() {
  await loadActiveTab();
  await loadCloudSetting();
  await loadCloudUrlSetting();
  await checkBackgroundCapabilities();
  await loadStoredState();
  await configureAutoClose();
  void chrome.runtime.sendMessage({type: "BANTAI_CHECK_SERVER"});
  /* Manual opening requests a fresh tab.url scan but does not start auto-close. */
  void chrome.runtime.sendMessage({type: "BANTAI_REFRESH_ACTIVE_TAB"});
}

void initialize();
