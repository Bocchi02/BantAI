const STORAGE_KEYS = {
  tabStates: "bantai_v110_tab_states",
  server: "bantai_v110_server",
  autoPopup: "bantai_v110_auto_popup",
  access: "bantai_v110_access",
  submittedUrlFeedback: "bantai_v110_submitted_url_feedback"
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
let latestState = {};
let detectionEnabled = false;
let automaticPopupActive = false;
let reviewEventId = null;
let reviewBusy = false;
let submittedReviewIds = new Set();

const byId = (id) => document.getElementById(id);

const elements = {
  autoPopupBanner: byId("autoPopupBanner"),
  countdownText: byId("countdownText"),
  countdownBar: byId("countdownBar"),
  detectionContent: byId("detectionContent"),
  safeNote: byId("safeNote"),
  serverStatus: byId("serverStatus"),
  serverStatusText: byId("serverStatusText"),
  websiteCard: byId("websiteCard"),
  websiteDomain: byId("websiteDomain"),
  websiteStatus: byId("websiteStatus"),
  websiteMessage: byId("websiteMessage"),
  emailCard: byId("emailCard"),
  emailProvider: byId("emailProvider"),
  emailFinalStatus: byId("emailFinalStatus"),
  emailMetadata: byId("emailMetadata"),
  emailSender: byId("emailSender"),
  emailSubject: byId("emailSubject"),
  emailDecisionMessage: byId("emailDecisionMessage"),
  indicatorsCard: byId("indicatorsCard"),
  indicatorList: byId("indicatorList"),
  websiteScore: byId("websiteScore"),
  websiteThreshold: byId("websiteThreshold"),
  websiteModelSignal: byId("websiteModelSignal"),
  reviewCard: byId("reviewCard"),
  reviewForm: byId("reviewForm"),
  reviewCorrection: byId("reviewCorrection"),
  reviewReason: byId("reviewReason"),
  reviewSubmit: byId("reviewSubmit"),
  reviewMessage: byId("reviewMessage"),
  reviewComplete: byId("reviewComplete"),
  emailScore: byId("emailScore"),
  emailThreshold: byId("emailThreshold"),
  emailModelSignal: byId("emailModelSignal"),
  emailTruncated: byId("emailTruncated"),
  pairingCard: byId("pairingCard"),
  pairingState: byId("pairingState"),
  pairingMessage: byId("pairingMessage"),
  pairingForm: byId("pairingForm"),
  pairingCode: byId("pairingCode"),
  pairingButton: byId("pairingButton"),
  unpairButton: byId("unpairButton")
};

function setDetectionVisibility(enabled) {
  detectionEnabled = enabled === true;
  elements.detectionContent.classList.toggle("hidden", !detectionEnabled);
  elements.safeNote.classList.toggle("hidden", !detectionEnabled);
  elements.serverStatus.classList.toggle("hidden", !detectionEnabled);
  elements.pairingCard.classList.toggle("access-required", !detectionEnabled);
  elements.detectionContent.setAttribute("aria-hidden", String(!detectionEnabled));

  if (!detectionEnabled) {
    elements.reviewCard.classList.add("hidden");
    elements.autoPopupBanner.classList.add("hidden");
    const details = byId("moreDetails");
    if (details) details.open = false;
    if (countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }
}

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
  element.className = `${element === elements.emailFinalStatus ? "final-result" : "result-badge"} ${style}`;
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
}

function selectedReviewValue(name) {
  return elements.reviewForm.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function resetReviewForm() {
  elements.reviewForm.reset();
  elements.reviewCorrection.classList.add("hidden");
  elements.reviewMessage.textContent = "";
  elements.reviewSubmit.disabled = true;
}

function updateReviewControls() {
  const verdict = selectedReviewValue("reviewVerdict");
  const classification = selectedReviewValue("reviewClassification");
  const needsCorrection = verdict === "INCORRECT";
  elements.reviewCorrection.classList.toggle("hidden", !needsCorrection);
  if (!needsCorrection) {
    for (const input of elements.reviewForm.querySelectorAll('input[name="reviewClassification"]')) {
      input.checked = false;
    }
    elements.reviewReason.value = "";
  }
  elements.reviewSubmit.disabled = reviewBusy || !verdict || (needsCorrection && !classification);
}

function reviewableUrlResult(state) {
  const detector = state?.url_detector || {};
  const result = detector.result || {};
  const outcome = String(result.final_result || detector.signal || result.signal || "").toUpperCase();
  const clientEventId = detector.activity_event_id;
  if (
    detector.state !== "complete" ||
    !clientEventId ||
    !["NO_STRONG_WARNING_SIGNS", "NEEDS_CAUTION", "SUSPICIOUS_SIGNS_FOUND"].includes(outcome)
  ) {
    return null;
  }
  return {clientEventId, outcome};
}

function renderReview(state) {
  const review = reviewableUrlResult(state);
  if (!detectionEnabled || automaticPopupActive || !review) {
    elements.reviewCard.classList.add("hidden");
    return;
  }
  if (reviewEventId !== review.clientEventId) {
    reviewEventId = review.clientEventId;
    resetReviewForm();
  }
  const submitted = submittedReviewIds.has(review.clientEventId);
  elements.reviewCard.classList.remove("hidden");
  elements.reviewForm.classList.toggle("hidden", submitted);
  elements.reviewComplete.classList.toggle("hidden", !submitted);
}

async function loadSubmittedReviews() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.submittedUrlFeedback);
  const values = stored[STORAGE_KEYS.submittedUrlFeedback];
  submittedReviewIds = new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []);
}

