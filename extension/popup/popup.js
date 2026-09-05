const STORAGE_KEYS = {
  tabStates: "bantai_v110_tab_states",
  server: "bantai_v110_server",
  autoPopup: "bantai_v110_auto_popup",
  access: "bantai_v110_access",
  submittedUrlFeedback: "bantai_v110_submitted_url_feedback",
  submittedEmailFeedback: "bantai_v110_submitted_email_feedback"
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
  URGENCY: "it pushes you to act quickly",
  ACCOUNT_SECURITY_SCARE: "it tries to scare you about your account",
  CREDENTIAL_REQUEST: "it asks for your sign-in details",
  OTP_REQUEST: "it asks for a one-time password (OTP)",
  MPIN_REQUEST: "it asks for your mobile banking PIN",
  PASSWORD_REQUEST: "it asks for your password",
  PIN_OR_CVV_REQUEST: "it asks for a card PIN or security code",
  PRIZE_OR_REWARD: "it promises a prize or reward",
  ADVANCE_FEE: "it asks for money before giving a promised benefit",
  INVESTMENT_PROMISE: "it promises unusually certain investment earnings",
  JOB_OR_TASK_OFFER: "it uses a job or paid task to attract you",
  PAYMENT_REQUEST: "it asks you to send money",
  EMERGENCY_REQUEST: "it uses an emergency to ask for money",
  AUTHORITY_IMPERSONATION: "it may be pretending to be a trusted organization",
  ACTION_DEMAND: "it demands that you take action",
  THREAT_OR_COERCION: "it uses threats or pressure",
  DELIVERY_PAYMENT_REQUEST: "it asks for a parcel or delivery payment",
  AUTHORITY: "it uses authority to pressure you",
  FEAR: "it uses fear to make you act",
  SCARCITY: "it claims that time or slots are running out",
  REWARD: "it uses a promised reward to pressure you",
  FAMILIARITY: "it acts familiar while asking for private information",
  EMERGENCY: "it uses an emergency to pressure you",
  EMPLOYMENT_LURE: "it uses work or earnings to attract you",
  ADVANCE_FEE_MANIPULATION: "it requires payment before a promised benefit",
  CREDENTIAL_VERIFICATION_PRETEXT: "it uses verification as a reason to ask for sign-in details",
  IMPERSONATION: "it may be pretending to be a trusted person or organization",
  COERCION: "it threatens a consequence if you do not act",
  ROMANCE_OR_EMOTIONAL_MANIPULATION: "it uses emotions to ask for money",
  COMMITMENT_ESCALATION: "it keeps asking for another task or payment"
};

let activeTabId = null;
let countdownTimer = null;
let latestState = {};
let detectionEnabled = false;
let automaticPopupActive = false;
let reviewEventId = null;
let reviewBusy = false;
let submittedReviewIds = new Set();
let emailReviewEventId = null;
let emailReviewBusy = false;
let submittedEmailReviewIds = new Set();
let latestServerHealth = null;

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
  emailReviewCard: byId("emailReviewCard"),
  emailReviewForm: byId("emailReviewForm"),
  emailReviewCorrection: byId("emailReviewCorrection"),
  emailReviewReason: byId("emailReviewReason"),
  emailReviewConsent: byId("emailReviewConsent"),
  emailReviewSubmit: byId("emailReviewSubmit"),
  emailReviewMessage: byId("emailReviewMessage"),
  emailReviewComplete: byId("emailReviewComplete"),
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
    elements.emailReviewCard.classList.add("hidden");
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

function installedThreshold(kind, result = {}) {
  const detector = kind === "email"
    ? latestServerHealth?.email_detector
    : latestServerHealth?.url_detector;
  const installed = Number(detector?.threshold);
  if (Number.isFinite(installed)) return installed;

  const resultThreshold = Number(
    kind === "url"
      ? result.decision_threshold ?? result.threshold
      : result.threshold
  );
  return Number.isFinite(resultThreshold) ? resultThreshold : null;
}

function thresholdPercentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(4)}%` : "--";
}

function renderInstalledThresholds() {
  const urlResult = latestState?.url_detector?.result || {};
  const emailResult = latestState?.email_detector?.result || {};
  const urlThreshold = installedThreshold("url", urlResult);
  const emailThreshold = installedThreshold("email", emailResult);
  elements.websiteThreshold.textContent = thresholdPercentage(urlThreshold);
  elements.websiteThreshold.title = Number.isFinite(urlThreshold) ? String(urlThreshold) : "";
  elements.emailThreshold.textContent = thresholdPercentage(emailThreshold);
  elements.emailThreshold.title = Number.isFinite(emailThreshold) ? String(emailThreshold) : "";
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

function simpleWebsiteMessage(result) {
  if (result === "NO_STRONG_WARNING_SIGNS" || result === "SAFE") {
    return "BantAI did not find clear warning signs in this website address. It did not check the page itself, so this does not guarantee that the website is legitimate.";
  }
  if (result === "NEEDS_CAUTION") {
    return "This website address looks unusual. Check that it is spelled correctly and belongs to the organization you expect before entering personal information.";
  }
  if (result === "SUSPICIOUS_SIGNS_FOUND" || result === "SUSPICIOUS") {
    return "This website address shows warning signs often seen in fake or misleading sites. Do not enter passwords, one-time codes, or payment details unless you confirm the address through an official source.";
  }
  if (result === "UNAVAILABLE") {
    return "BantAI could not check this website right now. Avoid sharing private or payment information until the check is available.";
  }
  if (result === "ANALYZING" || result === "CHECKING") {
    return "BantAI is checking this website address. Please wait for the final result.";
  }
  return "BantAI checks only the website address shown in the browser.";
}

function indicatorLabels(state) {
  const combined = [
    ...(state?.local_indicators?.markers || []),
    ...(state?.llm_review?.indicators || [])
  ];
  const seenCategories = new Set();
  const seenLabels = new Set();
  const labels = [];
  for (const marker of combined) {
    const category = String(marker?.category || "").toUpperCase();
    const evidence = String(marker?.evidence || "").toLowerCase().replace(/\s+/g, " ");
    const inboundTransferNotice = category === "PAYMENT_REQUEST" && (
      evidence.includes("you have received") ||
      evidence.includes("you've received") ||
      (
        evidence.includes("transfer from:") &&
        evidence.includes("transfer to:") &&
        evidence.includes("transfer amount:")
      )
    );
    if (inboundTransferNotice) continue;
    if (!category || seenCategories.has(category)) continue;
    seenCategories.add(category);
    const label = INDICATOR_LABELS[category] || "it contains an unusual request";
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    labels.push(label);
    if (labels.length >= 5) break;
  }
  return labels;
}

function simpleEmailMessage(state, result) {
  if (result === "NO_STRONG_WARNING_SIGNS" || result === "SAFE") {
    return "BantAI did not find clear scam warning signs in this email. This does not guarantee that the sender or message is legitimate.";
  }
  if (result === "UNAVAILABLE") {
    return "BantAI could not finish checking this email. Be careful with links, attachments, money requests, and requests for private information.";
  }
  if (result === "ANALYZING" || result === "CHECKING" || result === "WAITING") {
    return "BantAI is checking this email. Please wait for the final result.";
  }

  const cloudReview = state?.llm_review || {};
  const cloudStatus = String(cloudReview.status || "").toUpperCase();
  const cloudCompleted = [
    "NO_STRONG_WARNING_SIGNS",
    "NEEDS_CAUTION",
    "SUSPICIOUS_SIGNS_FOUND"
  ].includes(cloudStatus);
  const cloudSummary = String(cloudReview.reasoning_summary || "").trim();
  const cloudAction = String(cloudReview.recommended_action || "").trim();
  if (
    cloudCompleted &&
    cloudReview.body_context_sent_to_provider === true &&
    cloudReview.sender_context_sent_to_provider === true &&
    cloudReview.subject_context_sent_to_provider === true &&
    cloudSummary
  ) {
    return [cloudSummary, cloudAction]
      .filter(Boolean)
      .join(" ");
  }

  const findings = indicatorLabels(state).slice(0, 2);
  const reason = findings.length
    ? `BantAI noticed that ${findings.join(" and ")}. `
    : result === "SUSPICIOUS_SIGNS_FOUND"
      ? "This email shows warning signs often used in scams. "
      : "Some parts of this email look unclear or unusual. ";
  const action = result === "SUSPICIOUS_SIGNS_FOUND"
    ? "Do not click links, send money, or share passwords, one-time codes, or personal details until you confirm the request through an official source."
    : "Check with the sender using a phone number, app, or website you already trust before clicking links, sending money, or sharing information.";
  return `${reason}${action}`;
}

function renderServer(server) {
  latestServerHealth = server?.detail && typeof server.detail === "object"
    ? server.detail
    : null;
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
  renderInstalledThresholds();
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
  elements.websiteMessage.textContent = simpleWebsiteMessage(finalResult);
  elements.websiteScore.textContent = percentage(result.suspicious_probability);
  const threshold = installedThreshold("url", result);
  elements.websiteThreshold.textContent = thresholdPercentage(threshold);
  elements.websiteThreshold.title = Number.isFinite(threshold) ? String(threshold) : "";
  elements.websiteModelSignal.textContent = result.signal || "--";
}

function selectedReviewValue(name) {
  return elements.reviewForm.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function feedbackErrorMessage(problem) {
  const fallback = "BantAI could not submit feedback. Try again shortly.";
  const detail = problem && typeof problem === "object" ? problem.detail : null;
  if (typeof detail === "string" && detail.length > 0 && detail.length <= 180) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const missingUrl = detail.some((item) =>
      Array.isArray(item?.loc) && item.loc.includes("url") && item?.type === "missing"
    );
    if (missingUrl) {
      return "Reload the BantAI extension, then submit this feedback again.";
    }
    const firstMessage = detail.find((item) => typeof item?.msg === "string" && item.msg.length <= 140)?.msg;
    if (firstMessage) {
      return firstMessage;
    }
  }
  return fallback;
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
  const url = state?.current_url || result.current_url || "";
  if (
    detector.state !== "complete" ||
    !clientEventId ||
    !url ||
    !["NO_STRONG_WARNING_SIGNS", "NEEDS_CAUTION", "SUSPICIOUS_SIGNS_FOUND"].includes(outcome)
  ) {
    return null;
  }
  return {clientEventId, outcome, url};
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

function selectedEmailReviewValue(name) {
  return elements.emailReviewForm.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function resetEmailReviewForm() {
  elements.emailReviewForm.reset();
  elements.emailReviewCorrection.classList.add("hidden");
  elements.emailReviewMessage.textContent = "";
  elements.emailReviewSubmit.disabled = true;
}

function updateEmailReviewControls() {
  const verdict = selectedEmailReviewValue("emailReviewVerdict");
  const classification = selectedEmailReviewValue("emailReviewClassification");
  const needsCorrection = verdict === "INCORRECT";
  elements.emailReviewCorrection.classList.toggle("hidden", !needsCorrection);
  if (!needsCorrection) {
    for (const input of elements.emailReviewForm.querySelectorAll('input[name="emailReviewClassification"]')) {
      input.checked = false;
    }
    elements.emailReviewReason.value = "";
  }
  elements.emailReviewSubmit.disabled = emailReviewBusy || !verdict || !elements.emailReviewConsent.checked || (needsCorrection && !classification);
}

function reviewableEmailResult(state) {
  const detector = state?.email_detector || {};
  const outcome = String(state?.fusion?.final_result || "").toUpperCase();
  const clientEventId = state?.hybrid_analysis_id;
  const provider = String(state?.provider || detector.provider || "").toLowerCase();
  if (
    detector.state !== "complete" ||
    !clientEventId ||
    !SUPPORTED_EMAIL_PROVIDERS.has(provider) ||
    !["NO_STRONG_WARNING_SIGNS", "NEEDS_CAUTION", "SUSPICIOUS_SIGNS_FOUND"].includes(outcome)
  ) {
    return null;
  }
  return {clientEventId, outcome, provider};
}

function renderEmailReview(state) {
  const review = reviewableEmailResult(state);
  if (!detectionEnabled || automaticPopupActive || !review) {
    elements.emailReviewCard.classList.add("hidden");
    return;
  }
  if (emailReviewEventId !== review.clientEventId) {
    emailReviewEventId = review.clientEventId;
    resetEmailReviewForm();
  }
  const submitted = submittedEmailReviewIds.has(review.clientEventId);
  elements.emailReviewCard.classList.remove("hidden");
  elements.emailReviewForm.classList.toggle("hidden", submitted);
  elements.emailReviewComplete.classList.toggle("hidden", !submitted);
}

async function loadSubmittedReviews() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.submittedUrlFeedback,
    STORAGE_KEYS.submittedEmailFeedback
  ]);
  const values = stored[STORAGE_KEYS.submittedUrlFeedback];
  submittedReviewIds = new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []);
  const emailValues = stored[STORAGE_KEYS.submittedEmailFeedback];
  submittedEmailReviewIds = new Set(Array.isArray(emailValues) ? emailValues.filter((value) => typeof value === "string") : []);
}

async function rememberSubmittedReview(clientEventId) {
  submittedReviewIds.add(clientEventId);
  const retained = [...submittedReviewIds].slice(-200);
  submittedReviewIds = new Set(retained);
  await chrome.storage.local.set({[STORAGE_KEYS.submittedUrlFeedback]: retained});
}

async function rememberSubmittedEmailReview(clientEventId) {
  submittedEmailReviewIds.add(clientEventId);
  const retained = [...submittedEmailReviewIds].slice(-200);
  submittedEmailReviewIds = new Set(retained);
  await chrome.storage.local.set({[STORAGE_KEYS.submittedEmailFeedback]: retained});
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

  const labels = indicatorLabels(state);
  elements.indicatorList.replaceChildren();
  for (const label of labels) {
    const item = document.createElement("li");
    item.textContent = label.charAt(0).toUpperCase() + label.slice(1);
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
  elements.emailDecisionMessage.textContent = simpleEmailMessage(state, fusionResult);
  elements.emailScore.textContent = percentage(result.suspicious_probability);
  const threshold = installedThreshold("email", result);
  elements.emailThreshold.textContent = thresholdPercentage(threshold);
  elements.emailThreshold.title = Number.isFinite(threshold) ? String(threshold) : "";
  elements.emailModelSignal.textContent = modelSignal;
  elements.emailTruncated.textContent = typeof result.was_truncated === "boolean" ? (result.was_truncated ? "Yes" : "No") : "--";

  renderIndicators(state, fusionResult);
}

function renderState(state) {
  latestState = state || {};
  renderWebsite(latestState);
  renderReview(latestState);
  renderEmail(latestState);
  renderEmailReview(latestState);
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
        url: review.url,
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
        message = feedbackErrorMessage(problem);
      } catch {
        // Keep the short local error for non-JSON failures.
      }
      throw new Error(message);
    }
    await rememberSubmittedReview(review.clientEventId);
    renderReview(latestState);
  } catch (error) {
    elements.reviewMessage.textContent = error instanceof TypeError
      ? "BantAI Companion is unavailable. Start or restart it, then try again."
      : error instanceof Error
        ? error.message
        : "BantAI could not submit feedback. Try again shortly.";
  } finally {
    reviewBusy = false;
    updateReviewControls();
  }
});

elements.emailReviewForm.addEventListener("change", () => {
  elements.emailReviewMessage.textContent = "";
  updateEmailReviewControls();
});

elements.emailReviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const review = reviewableEmailResult(latestState);
  const verdict = selectedEmailReviewValue("emailReviewVerdict");
  const classification = selectedEmailReviewValue("emailReviewClassification");
  const reason = elements.emailReviewReason.value;
  if (!review || review.clientEventId !== emailReviewEventId) {
    elements.emailReviewMessage.textContent = "This email result changed. Review the current result instead.";
    renderEmailReview(latestState);
    return;
  }
  if (!verdict || !elements.emailReviewConsent.checked || (verdict === "INCORRECT" && !classification)) {
    elements.emailReviewMessage.textContent = "Select your feedback and confirm the encrypted email report before submitting.";
    updateEmailReviewControls();
    return;
  }

  emailReviewBusy = true;
  elements.emailReviewMessage.textContent = "";
  updateEmailReviewControls();
  try {
    const response = await chrome.runtime.sendMessage({
      type: "BANTAI_SUBMIT_EMAIL_FEEDBACK",
      tab_id: activeTabId,
      verdict,
      classification: verdict === "INCORRECT" ? classification : undefined,
      reason: verdict === "INCORRECT" && reason ? reason : undefined,
      confirmed: true
    });
    if (!response?.ok) {
      throw new Error(response?.detail || "BantAI could not submit this email report.");
    }
    await rememberSubmittedEmailReview(review.clientEventId);
    renderEmailReview(latestState);
  } catch (error) {
    elements.emailReviewMessage.textContent = error instanceof Error
      ? error.message
      : "BantAI could not submit this email report. Try again shortly.";
  } finally {
    emailReviewBusy = false;
    updateEmailReviewControls();
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
    submittedEmailReviewIds.clear();
    reviewEventId = null;
    emailReviewEventId = null;
    await chrome.storage.local.remove([
      STORAGE_KEYS.submittedUrlFeedback,
      STORAGE_KEYS.submittedEmailFeedback
    ]);
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