async function rememberSubmittedReview(clientEventId) {
  submittedReviewIds.add(clientEventId);
  const retained = [...submittedReviewIds].slice(-200);
  submittedReviewIds = new Set(retained);
  await chrome.storage.local.set({[STORAGE_KEYS.submittedUrlFeedback]: retained});
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
    elements.indicatorsCard.classList.add("hidden");
    return;
  }

  elements.emailCard.classList.remove("hidden");
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
  elements.emailDecisionMessage.textContent = state?.fusion?.message || detector.message || "Analyzing the opened email.";
  elements.emailScore.textContent = percentage(result.suspicious_probability);
  elements.emailThreshold.textContent = percentage(result.threshold);
  elements.emailModelSignal.textContent = modelSignal;
  elements.emailTruncated.textContent = typeof result.was_truncated === "boolean" ? (result.was_truncated ? "Yes" : "No") : "--";

  renderIndicators(state, fusionResult);
}

function renderState(state) {
  latestState = state || {};
  renderWebsite(latestState);
  renderReview(latestState);
  renderEmail(latestState);
}

async function loadActiveTab() {
  const tabs = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  activeTabId = tabs[0]?.id ?? null;
}

async function loadStoredState() {
  if (!detectionEnabled) return;
  const stored = await chrome.storage.session.get([STORAGE_KEYS.tabStates, STORAGE_KEYS.server]);
  renderServer(stored[STORAGE_KEYS.server]);
  const states = stored[STORAGE_KEYS.tabStates] || {};
  renderState(states[String(activeTabId)] || {});
}

async function loadPairingState() {
  try {
    const response = await fetch("http://127.0.0.1:8000/companion/status", {cache: "no-store"});
    if (!response.ok) throw new Error("Companion unavailable");
    const state = await response.json();
    const enabled = state.detection_enabled === true;
    setDetectionVisibility(enabled);
    if (enabled) {
      elements.pairingState.textContent = "Connected";
      elements.pairingMessage.textContent = `Detection and activity are connected to ${state.user_email || "your BantAI account"}.`;
      elements.pairingForm.classList.add("hidden");
      elements.unpairButton.classList.remove("hidden");
    } else if (state.paired) {
      elements.pairingState.textContent = "Verification needed";
      elements.pairingMessage.textContent = state.access_message || "This device connection is expired or unavailable. Disconnect it, then pair it again.";
      elements.pairingForm.classList.add("hidden");
      elements.unpairButton.classList.remove("hidden");
    } else if (!state.platform_configured) {
      elements.pairingState.textContent = "Setup needed";
      elements.pairingMessage.textContent = "Detection is off. Restart BantAI Companion so it can connect to the local web service.";
      elements.pairingForm.classList.add("hidden");
      elements.unpairButton.classList.add("hidden");
    } else {
      elements.pairingState.textContent = "Not connected";
      elements.pairingMessage.textContent = "Detection is off. Generate a pairing code from the BantAI web dashboard, then enter it here.";
      elements.pairingForm.classList.remove("hidden");
      elements.unpairButton.classList.add("hidden");
    }
    return enabled;
  } catch {
    setDetectionVisibility(false);
    elements.pairingState.textContent = "Unavailable";
    elements.pairingMessage.textContent = "Detection is off. Start BantAI Companion before connecting your web account.";
    elements.pairingForm.classList.add("hidden");
    elements.unpairButton.classList.add("hidden");
    return false;
  }
}

elements.reviewForm.addEventListener("change", () => {
  elements.reviewMessage.textContent = "";
  updateReviewControls();
});

elements.reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const review = reviewableUrlResult(latestState);
  const verdict = selectedReviewValue("reviewVerdict");
  const classification = selectedReviewValue("reviewClassification");
  const reason = elements.reviewReason.value;
  if (!review || review.clientEventId !== reviewEventId) {
    elements.reviewMessage.textContent = "This website result changed. Review the current result instead.";
    renderReview(latestState);
    return;
  }
  if (!verdict || (verdict === "INCORRECT" && !classification)) {
    elements.reviewMessage.textContent = "Select your feedback before submitting.";
    updateReviewControls();
    return;
  }

  reviewBusy = true;
  elements.reviewMessage.textContent = "";
  updateReviewControls();
  try {
    const response = await fetch("http://127.0.0.1:8000/companion/url-feedback", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        client_event_id: review.clientEventId,
        verdict,
        classification: verdict === "INCORRECT" ? classification : undefined,
        reason: verdict === "INCORRECT" && reason ? reason : undefined,
        confirmed: true
      })
    });
    if (!response.ok) {
      let message = "BantAI could not submit feedback. Try again shortly.";
      try {
        const problem = await response.json();
        if (typeof problem.detail === "string" && problem.detail.length <= 180) {
          message = problem.detail;
        }
      } catch {
        // Keep the short local error for non-JSON failures.
      }
      throw new Error(message);
    }
    await rememberSubmittedReview(review.clientEventId);
    renderReview(latestState);
  } catch (error) {
    elements.reviewMessage.textContent = error instanceof Error
      ? error.message
      : "BantAI could not submit feedback. Try again shortly.";
  } finally {
    reviewBusy = false;
    updateReviewControls();
  }
});

elements.pairingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = elements.pairingCode.value.replace(/\s+/g, "").toUpperCase();
  elements.pairingButton.disabled = true;
  elements.pairingMessage.textContent = "Connecting this computer…";
  try {
    const response = await fetch("http://127.0.0.1:8000/companion/pair", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({code, device_label: `BantAI on ${navigator.platform || "Windows"}`})
    });
    if (!response.ok) {
      let message = "That code is invalid, expired, or the shared service is unavailable.";
      try {
        const problem = await response.json();
        if (typeof problem.detail === "string" && problem.detail.length <= 160) {
          message = problem.detail;
        }
      } catch {
        // Keep the privacy-safe generic message for non-JSON failures.
      }
      throw new Error(message);
    }
    elements.pairingCode.value = "";
    const enabled = await loadPairingState();
    await chrome.runtime.sendMessage({type: "BANTAI_PAIRING_CHANGED"});
    if (enabled) {
      await loadStoredState();
    }
  } catch (error) {
    elements.pairingState.textContent = "Try again";
    elements.pairingMessage.textContent = error instanceof Error
      ? error.message
      : "That code is invalid, expired, or the shared service is unavailable.";
  } finally {
    elements.pairingButton.disabled = false;
  }
});

elements.unpairButton.addEventListener("click", async () => {
  elements.unpairButton.disabled = true;
  elements.pairingMessage.textContent = "Disconnecting this computer…";
  try {
    const response = await fetch("http://127.0.0.1:8000/companion/unpair", {method: "POST"});
    if (!response.ok) throw new Error("Disconnect failed");
    submittedReviewIds.clear();
    reviewEventId = null;
    await chrome.storage.local.remove(STORAGE_KEYS.submittedUrlFeedback);
    await loadPairingState();
    await chrome.runtime.sendMessage({type: "BANTAI_PAIRING_CHANGED"});
  } catch {
    elements.pairingState.textContent = "Try again";
    elements.pairingMessage.textContent = "BantAI could not remove the local device credential.";
  } finally {
    elements.unpairButton.disabled = false;
  }
});

async function configureAutoClose() {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.autoPopup);
  const popup = stored[STORAGE_KEYS.autoPopup];
  if (!popup || popup.consumed || popup.tab_id !== activeTabId) return;
  const remaining = popup.deadline - Date.now();
  if (remaining <= 0) return;
  automaticPopupActive = true;
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "session") {
    if (changes[STORAGE_KEYS.access]) {
      setDetectionVisibility(changes[STORAGE_KEYS.access].newValue?.enabled === true);
    }
    if (detectionEnabled && changes[STORAGE_KEYS.server]) renderServer(changes[STORAGE_KEYS.server].newValue);
    if (detectionEnabled && changes[STORAGE_KEYS.tabStates] && activeTabId !== null) {
      const states = changes[STORAGE_KEYS.tabStates].newValue || {};
      renderState(states[String(activeTabId)] || {});
    }
  }
});

async function initialize() {
  await loadActiveTab();
  await loadSubmittedReviews();
  const enabled = await loadPairingState();
  if (enabled) {
    await configureAutoClose();
    await loadStoredState();
    void chrome.runtime.sendMessage({type: "BANTAI_CHECK_SERVER"});
    /* Manual opening requests a fresh tab.url scan but does not start auto-close. */
    void chrome.runtime.sendMessage({type: "BANTAI_REFRESH_ACTIVE_TAB"});
  }
}

void initialize();
