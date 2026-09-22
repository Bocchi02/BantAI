importScripts("../config.js");

const VERSION =
  "1.1.0";

const API_BASE = String(
  globalThis.BANTAI_CONFIG?.apiBase || ""
).replace(/\/$/, "");

const apiEndpoint = new URL(API_BASE);
const localDockerApi = globalThis.BANTAI_CONFIG?.allowHttpLoopback === true
  && apiEndpoint.protocol === "http:"
  && ["localhost", "127.0.0.1"].includes(apiEndpoint.hostname);
if (apiEndpoint.protocol !== "https:" && !localDockerApi) {
  throw new Error("BantAI remote API configuration must use HTTPS.");
}

const STORAGE_KEYS = {
  tabStates:
    "bantai_v110_tab_states",
  server:
    "bantai_v110_server",
  autoPopup:
    "bantai_v110_auto_popup",
  autoPopupSites:
    "bantai_v110_auto_popup_sites",
  access:
    "bantai_v110_access",
  collectionDiagnostics:
    "bantai_v110_collection_diagnostics",
  deviceCredential:
    "bantai_v110_device_credential"
};

const AUTO_POPUP_DURATION_MS =
  5000;

const EMAIL_PROVIDERS = [
  {
    id:
      "gmail",
    label:
      "Gmail",
    urlPrefixes: [
      "https://mail.google.com/"
    ],
    queryPatterns: [
      "https://mail.google.com/*"
    ],
    scriptFile:
      "content/gmail-extractor.js"
  },
  {
    id:
      "outlook",
    label:
      "Outlook",
    urlPrefixes: [
      "https://outlook.live.com/",
      "https://outlook.office.com/",
      "https://outlook.office365.com/",
      "https://outlook.cloud.microsoft/"
    ],
    queryPatterns: [
      "https://outlook.live.com/*",
      "https://outlook.office.com/*",
      "https://outlook.office365.com/*",
      "https://outlook.cloud.microsoft/*"
    ],
    scriptFile:
      "content/outlook-extractor.js"
  },
  {
    id:
      "yahoo",
    label:
      "Yahoo Mail",
    urlPrefixes: [
      "https://mail.yahoo.com/"
    ],
    queryPatterns: [
      "https://mail.yahoo.com/*"
    ],
    scriptFile:
      "content/yahoo-extractor.js"
  }
];

const EMAIL_FEEDBACK_REQUEST_TYPES = {
  gmail:
    "BANTAI_GMAIL_GET_OPEN_EMAIL",
  outlook:
    "BANTAI_OUTLOOK_GET_OPEN_EMAIL",
  yahoo:
    "BANTAI_YAHOO_GET_OPEN_EMAIL"
};

const urlSequences =
  new Map();

const urlAnalysisRequests =
  new Map();

const emailSequences =
  new Map();

const tabUpdateQueues =
  new Map();

const popupFingerprints =
  new Map();

const automaticPopupStates =
  new Map();

const dangerModalRequests =
  new Map();

const DETECTION_ACCESS_CACHE_MS =
  10000;

const detectionAccessCache = {
  enabled: false,
  checkedAt: 0,
  inFlight: null
};


class PairingRequiredError extends Error {
  constructor(
    message = "Pair this device with a BantAI account to enable detection."
  ) {
    super(message);
    this.name =
      "PairingRequiredError";
  }
}


function isPairingRequiredError(
  error
) {
  return error instanceof
    PairingRequiredError;
}

const COMPLETE_CLOUD_STATUSES =
  new Set([
    "NO_STRONG_WARNING_SIGNS",
    "NEEDS_CAUTION",
    "SUSPICIOUS_SIGNS_FOUND"
  ]);


function nowIso() {
  return new Date()
    .toISOString();
}


async function restrictCredentialStorage() {
  try {
    await chrome.storage.local.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS"
    });
    await chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS"
    });
  } catch {
    // Chrome 127+ supports these APIs. Detection remains off if the credential
    // cannot subsequently be read by the trusted service worker.
  }
}


async function deviceCredential() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.deviceCredential);
  return String(stored[STORAGE_KEYS.deviceCredential] || "");
}


async function authenticatedFetch(path, options = {}) {
  const token = await deviceCredential();
  if (!token) {
    throw new PairingRequiredError();
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });
  if (response.status === 401 || response.status === 403) {
    await chrome.storage.local.remove(STORAGE_KEYS.deviceCredential);
    throw new PairingRequiredError(
      response.status === 403
        ? "This BantAI account is unavailable."
        : "This extension connection was revoked. Connect it again."
    );
  }
  return response;
}


async function responseProblem(response, fallback) {
  try {
    const problem = await response.json();
    if (typeof problem?.detail === "string" && problem.detail.length <= 200) {
      return problem.detail;
    }
  } catch {
    // Return the privacy-safe fallback for non-JSON gateway failures.
  }
  return fallback;
}


function providerForUrl(
  url
) {
  const value =
    String(
      url ||
      ""
    );

  return (
    EMAIL_PROVIDERS.find(
      (provider) =>
        provider
          .urlPrefixes
          .some(
            (prefix) =>
              value.startsWith(
                prefix
              )
          )
    ) ||
    null
  );
}


function canScanAddressBarUrl(
  url
) {
  try {
    const parsed =
      new URL(
        String(
          url ||
          ""
        )
      );

    return (
      parsed.protocol ===
        "http:" ||
      parsed.protocol ===
        "https:"
    );
  } catch {
    return false;
  }
}


function hostnameForUrl(
  url
) {
  try {
    return new URL(
      String(
        url ||
        ""
      )
    ).hostname;
  } catch {
    return "";
  }
}


function popupSiteForUrl(url) {
  const hostname = hostnameForUrl(url).toLowerCase().replace(/\.$/, "");
  if (!hostname) return "";
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return "localhost";
  if (hostname.includes(":") || /^\d+(?:\.\d+){3}$/.test(hostname)) {
    return hostname;
  }

  const labels = hostname.split(".");
  if (labels.length < 2) return hostname;
  // Keep common second-level country-code suffixes together without
  // grouping unrelated sites such as example.co.uk and another.co.uk.
  const commonCcSecondLevels = new Set([
    "ac", "co", "com", "edu", "go", "gov", "mil", "ne", "net", "or", "org"
  ]);
  const sharedHostingSuffixes = new Set([
    "appspot.com", "azurewebsites.net", "blogspot.com", "cloudfront.net",
    "github.io", "gitlab.io", "netlify.app", "pages.dev", "vercel.app"
  ]);
  const lastTwo = labels.slice(-2).join(".");
  const suffixLabels = (
    (labels.at(-1).length === 2 && commonCcSecondLevels.has(labels.at(-2))) ||
    sharedHostingSuffixes.has(lastTwo)
  ) ? 3 : 2;
  return labels.slice(-suffixLabels).join(".");
}


async function popupSiteFingerprint(url) {
  const site = popupSiteForUrl(url);
  if (!site) return "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(site)
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}


function compactHash(
  value
) {
  const text =
    String(
      value ??
      ""
    );

  let hash =
    2166136261;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash ^=
      text.charCodeAt(
        index
      );

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return (
    hash >>> 0
  ).toString(
    16
  );
}


function buildEmailFingerprint(
  payload
) {
  return [
    payload?.provider ||
      "unknown",
    compactHash(
      payload?.sender ||
      ""
    ),
    compactHash(
      payload?.subject ||
      ""
    ),
    compactHash(
      payload?.body ||
      ""
    )
  ].join(
    ":"
  );
}


function cloudReviewIsComplete(
  review
) {
  return COMPLETE_CLOUD_STATUSES
    .has(
      String(
        review?.status ||
        review?.assessment ||
        ""
      ).toUpperCase()
    );
}


function shouldAutomaticallyOpenForUrl(
  reason
) {
  return (
    reason === "address_bar_changed" ||
    reason === "page_loaded"
  );
}


async function getTabStates() {
  const stored =
    await chrome.storage
      .session
      .get(
        STORAGE_KEYS.tabStates
      );

  return (
    stored[
      STORAGE_KEYS.tabStates
    ] ||
    {}
  );
}


async function patchTabState(
  tabId,
  updater
) {
  if (
    !Number.isInteger(
      tabId
    )
  ) {
    return null;
  }

  const previousQueue =
    tabUpdateQueues.get(
      tabId
    ) ||
    Promise.resolve();

  const nextQueue =
    previousQueue.then(
      async () => {
        const states =
          await getTabStates();

        const current =
          states[
            String(
              tabId
            )
          ] ||
          {};

        const updated =
          typeof updater ===
            "function"
            ? updater(
                current
              )
            : {
                ...current,
                ...updater
              };

        states[
          String(
            tabId
          )
        ] = {
          ...updated,
          tab_id:
            tabId,
          state_updated_at:
            nowIso()
        };

        await chrome.storage
          .session
          .set({
            [STORAGE_KEYS.tabStates]:
              states
          });

        return states[
          String(
            tabId
          )
        ];
      }
    );

  tabUpdateQueues.set(
    tabId,
    nextQueue.catch(
      () => {}
    )
  );

  return nextQueue;
}


async function removeTabState(
  tabId
) {
  const states =
    await getTabStates();

  delete states[
    String(
      tabId
    )
  ];

  await chrome.storage
    .session
    .set({
      [STORAGE_KEYS.tabStates]:
        states
    });
}


async function setServerState(
  status,
  detail = null
) {
  await chrome.storage
    .session
    .set({
      [STORAGE_KEYS.server]: {
        status,
        detail,
        checked_at:
          nowIso()
      }
    });
}


async function clearDetectionState(
  message = "Pair this device with a BantAI account to enable detection."
) {
  urlSequences.clear();
  urlAnalysisRequests.clear();
  emailSequences.clear();
  popupFingerprints.clear();
  automaticPopupStates.clear();
  dangerModalRequests.clear();

  await chrome.storage
    .session
    .set({
      [STORAGE_KEYS.tabStates]:
        {},
      [STORAGE_KEYS.access]: {
        enabled: false,
        message,
        checked_at:
          nowIso()
      }
    });

  await chrome.storage
    .session
    .remove(
      [STORAGE_KEYS.autoPopup, STORAGE_KEYS.autoPopupSites]
    );

  const tabs =
    await chrome.tabs.query({});

  await Promise.all(
    tabs.map(
      (tab) =>
        updateBadge(
          tab.id,
          null
        )
    )
  );
}


async function checkDetectionAccess(
  force = false
) {
  const checkedAt =
    detectionAccessCache
      .checkedAt;

  if (
    !force &&
    Date.now() - checkedAt <
      DETECTION_ACCESS_CACHE_MS
  ) {
    return detectionAccessCache
      .enabled;
  }

  if (
    detectionAccessCache
      .inFlight
  ) {
    return detectionAccessCache
      .inFlight;
  }

  const request =
    (async () => {
      const controller =
        new AbortController();
      const timeoutId =
        setTimeout(
          () => controller.abort(),
          7000
        );

      try {
        const response =
          await authenticatedFetch(
            "/extension/status",
            {
              cache:
                "no-store",
              signal:
                controller.signal
            }
          );

        if (!response.ok) {
          throw new Error(
            `BantAI server status HTTP ${response.status}`
          );
        }

        const status =
          await response.json();
        const enabled =
          status?.connected === true &&
          status?.service_ready === true;
        const message =
          status?.access_message ||
          "Pair this device with a BantAI account to enable detection.";

        detectionAccessCache
          .enabled = enabled;
        detectionAccessCache
          .checkedAt = Date.now();

        await chrome.storage
          .session
          .set({
            [STORAGE_KEYS.access]: {
              enabled,
              message,
              user_email: status?.user_email || null,
              service_ready: status?.service_ready === true,
              checked_at:
                nowIso()
            }
          });

        if (!enabled) {
          await clearDetectionState(
            message
          );
        }

        return enabled;
      } catch (error) {
        const message =
          isPairingRequiredError(error)
            ? error.message
            : "Browser extension connected status could not be verified. The BantAI service is unavailable.";

        detectionAccessCache
          .enabled = false;
        detectionAccessCache
          .checkedAt = Date.now();

        await clearDetectionState(
          message
        );

        return false;
      } finally {
        clearTimeout(
          timeoutId
        );
      }
    })();

  detectionAccessCache
    .inFlight = request;

  try {
    return await request;
  } finally {
    if (
      detectionAccessCache
        .inFlight === request
    ) {
      detectionAccessCache
        .inFlight = null;
    }
  }
}


async function disableDetectionForPairing(
  error
) {
  const message =
    error?.message ||
    "Pair this device with a BantAI account to enable detection.";

  detectionAccessCache
    .enabled = false;
  detectionAccessCache
    .checkedAt = Date.now();

  await clearDetectionState(
    message
  );
}


async function checkServer() {
  try {
    const response =
      await authenticatedFetch(
        "/extension/status",
        {
          cache:
            "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const health =
      await response.json();

    if (health.service_ready !== true) {
      throw new Error("BantAI server models are unavailable.");
    }

    await setServerState(
      "connected",
      health
    );

    return health;
  } catch (error) {
    await setServerState(
      "unavailable",
      String(
        error?.message ||
        error
      )
    );

    return null;
  }
}


function minimizedOrigin(
  value
) {
  try {
    const parsed =
      new URL(
        String(
          value ||
          ""
        )
      );

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}


async function legacySubmitActivity(
  activity
) {
  try {
    await fetch(
      `${API_BASE}/legacy-disabled/activity`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify(
            activity
          )
      }
    );
  } catch {
    // Unreachable compatibility path retained only while old state migrates.
  }
}


async function legacyRememberDetailContext(
  context
) {
  for (
    let attempt = 0;
    attempt < 3;
    attempt += 1
  ) {
    try {
      const response =
        await fetch(
          `${API_BASE}/legacy-disabled/detail-context`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify(
                context
              )
          }
        );

      if (response.ok) {
        return true;
      }

      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        return false;
      }
    } catch {
      // Retry short transport interruptions below. Full URLs and email
      // bodies remain memory-only and never enter extension storage.
    }

    if (attempt < 2) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            150 * (attempt + 1)
          )
      );
    }
  }

  return false;
}


async function submitAutomaticTrainingSample(
  sample
) {
  const recordedAt = nowIso();
  const eventType = String(
    sample?.event_type ||
    ""
  ).toUpperCase();
  const invalid =
    (
      eventType === "URL" &&
      !String(sample?.url || "")
    ) ||
    (
      eventType === "EMAIL" &&
      (
        !String(sample?.provider || "") ||
        !String(sample?.body || "").trim()
      )
    ) ||
    ![
      "URL",
      "EMAIL"
    ].includes(eventType);
  const oversized =
    (
      eventType === "URL" &&
      String(sample?.url || "").length > 2048
    ) ||
    (
      eventType === "EMAIL" &&
      String(sample?.body || "").length > 10000
    );

  if (invalid || oversized) {
    const diagnostics = {
      reason:
        oversized
          ? "OVERSIZED"
          : "INVALID",
      selected: false,
      accepted: false,
      checked_at: recordedAt
    };
    await chrome.storage.session.set({
      [STORAGE_KEYS.collectionDiagnostics]: diagnostics
    });
    return diagnostics;
  }

  try {
    const response = await fetch(
      `${API_BASE}/legacy-disabled/training-sample`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify(
            sample
          )
      }
    );
    let result = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }
    const reason = String(
      result?.reason ||
      (response.ok ? "INVALID" : response.status === 422 ? "INVALID" : "SERVICE_UNAVAILABLE")
    ).toUpperCase();
    const diagnostics = {
      reason,
      selected: result?.selected === true,
      accepted: result?.submitted === true || result?.accepted === true,
      checked_at: recordedAt
    };
    await chrome.storage.session.set({
      [STORAGE_KEYS.collectionDiagnostics]: diagnostics
    });
    return diagnostics;
  } catch {
    // Automatic samples are never placed in the retry outbox because they can
    // contain a complete URL or email body. A missed sample stays missed.
    const diagnostics = {
      reason: "SERVICE_UNAVAILABLE",
      selected: false,
      accepted: false,
      checked_at: recordedAt
    };
    await chrome.storage.session.set({
      [STORAGE_KEYS.collectionDiagnostics]: diagnostics
    });
    return diagnostics;
  }
}


async function updateBadge(
  tabId,
  urlDetector
) {
  if (
    !Number.isInteger(
      tabId
    )
  ) {
    return;
  }

  const signal =
    urlDetector?.result
      ?.final_result ||
    urlDetector?.signal ||
    "";

  try {
    if (
      signal ===
        "SUSPICIOUS" ||
      signal ===
        "SUSPICIOUS_SIGNS_FOUND"
    ) {
      await chrome.action
        .setBadgeBackgroundColor({
          tabId,
          color:
            "#C62828"
        });

      await chrome.action
        .setBadgeText({
          tabId,
          text:
            "!"
        });

      return;
    }

    if (
      signal ===
        "SAFE" ||
      signal ===
        "NO_STRONG_WARNING_SIGNS"
    ) {
      await chrome.action
        .setBadgeBackgroundColor({
          tabId,
          color:
            "#16794B"
        });

      await chrome.action
        .setBadgeText({
          tabId,
          text:
            "OK"
        });

      return;
    }

    if (
      signal ===
      "NEEDS_CAUTION"
    ) {
      await chrome.action
        .setBadgeBackgroundColor({
          tabId,
          color:
            "#C79A16"
        });

      await chrome.action
        .setBadgeText({
          tabId,
          text:
            "?"
        });

      return;
    }

    await chrome.action
      .setBadgeText({
        tabId,
        text:
          ""
      });
  } catch (error) {
    console.debug("[BantAI v1.1.0] BADGE_UPDATE_FAILED");
  }
}


function defaultEmailState(
  provider,
  existing
) {
  if (!provider) {
    return {
      state:
        "disabled",
      provider:
        null,
      provider_label:
        null,
      message:
        "Email checking works only in Gmail, Outlook, and Yahoo."
    };
  }

  if (
    existing?.provider ===
      provider.id &&
    existing?.state
  ) {
    return existing;
  }

  return {
    state:
      "waiting",
    provider:
      provider.id,
    provider_label:
      provider.label,
    message:
      "Open an email to check its message."
  };
}


async function fetchUrlAnalysis(
  currentUrl,
  clientEventId
) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => {
        controller.abort();
      },
      50000
    );

  try {
    const response =
      await authenticatedFetch(
        "/detections/url",
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              url:
                currentUrl,
              client_event_id:
                clientEventId,
              occurred_at:
                nowIso()
            }),
          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        await responseProblem(response, "The BantAI server could not complete this website check.")
      );
    }

    return response.json();
  } finally {
    clearTimeout(
      timeoutId
    );
  }
}


async function legacyLocalScanCurrentTabUrl(
  tab,
  {
    force = false,
    reason = "unknown"
  } = {}
) {
  const tabId =
    tab?.id;

  if (
    !Number.isInteger(
      tabId
    )
  ) {
    return null;
  }

  if (
    !await checkDetectionAccess()
  ) {
    return null;
  }

  const startedAt =
    Date.now();

  const currentUrl =
    String(
      tab?.url ||
      ""
    );

  const provider =
    providerForUrl(
      currentUrl
    );

  if (
    !canScanAddressBarUrl(
      currentUrl
    )
  ) {
    const state =
      await patchTabState(
        tabId,
        (current) => ({
          ...current,
          current_url:
            currentUrl,
          hostname:
            "",
          provider:
            provider?.id ||
            null,
          provider_label:
            provider?.label ||
            null,
          url_detector: {
            state:
              "unavailable",
            signal:
              "UNAVAILABLE",
            message:
              "BantAI checks regular HTTP and HTTPS websites only.",
            reason
          },
          email_detector:
            defaultEmailState(
              provider,
              current.email_detector
            )
        })
      );

    await updateBadge(
      tabId,
      state?.url_detector
    );

    return state
      ?.url_detector ||
      null;
  }

  const states =
    await getTabStates();

  const existing =
    states[
      String(
        tabId
      )
    ];

  const activityEventId =
    existing
      ?.current_url ===
        currentUrl &&
    existing
      ?.url_detector
      ?.activity_event_id
      ? existing
          .url_detector
          .activity_event_id
      : `url:${tabId}:${compactHash(currentUrl)}:${Date.now()}`;

  if (
    !force &&
    existing
      ?.url_detector
      ?.state &&
    [
      "analyzing",
      "complete"
    ].includes(
      existing.url_detector.state
    ) &&
    (
      existing
        ?.url_detector
        ?.result
        ?.current_url ||
      existing
        ?.current_url
    ) === currentUrl
  ) {
    return existing
      .url_detector;
  }

  const sequence =
    (
      urlSequences.get(
        tabId
      ) ||
      0
    ) + 1;

  urlSequences.set(
    tabId,
    sequence
  );

  await patchTabState(
    tabId,
    (current) => ({
      ...current,
      current_url:
        currentUrl,
      hostname:
        hostnameForUrl(
          currentUrl
        ),
      provider:
        provider?.id ||
        null,
      provider_label:
        provider?.label ||
        null,
      url_detector: {
        state:
          "analyzing",
        signal:
          "ANALYZING",
        message:
          "Checking the current website address...",
        reason,
        activity_event_id:
          activityEventId,
        requested_at:
          nowIso()
      },
      email_detector:
        defaultEmailState(
          provider,
          current.email_detector
        )
    })
  );

  try {
    const result =
      await fetchUrlAnalysis(
        currentUrl,
        false
      );

    if (
      urlSequences.get(
        tabId
      ) !== sequence
    ) {
      return null;
    }

    const shouldRunCloudReview =
      (
        result.signal ===
          "SUSPICIOUS" ||
        result.final_result ===
          "SUSPICIOUS_SIGNS_FOUND"
      );

    if (!shouldRunCloudReview) {
      const completedAt =
        nowIso();

      const state =
        await patchTabState(
          tabId,
          (current) => ({
            ...current,
            current_url:
              currentUrl,
            hostname:
              result.hostname ||
              hostnameForUrl(
                currentUrl
              ),
            url_detector: {
              state:
                "complete",
              signal:
                result.final_result ||
                result.signal,
              result,
              cloud_review:
                result.llm_review,
              reason,
              activity_event_id:
                activityEventId,
              completed_at:
                completedAt
            }
          })
        );

      await updateBadge(
        tabId,
        state?.url_detector
      );

      await checkServer();

      await legacyRememberDetailContext({
        client_event_id:
          activityEventId,
        event_type:
          "URL",
        url:
          currentUrl,
        outcome:
          result.final_result
      });

      await legacySubmitActivity({
        client_event_id:
          activityEventId,
        event_type:
          "URL",
        origin:
          minimizedOrigin(
            currentUrl
          ),
        provider:
          null,
        sender:
          null,
        subject:
          null,
        outcome:
          result.final_result,
        cloud_status:
          "SKIPPED",
        duration_ms:
          Math.min(
            120000,
            Math.max(
              0,
              Date.now() - startedAt
            )
          ),
        occurred_at:
          state?.url_detector
            ?.completed_at ||
          nowIso()
      });

      await submitAutomaticTrainingSample({
        client_event_id:
          activityEventId,
        event_type:
          "URL",
        url:
          currentUrl,
        outcome:
          result.final_result,
        occurred_at:
          state?.url_detector
            ?.completed_at ||
          nowIso()
      });

      return state
        ?.url_detector ||
        null;
    }

    let state =
      await patchTabState(
        tabId,
        (current) => ({
          ...current,
          current_url:
            currentUrl,
          hostname:
            result.hostname ||
            hostnameForUrl(
              currentUrl
            ),
          url_detector: {
            state:
              "analyzing",
            signal:
              "ANALYZING",
            result:
              null,
            cloud_review: {
              enabled: true,
              status: "CHECKING",
              reasoning_summary:
                "A server URL-model warning was found. Only the website origin is being reviewed; page content is not shared."
            },
            message:
              "A server-model warning was found. Preparing the final hybrid result...",
            reason,
            activity_event_id:
              activityEventId,
            requested_at:
              nowIso()
          }
        })
      );

    await updateBadge(
      tabId,
      state?.url_detector
    );

    await checkServer();

    try {
      const cloudResult =
        await fetchUrlAnalysis(
          currentUrl,
          true
        );

      if (
        urlSequences.get(
          tabId
        ) !== sequence
      ) {
        return null;
      }

      state =
        await patchTabState(
          tabId,
          (current) => ({
            ...current,
            url_detector: {
              state: "complete",
              signal:
                cloudResult.final_result ||
                cloudResult.signal,
              result:
                cloudResult,
              cloud_review:
                cloudResult.llm_review,
              reason,
              activity_event_id:
                activityEventId,
              completed_at:
                nowIso()
            }
          })
        );

      await updateBadge(
        tabId,
        state?.url_detector
      );

      if (
        tab &&
        shouldAutomaticallyOpenForUrl(
          reason
        ) &&
        cloudReviewIsComplete(
          cloudResult.llm_review
        )
      ) {
        await openFiveSecondPopup(
          tab,
          currentUrl,
          "url_review_complete"
        );
      }
    } catch (error) {
      if (
        isPairingRequiredError(
          error
        )
      ) {
        throw error;
      }

      if (
        urlSequences.get(
          tabId
        ) !== sequence
      ) {
        return null;
      }

      const unavailableReview = {
        enabled: true,
        status: "UNAVAILABLE",
        reasoning_summary:
          "Cloud URL Review could not be completed. The server URL-model warning remains available.",
        failure_reason:
          "PROVIDER_UNAVAILABLE"
      };

      state =
        await patchTabState(
          tabId,
          (current) => ({
            ...current,
            url_detector: {
              ...current.url_detector,
              state:
                "complete",
              signal:
                result.final_result ||
                result.signal,
              result:
                {
                  ...result,
                  llm_review:
                    unavailableReview,
                  message:
                    "The server URL model found warning signs. Cloud review is unavailable, so verify the website independently."
                },
              cloud_review:
                unavailableReview,
              message:
                "The server URL model found warning signs. Cloud review is unavailable, so verify the website independently.",
              completed_at:
                nowIso()
            }
          })
        );

      await updateBadge(
        tabId,
        state?.url_detector
      );

    }

    const finalUrlResult =
      state?.url_detector
        ?.result ||
      result;

    await legacyRememberDetailContext({
      client_event_id:
        activityEventId,
      event_type:
        "URL",
      url:
        currentUrl,
      outcome:
        finalUrlResult
          ?.final_result ||
        "SUSPICIOUS_SIGNS_FOUND"
    });

    await legacySubmitActivity({
      client_event_id:
        activityEventId,
      event_type:
        "URL",
      origin:
        minimizedOrigin(
          currentUrl
        ),
      provider:
        null,
      sender:
        null,
      subject:
        null,
      outcome:
        finalUrlResult
          ?.final_result ||
        "SUSPICIOUS_SIGNS_FOUND",
      cloud_status:
        cloudReviewIsComplete(
          state?.url_detector
            ?.cloud_review
        )
          ? "COMPLETE"
          : "UNAVAILABLE",
      cloud_failure_category:
        cloudReviewIsComplete(
          state?.url_detector?.cloud_review
        )
          ? null
          : state?.url_detector?.cloud_review?.failure_reason || "PROVIDER_UNAVAILABLE",
      duration_ms:
        Math.min(
          120000,
          Math.max(
            0,
            Date.now() - startedAt
          )
        ),
      occurred_at:
        state?.url_detector
          ?.completed_at ||
        nowIso()
    });

    await submitAutomaticTrainingSample({
      client_event_id:
        activityEventId,
      event_type:
        "URL",
      url:
        currentUrl,
      outcome:
        finalUrlResult
          ?.final_result ||
        "SUSPICIOUS_SIGNS_FOUND",
      occurred_at:
        state?.url_detector
          ?.completed_at ||
        nowIso()
    });

    return state
      ?.url_detector ||
      null;
  } catch (error) {
    if (
      isPairingRequiredError(
        error
      )
    ) {
      await disableDetectionForPairing(
        error
      );

      return null;
    }

    if (
      urlSequences.get(
        tabId
      ) !== sequence
    ) {
      return null;
    }

    const state =
      await patchTabState(
        tabId,
        (current) => ({
          ...current,
          current_url:
            currentUrl,
          url_detector: {
            state:
              "error",
            signal:
              "UNAVAILABLE",
            message:
              "The website check could not be completed. Make sure the BantAI server is running.",
            error:
              String(
                error?.message ||
                error
              ),
            reason
          }
        })
      );

    await setServerState(
      "unavailable",
      String(
        error?.message ||
        error
      )
    );

    await updateBadge(
      tabId,
      state?.url_detector
    );

    return state
      ?.url_detector ||
      null;
  }
}


async function performCurrentTabUrlScan(
  tab,
  {
    force = false,
    reason = "unknown"
  } = {}
) {
  const tabId = tab?.id;
  if (!Number.isInteger(tabId)) {
    return null;
  }
  if (!await checkDetectionAccess()) {
    return null;
  }

  const currentUrl = String(tab?.url || "");
  const provider = providerForUrl(currentUrl);
  if (!canScanAddressBarUrl(currentUrl)) {
    const state = await patchTabState(tabId, (current) => ({
      ...current,
      current_url: currentUrl,
      hostname: "",
      provider: provider?.id || null,
      provider_label: provider?.label || null,
      url_detector: {
        state: "unavailable",
        signal: "UNAVAILABLE",
        message: "BantAI checks regular HTTP and HTTPS websites only.",
        reason
      },
      email_detector: defaultEmailState(provider, current.email_detector)
    }));
    await updateBadge(tabId, state?.url_detector);
    return state?.url_detector || null;
  }

  const states = await getTabStates();
  const existing = states[String(tabId)];
  if (
    !force &&
    ["analyzing", "complete"].includes(existing?.url_detector?.state) &&
    (existing?.url_detector?.result?.current_url || existing?.current_url) === currentUrl
  ) {
    return existing.url_detector;
  }
  const clientEventId =
    existing?.current_url === currentUrl && existing?.url_detector?.activity_event_id
      ? existing.url_detector.activity_event_id
      : `url:${tabId}:${compactHash(currentUrl)}:${Date.now()}`;
  const sequence = (urlSequences.get(tabId) || 0) + 1;
  urlSequences.set(tabId, sequence);

  await patchTabState(tabId, (current) => ({
    ...current,
    current_url: currentUrl,
    hostname: hostnameForUrl(currentUrl),
    provider: provider?.id || null,
    provider_label: provider?.label || null,
    url_detector: {
      state: "analyzing",
      signal: "ANALYZING",
      message: "Checking this address with the BantAI server...",
      reason,
      activity_event_id: clientEventId,
      requested_at: nowIso()
    },
    email_detector: defaultEmailState(provider, current.email_detector)
  }));

  try {
    const result = await fetchUrlAnalysis(currentUrl, clientEventId);
    if (urlSequences.get(tabId) !== sequence) {
      return null;
    }
    const currentTab = await chrome.tabs.get(tabId);
    if (currentTab.url !== currentUrl) {
      return null;
    }
    const finalResult = String(result?.final_result || "").toUpperCase();
    if (!COMPLETE_CLOUD_STATUSES.has(finalResult)) {
      throw new Error("The BantAI server returned an incomplete website result.");
    }
    const cloudStatus = String(
      result?.llm_review?.status || result?.llm_review?.assessment || ""
    ).toUpperCase();
    if (
      result.signal === "SUSPICIOUS" &&
      !cloudReviewIsComplete(result.llm_review) &&
      cloudStatus !== "UNAVAILABLE"
    ) {
      throw new Error("The website cloud assessment has not completed.");
    }
    const completedAt = nowIso();
    const state = await patchTabState(tabId, (current) => ({
      ...current,
      current_url: result.current_url || currentUrl,
      hostname: result.hostname || hostnameForUrl(currentUrl),
      url_detector: {
        state: "complete",
        signal: finalResult,
        result,
        cloud_review: result.llm_review,
        reason,
        activity_event_id: result.client_event_id || clientEventId,
        detection_id: result.detection_id || null,
        completed_at: completedAt
      }
    }));
    if (result.automatic_collection) {
      await chrome.storage.session.set({
        [STORAGE_KEYS.collectionDiagnostics]: {
          ...result.automatic_collection,
          checked_at: completedAt
        }
      });
    }
    await updateBadge(tabId, state?.url_detector);
    await setServerState("connected", {service_ready: true});
    const automaticResultReady = tab && shouldAutomaticallyOpenForUrl(reason) &&
      (result.signal === "SAFE" || cloudReviewIsComplete(result.llm_review));
    if (automaticResultReady) {
      const dangerModalShown = isDangerousOutcome(finalResult) &&
        await showDangerousResultModal(
          tab, state, "URL", state?.url_detector?.activity_event_id
        );
      if (!dangerModalShown && (
        !isDangerousOutcome(finalResult) ||
        await tabStillAtUrl(tabId, currentUrl)
      )) {
        await openFiveSecondPopup(
          tab,
          `${currentUrl}:${finalResult}`,
          "url_review_complete",
          {url: currentUrl, outcome: finalResult}
        );
      }
    }
    return state?.url_detector || null;
  } catch (error) {
    if (isPairingRequiredError(error)) {
      await disableDetectionForPairing(error);
      return null;
    }
    if (urlSequences.get(tabId) !== sequence) {
      return null;
    }
    const state = await patchTabState(tabId, (current) => ({
      ...current,
      current_url: currentUrl,
      url_detector: {
        state: "error",
        signal: "UNAVAILABLE",
        result: null,
        message: "Service unavailable. BantAI could not complete this website check.",
        error: String(error?.message || error),
        reason,
        activity_event_id: clientEventId
      }
    }));
    await setServerState("unavailable", "Service unavailable");
    await updateBadge(tabId, state?.url_detector);
    return state?.url_detector || null;
  }
}


async function scanCurrentTabUrl(
  tab,
  options = {}
) {
  const tabId = tab?.id;
  const currentUrl = String(tab?.url || "");
  if (!Number.isInteger(tabId)) {
    return null;
  }

  const existingRequest = urlAnalysisRequests.get(tabId);
  if (existingRequest?.url === currentUrl) {
    return existingRequest.promise;
  }

  const promise = performCurrentTabUrlScan(tab, options);
  urlAnalysisRequests.set(tabId, {url: currentUrl, promise});
  try {
    return await promise;
  } finally {
    if (urlAnalysisRequests.get(tabId)?.promise === promise) {
      urlAnalysisRequests.delete(tabId);
    }
  }
}


async function fetchHybridEmail(
  payload,
  currentUrl,
  clientEventId,
  restoreOnly = false
) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => {
        controller.abort();
      },
      50000
    );

  try {
    const response =
      await authenticatedFetch(
        restoreOnly ? "/detections/email/context" : "/detections/email",
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              provider:
                payload.provider,
              sender_authentication: payload.sender_authentication || {},
              sender:
                payload.sender ||
                null,
              subject:
                payload.subject ||
                "",
              body:
                payload.body ||
                "",
              current_url:
                currentUrl,
              client_event_id:
                clientEventId,
              occurred_at:
                nowIso()
            }),
          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        await responseProblem(response, "The BantAI server could not complete this email check.")
      );
    }

    return response.json();
  } finally {
    clearTimeout(
      timeoutId
    );
  }
}


async function emailRequestIsCurrent(
  tabId,
  sequence,
  fingerprint,
  currentUrl
) {
  if (
    emailSequences.get(
      tabId
    ) !== sequence
  ) {
    return false;
  }

  const states =
    await getTabStates();

  if (
    states[String(tabId)]
      ?.email_detector
      ?.fingerprint !==
        fingerprint
  ) {
    return false;
  }

  try {
    const currentTab =
      await chrome.tabs.get(
        tabId
      );

    return currentTab.url ===
      currentUrl;
  } catch {
    return false;
  }
}


async function senderAuthenticationFingerprint(authentication = {}) {
  // Keep only extractor observations; never retain header text or email content.
  const minimized = {};
  for (const key of ["source", "mailed_by", "signed_by", "spf_domain", "dkim_domain", "dmarc_domain", "spf", "dkim", "dmarc"]) {
    if (typeof authentication[key] === "string") minimized[key] = authentication[key];
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(minimized)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}


function minimizedSenderAuthentication(authentication = {}) {
  if (!authentication || !["SENDER_DETAILS", "MESSAGE_HEADERS"].includes(authentication.source)) return {};
  const result = {source: authentication.source};
  for (const key of ["mailed_by", "signed_by", "spf_domain", "dkim_domain", "dmarc_domain"]) {
    const value = String(authentication[key] || "").trim().toLowerCase().replace(/\.$/, "");
    if (value.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) result[key] = value;
  }
  for (const key of ["spf", "dkim", "dmarc"]) {
    const value = String(authentication[key] || "").toLowerCase();
    if (["pass", "fail", "softfail", "neutral", "none", "temperror", "permerror"].includes(value)) result[key] = value;
  }
  return Object.keys(result).length > 1 ? result : {};
}

async function analyzeOpenedEmail(
  payload,
  tab,
  {
    force = false,
    showAutomaticPopup = true
  } = {}
) {
  const tabId =
    tab?.id;

  if (
    !Number.isInteger(
      tabId
    )
  ) {
    return null;
  }

  if (
    !await checkDetectionAccess()
  ) {
    return null;
  }

  const startedAt =
    Date.now();

  const provider =
    providerForUrl(
      tab?.url
    );

  if (
    !provider ||
    provider.id !==
      payload?.provider
  ) {
    console.warn(
      "[BantAI v1.1.0] Ignoring email extraction outside a matching supported provider."
    );

    return null;
  }

  const fingerprint =
    buildEmailFingerprint(
      payload
    );

  const existingStates =
    await getTabStates();
  const existingState =
    existingStates[String(tabId)];
  const authenticationFingerprint = await senderAuthenticationFingerprint(payload.sender_authentication || {});
  const previousAuthenticationFingerprint = existingState?.email_detector?.authentication_fingerprint ??
    (popupFingerprints.get(tabId)?.fingerprint === fingerprint
      ? popupFingerprints.get(tabId)?.authenticationFingerprint : undefined);
  const authenticationChanged = existingState?.email_detector?.fingerprint === fingerprint && previousAuthenticationFingerprint !== authenticationFingerprint;
  const clientEventId =
    !authenticationChanged && existingState?.email_detector?.fingerprint === fingerprint &&
    existingState?.hybrid_analysis_id
      ? existingState.hybrid_analysis_id
      : `email:${tabId}:${fingerprint}:${crypto.randomUUID()}`;

  const priorPopup =
    popupFingerprints.get(
      tabId
    );

  if (
    !force &&
    priorPopup?.fingerprint ===
      fingerprint && !authenticationChanged
  ) {
    return null;
  }

  popupFingerprints.set(
    tabId,
    {
      fingerprint,
      authenticationFingerprint,
      timestamp:
        Date.now()
    }
  );

  const sequence =
    (
      emailSequences.get(
        tabId
      ) ||
      0
    ) + 1;

  emailSequences.set(
    tabId,
    sequence
  );

  await patchTabState(
    tabId,
    (current) => ({
      ...current,
      current_url:
        tab.url ||
        current.current_url ||
        "",
      hostname:
        hostnameForUrl(
          tab.url
        ),
      provider:
        provider.id,
      provider_label:
        provider.label,
      url_detector: {
        state:
          "analyzing",
        signal:
          "ANALYZING",
        message:
          "Checking the current website address...",
        reason:
          "new_email_opened",
        requested_at:
          nowIso()
      },
      email_detector: {
        state:
          "analyzing",
        signal:
          "ANALYZING",
        provider:
          provider.id,
        provider_label:
          provider.label,
        sender:
          payload?.sender ||
          null,
        subject:
          payload?.subject ||
          "",
        fingerprint,
        message:
          "Checking the opened email message...",
        requested_at:
          nowIso()
      },
      local_indicators: {
        markers: [],
        critical_count: 0,
        strong_count: 0,
        contextual_count: 0
      },
      llm_review: {
        enabled: true,
        status: "CHECKING",
        message:
          "Cloud AI Review runs automatically with the server-model email analysis."
      },
      fusion: null,
      local_fusion: null,
      hybrid_analysis_id:
        clientEventId,
      hybrid_ready:
        false
    })
  );

  const currentUrl =
    String(
      tab.url ||
      ""
    );

  let hybridResult;

  try {
    hybridResult =
      await fetchHybridEmail(
        payload,
        currentUrl,
        clientEventId
      );

    if (
      !await emailRequestIsCurrent(
        tabId,
        sequence,
        fingerprint,
        currentUrl
      )
    ) {
      return null;
    }

    const finalEmailOutcome =
      hybridResult
        ?.fusion
        ?.final_result;

    if (
      !COMPLETE_CLOUD_STATUSES
        .has(
          String(
            finalEmailOutcome ||
            ""
          ).toUpperCase()
        )
    ) {
      throw new Error(
        "Hybrid detector returned an incomplete result."
      );
    }

    const completedAt =
      nowIso();

    const cloudReviewCompleted =
      cloudReviewIsComplete(
        hybridResult
          .llm_review
      );
    const urlResult = hybridResult.url_model || {};
    const urlReviewCompleted = COMPLETE_CLOUD_STATUSES.has(urlResult.final_result) &&
      (urlResult.signal === "SAFE" || cloudReviewIsComplete(urlResult.llm_review));
    const urlUnavailable = urlResult.signal === "UNAVAILABLE" || urlResult.llm_review?.status === "UNAVAILABLE";

    const completedState =
      await patchTabState(
        tabId,
        (current) => ({
          ...current,
          current_url:
            hybridResult
              .url_model
              ?.current_url ||
            currentUrl,
          hostname:
            hybridResult
              .url_model
              ?.hostname ||
            hostnameForUrl(
              currentUrl
            ),
          url_detector: {
            state: urlReviewCompleted ? "complete" : urlUnavailable ? "error" : "analyzing",
            signal: urlReviewCompleted ? urlResult.final_result : urlUnavailable ? "UNAVAILABLE" : "CHECKING",
            result:
              hybridResult.url_model,
            reason:
              "new_email_opened",
            completed_at:
              completedAt
          },
          email_detector: {
            state: "complete",
            signal:
              hybridResult.email_model
                ?.signal ||
              "UNAVAILABLE",
            provider:
              provider.id,
            provider_label:
              provider.label,
            sender:
              payload?.sender ||
              null,
            subject:
              payload?.subject ||
              "",
            result:
              hybridResult.email_model,
            fingerprint,
            authentication_fingerprint: authenticationFingerprint,
            sender_authentication: minimizedSenderAuthentication(payload.sender_authentication),
            completed_at:
              completedAt
          },
          local_indicators:
            hybridResult.local_indicators,
          llm_review:
            hybridResult.llm_review,
          fusion:
            hybridResult.fusion,
          local_fusion:
            null,
          hybrid_analysis_id:
            hybridResult.client_event_id || hybridResult.analysis_id || clientEventId,
          hybrid_ready:
            true
        })
      );

    await updateBadge(
      tabId,
      completedState
        ?.url_detector
    );

    if (showAutomaticPopup && urlReviewCompleted && cloudReviewCompleted) {
      const dangerModalShown = (
        isDangerousOutcome(finalEmailOutcome) ||
        isDangerousOutcome(urlResult.final_result)
      ) && await showDangerousResultModal(
        tab, completedState, "EMAIL", completedState?.hybrid_analysis_id
      );
      if (!dangerModalShown && !authenticationChanged && (
        (!isDangerousOutcome(finalEmailOutcome) && !isDangerousOutcome(urlResult.final_result)) ||
        await tabStillAtUrl(tabId, currentUrl)
      )) {
        await openFiveSecondPopup(
          tab,
          fingerprint,
          "email_review_complete"
        );
      }
    }

    if (hybridResult.automatic_collection) {
      await chrome.storage.session.set({
        [STORAGE_KEYS.collectionDiagnostics]: {
          ...hybridResult.automatic_collection,
          checked_at: completedAt
        }
      });
    }
  } catch (error) {
    if (
      isPairingRequiredError(
        error
      )
    ) {
      await disableDetectionForPairing(
        error
      );

      return null;
    }

    if (
      !await emailRequestIsCurrent(
        tabId,
        sequence,
        fingerprint,
        currentUrl
      )
    ) {
      return null;
    }

    const failedState =
      await patchTabState(
        tabId,
        (current) => ({
        ...current,
        // An email transport failure is not a website detection result.
        url_detector: current.url_detector?.state === "complete"
          ? current.url_detector
          : existingState?.url_detector?.result?.current_url === currentUrl
            ? existingState.url_detector
            : current.url_detector,
        llm_review: {
          enabled: true,
          status: "UNAVAILABLE",
          reasoning_summary:
            "The complete hybrid email result could not be prepared. Try the check again."
        },
        fusion:
          null,
        local_fusion:
          null,
        hybrid_analysis_id:
          null,
        hybrid_ready:
          false,
        email_detector: {
          ...current.email_detector,
          state:
            "error",
          signal:
            "UNAVAILABLE",
          result:
            null,
          message:
            "The complete hybrid email result is unavailable. Try again shortly."
        }
        })
      );

    await updateBadge(
      tabId,
      failedState
        ?.url_detector
    );

    // Retry the exact address-bar URL through its independent endpoint. This
    // reason does not open an automatic result popup.
    await scanCurrentTabUrl(tab, {force: true, reason: "email_request_failed"});

    return null;
  }

  return true;
}


async function extractCurrentEmailForFeedback(
  tab,
  provider,
  maximumBodyChars = 10000
) {
  const requestType =
    EMAIL_FEEDBACK_REQUEST_TYPES[
      provider?.id
    ];

  if (
    !requestType ||
    !Number.isInteger(
      tab?.id
    )
  ) {
    throw new Error(
      "Open a supported email before submitting feedback."
    );
  }

  await injectProviderScript(
    tab.id,
    tab.url
  );

  let payload =
    null;

  for (
    let attempt = 0;
    attempt < 5;
    attempt += 1
  ) {
    const extracted =
      await chrome.tabs.sendMessage(
        tab.id,
        {
          type:
            requestType
        }
      );

    payload =
      extracted?.nlp_payload ||
      extracted;

    if (
      payload?.provider ===
        provider.id &&
      String(
        payload?.body ||
        ""
      ).trim()
    ) {
      break;
    }

    if (attempt < 4) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            250
          )
      );
    }
  }

  if (
    !payload ||
    payload.provider !==
      provider.id ||
    !String(
      payload.body ||
      ""
    ).trim()
  ) {
    throw new Error(
      "BantAI could not read the currently opened email. Keep it open and try again."
    );
  }

  if (
    String(
      payload.body
    ).length > maximumBodyChars
  ) {
    throw new Error(
      "This email is too long to include in this request."
    );
  }

  try {
    payload.sender_authentication = await chrome.tabs.sendMessage(tab.id, {
      type: "BANTAI_GET_SENDER_AUTHENTICATION", payload
    }) || {};
  } catch {
    payload.sender_authentication = payload.sender_authentication || {};
  }
  return payload;
}


async function restoreCurrentEmailDetailContext(
  tab,
  {
    reanalyzeIfMissing = false
  } = {}
) {
  const provider =
    providerForUrl(
      tab?.url
    );

  if (
    !provider ||
    !Number.isInteger(
      tab?.id
    )
  ) {
    return false;
  }

  try {
    const payload =
      await extractCurrentEmailForFeedback(
        tab,
        provider,
        50000
      );

    const states =
      await getTabStates();

    const state =
      states[
        String(
          tab.id
        )
      ];

    const clientEventId =
      state?.hybrid_analysis_id;

    const outcome =
      String(
        state?.fusion
          ?.final_result ||
        ""
      ).toUpperCase();

    const matchingCompletedResult =
      state?.email_detector
        ?.state === "complete" &&
      clientEventId &&
      COMPLETE_CLOUD_STATUSES
        .has(outcome) &&
      buildEmailFingerprint(
        payload
      ) ===
        state.email_detector
          ?.fingerprint;

    const matchingAnalysisInProgress =
      state?.email_detector
        ?.state === "analyzing" &&
      buildEmailFingerprint(
        payload
      ) ===
        state.email_detector
          ?.fingerprint;

    if (
      matchingAnalysisInProgress
    ) {
      return true;
    }

    const cloudReviewCompleted =
      COMPLETE_CLOUD_STATUSES.has(
        String(
          state?.llm_review
            ?.status ||
          ""
        ).toUpperCase()
      );

    if (
      matchingCompletedResult &&
      reanalyzeIfMissing &&
      cloudReviewCompleted &&
      state?.llm_review
        ?.body_context_sent_to_provider !==
          true
    ) {
      return Boolean(
        await analyzeOpenedEmail(
          payload,
          tab,
          {
            force: true,
            showAutomaticPopup:
              false
          }
        )
      );
    }

    if (
      !matchingCompletedResult
    ) {
      if (
        reanalyzeIfMissing
      ) {
        return Boolean(
          await analyzeOpenedEmail(
            payload,
            tab,
            {
              force: true,
              showAutomaticPopup:
                false
            }
          )
        );
      }

      return false;
    }

    // Re-submit the matching request so expired server memory is restored.
    // The stable event ID keeps history deduplicated; this path opens no popup.
    // Replay the original authentication observation, not an expired UI cache.
    payload.sender_authentication = state.email_detector.sender_authentication || payload.sender_authentication || {};
    await fetchHybridEmail(payload, String(tab.url || ""), clientEventId, true);
    return true;
  } catch {
    return false;
  }
}


async function submitCurrentEmailFeedback(
  message
) {
  if (
    message?.confirmed !== true ||
    ![
      "CORRECT",
      "INCORRECT",
      "UNSURE"
    ].includes(
      message?.verdict
    ) ||
    (
      message?.verdict ===
        "INCORRECT" &&
      ![
        "LEGITIMATE",
        "SUSPICIOUS"
      ].includes(
        message?.classification
      )
    )
  ) {
    throw new Error(
      "Select your email feedback and confirm the encrypted report first."
    );
  }

  if (
    !await checkDetectionAccess()
  ) {
    throw new PairingRequiredError();
  }

  const tabId =
    Number(
      message?.tab_id
    );

  if (
    !Number.isInteger(
      tabId
    )
  ) {
    throw new Error(
      "The current email tab is unavailable."
    );
  }

  const tab =
    await chrome.tabs.get(
      tabId
    );

  const provider =
    providerForUrl(
      tab?.url
    );

  const states =
    await getTabStates();

  const state =
    states[
      String(
        tabId
      )
    ];

  const outcome =
    String(
      state?.fusion
        ?.final_result ||
      ""
    ).toUpperCase();

  const clientEventId =
    state?.hybrid_analysis_id;

  if (
    !provider ||
    state?.email_detector
      ?.state !==
        "complete" ||
    !COMPLETE_CLOUD_STATUSES
      .has(
        outcome
      ) ||
    !clientEventId
  ) {
    throw new Error(
      "Wait for the current email result to finish before submitting feedback."
    );
  }

  const payload =
    await extractCurrentEmailForFeedback(
      tab,
      provider
    );

  if (
    buildEmailFingerprint(
      payload
    ) !==
      state.email_detector
        ?.fingerprint
  ) {
    throw new Error(
      "The opened email changed. Review the current result instead."
    );
  }

  const reportPayload = {
    client_event_id:
      clientEventId,
    provider:
      provider.id,
    sender:
      payload.sender ||
      "",
    subject:
      payload.subject ||
      "",
    verdict:
      message.verdict,
    classification:
      message.verdict ===
      "INCORRECT"
        ? message.classification
        : undefined,
    reason:
      message.verdict ===
      "INCORRECT" &&
      message.reason
        ? message.reason
        : undefined,
    confirmed:
      true
  };

  let response =
    await authenticatedFetch(
      "/email-reports/from-device-activity",
      {
        method:
          "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify(reportPayload)
      }
    );

  if (response.status === 428) {
    response = await authenticatedFetch(
      "/email-reports/from-device-activity",
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({...reportPayload, body: payload.body})
      }
    );
  }

  if (
    !response.ok
  ) {
    let detail =
      "BantAI could not submit this email report.";

    try {
      const problem =
        await response.json();

      if (
        typeof problem?.detail ===
          "string"
      ) {
        detail =
          problem.detail;
      }
    } catch {
      // Keep the short client-side error for non-JSON failures.
    }

    throw new Error(
      detail
    );
  }

  return response.json();
}


async function submitCurrentUrlFeedback(message) {
  if (
    !["CORRECT", "INCORRECT", "UNSURE"].includes(message?.verdict) ||
    (message?.verdict === "INCORRECT" && !["LEGITIMATE", "SUSPICIOUS"].includes(message?.classification))
  ) {
    throw new Error("Select your website feedback before submitting.");
  }
  const tabId = Number(message?.tab_id);
  const states = await getTabStates();
  const state = states[String(tabId)];
  const clientEventId = state?.url_detector?.activity_event_id;
  const currentUrl = state?.current_url;
  if (
    !Number.isInteger(tabId) ||
    state?.url_detector?.state !== "complete" ||
    !clientEventId ||
    clientEventId !== message?.client_event_id ||
    currentUrl !== message?.url
  ) {
    throw new Error("This website result changed. Review the current result instead.");
  }
  const tab = await chrome.tabs.get(tabId);
  if (tab.url !== currentUrl) {
    throw new Error("This website result changed. Review the current result instead.");
  }
  const reportPayload = {
    client_event_id: clientEventId,
    verdict: message.verdict,
    classification: message.verdict === "INCORRECT" ? message.classification : undefined,
    reason: message.verdict === "INCORRECT" ? message.reason : undefined,
    confirmed: true
  };
  let response = await authenticatedFetch("/url-reports/from-device-activity", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(reportPayload)
  });
  if (response.status === 428) {
    response = await authenticatedFetch("/url-reports/from-device-activity", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({...reportPayload, url: currentUrl})
    });
  }
  if (!response.ok) {
    throw new Error(await responseProblem(response, "BantAI could not submit this website feedback."));
  }
  return response.json();
}


async function pairExtension(code, deviceLabel) {
  if (new URL(API_BASE).hostname.endsWith(".invalid")) {
    throw new Error("This extension has no BantAI server configured. Ask the administrator to configure the public API address and reload the extension.");
  }
  let response;
  try {
    response = await fetch(`${API_BASE}/extension/pair`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({code, device_label: deviceLabel}),
      signal: AbortSignal.timeout(30000)
    });
  } catch {
    throw new Error("Cannot reach the BantAI pairing server. Check your connection and the extension's configured API address, then try again.");
  }
  if (!response.ok) {
    const fallback = response.status >= 500
      ? "The BantAI pairing service is unavailable. Try again shortly."
      : response.status === 404
        ? "The configured server does not provide BantAI extension pairing. Ask the administrator to check the API address and server version."
        : "BantAI could not pair this device. Generate a fresh code from the dashboard and try again.";
    throw new Error(await responseProblem(response, fallback));
  }
  const result = await response.json();
  if (!result?.device_token) {
    throw new Error("BantAI did not return a device credential.");
  }
  await restrictCredentialStorage();
  await chrome.storage.local.set({[STORAGE_KEYS.deviceCredential]: result.device_token});
  detectionAccessCache.checkedAt = 0;
  await checkDetectionAccess(true);
  return {device_id: result.device_id, user_email: result.user_email};
}


async function disconnectExtension() {
  try {
    const response = await authenticatedFetch("/extension/device", {method: "DELETE"});
    if (!response.ok) {
      throw new Error("The BantAI server could not revoke this extension connection.");
    }
  } catch (error) {
    // A missing/revoked credential is already disconnected. On transport
    // failures retain the credential so the user can retry server revocation.
    if (!isPairingRequiredError(error)) {
      throw error;
    }
  }
  await chrome.storage.local.remove(STORAGE_KEYS.deviceCredential);
  detectionAccessCache.enabled = false;
  detectionAccessCache.checkedAt = 0;
  await clearDetectionState("Connect this browser extension to your BantAI account.");
  return {disconnected: true};
}


function isDangerousOutcome(outcome) {
  return ["SUSPICIOUS_SIGNS_FOUND", "DANGEROUS"]
    .includes(String(outcome || "").toUpperCase());
}


async function tabStillAtUrl(tabId, expectedUrl) {
  try {
    return (await chrome.tabs.get(tabId)).url === expectedUrl;
  } catch {
    return false;
  }
}


function dangerousModalPayload(state, source, expectedUrl) {
  const website = state?.url_detector?.result || {};
  const websiteOutcome = website.final_result || state?.url_detector?.signal || "UNAVAILABLE";
  const email = state?.email_detector || {};
  const emailOutcome = source === "EMAIL"
    ? state?.fusion?.final_result || email.signal || "UNAVAILABLE"
    : "NOT DETECTED";
  const markers = source === "EMAIL" ? [
    ...(state?.local_indicators?.markers || []),
    ...(state?.llm_review?.indicators || [])
  ] : [];

  return {
    expectedUrl,
    targetUrl: state?.current_url || expectedUrl,
    targetDomain: state?.hostname || hostnameForUrl(expectedUrl),
    finalDecision: isDangerousOutcome(websiteOutcome) ? websiteOutcome : emailOutcome,
    isEmail: source === "EMAIL",
    websiteAnalysis: {
      signal: websiteOutcome,
      explanation: website.message || website.model_message || "The website address needs careful review."
    },
    emailAnalysis: {
      signal: emailOutcome,
      isDetected: source === "EMAIL",
      provider: email.provider_label || state?.provider_label || "",
      sender: source === "EMAIL" ? email.sender || "" : "",
      subject: source === "EMAIL" ? email.subject || "" : "",
      explanation: source === "EMAIL"
        ? state?.fusion?.message || state?.llm_review?.reasoning_summary || email.result?.message || "The opened email needs careful review."
        : "No email content was found on this page."
    },
    indicators: markers.slice(0, 12).map(marker => ({
      category: String(marker?.category || "").slice(0, 80),
      title: String(marker?.title || marker?.category || "").slice(0, 120)
    }))
  };
}


async function showDangerousResultModal(tab, state, source, eventId) {
  const tabId = tab?.id;
  const expectedUrl = String(tab?.url || "");
  if (!Number.isInteger(tabId) || !canScanAddressBarUrl(expectedUrl) || !eventId) return false;

  const websiteOutcome = state?.url_detector?.result?.final_result || state?.url_detector?.signal;
  const emailOutcome = source === "EMAIL" ? state?.fusion?.final_result : null;
  if (!isDangerousOutcome(websiteOutcome) && !isDangerousOutcome(emailOutcome)) return false;

  const pending = dangerModalRequests.get(tabId);
  if (pending?.eventId === eventId) return pending.promise;
  if (pending) await pending.promise;

  const promise = (async () => {
    try {
      const currentTab = await chrome.tabs.get(tabId);
      if (currentTab.url !== expectedUrl) return false;
      const states = await getTabStates();
      const current = states[String(tabId)];
      if (!current?.current_url ||
          new URL(current.current_url).href !== new URL(expectedUrl).href) return false;
      const currentEventId = source === "EMAIL"
        ? current?.hybrid_analysis_id
        : current?.url_detector?.activity_event_id;
      if (currentEventId !== eventId) return false;
      if (current?.danger_modal_event_id === eventId) return true;

      const message = {
        type: "BANTAI_SHOW_ANALYSIS_MODAL",
        data: dangerousModalPayload(current, source, expectedUrl)
      };
      let response;
      try {
        response = await chrome.tabs.sendMessage(tabId, message);
      } catch {
        // The modal script has not been installed in this document yet.
      }
      if (!response?.ok) {
        await chrome.scripting.executeScript({
          target: {tabId},
          files: ["content/analysis-modal.js"]
        });
        response = await chrome.tabs.sendMessage(tabId, message);
      }
      if (!response?.ok) return false;
      if (!await tabStillAtUrl(tabId, expectedUrl)) return false;
      await patchTabState(tabId, previous => ({
        ...previous,
        danger_modal_event_id: eventId
      }));
      return true;
    } catch {
      // A restricted browser page cannot host the modal; retain the red badge
      // and allow the regular toolbar popup to show the completed result.
      console.warn("[BantAI v1.1.0] DANGER_MODAL_OPEN_FAILED");
      return false;
    }
  })();

  dangerModalRequests.set(tabId, {eventId, promise});
  try {
    return await promise;
  } finally {
    if (dangerModalRequests.get(tabId)?.promise === promise) {
      dangerModalRequests.delete(tabId);
    }
  }
}


async function openFiveSecondPopup(
  tab,
  fingerprint,
  reason = "new_email",
  urlResult = null
) {
  const tabId =
    tab?.id;

  const windowId =
    tab?.windowId;

  if (
    !Number.isInteger(
      tabId
    )
  ) {
    return false;
  }

  const createdAt =
    Date.now();

  let siteFingerprint = "";
  let seenSites = {};
  let warning = false;
  if (urlResult) {
    siteFingerprint = await popupSiteFingerprint(urlResult.url);
    if (!siteFingerprint) return false;
    try {
      const stored = await chrome.storage.session.get(STORAGE_KEYS.autoPopupSites);
      const value = stored[STORAGE_KEYS.autoPopupSites];
      seenSites = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      // Do not open a repeat safe-site popup if the session guard is unavailable.
      return false;
    }
    warning = ["SUSPICIOUS", "SUSPICIOUS_SIGNS_FOUND", "DANGEROUS"]
      .includes(String(urlResult.outcome || "").toUpperCase());
    if (!warning && Object.hasOwn(seenSites, siteFingerprint)) return false;
  }

  const fingerprintHash =
    compactHash(
      fingerprint
    );

  const existingPopup =
    automaticPopupStates.get(
      tabId
    );

  if (
    existingPopup?.fingerprintHash === fingerprintHash ||
    (existingPopup?.deadline > createdAt && !warning)
  ) {
    return false;
  }

  automaticPopupStates.set(
    tabId,
    {
      fingerprintHash,
      deadline:
        createdAt +
        AUTO_POPUP_DURATION_MS
    }
  );

  let storedPopup =
    null;

  try {
    storedPopup =
      (
        await chrome.storage
          .session
          .get(
            STORAGE_KEYS.autoPopup
          )
      )[STORAGE_KEYS.autoPopup];
  } catch {
    // The in-memory guard still prevents duplicate opening in this worker.
  }

  if (
    storedPopup?.deadline > createdAt && !warning
  ) {
    automaticPopupStates.set(
      tabId,
      {
        fingerprintHash:
          storedPopup.fingerprint_hash ||
          "",
        deadline:
          storedPopup.deadline
      }
    );
    return false;
  }

  if (
    storedPopup?.tab_id ===
      tabId &&
    storedPopup?.fingerprint_hash ===
      fingerprintHash
  ) {
    return false;
  }

  const token =
    `${tabId}:${
      createdAt
    }:${
      compactHash(
        fingerprint
      )
    }`;

  try {
    await chrome.storage
      .session
      .set({
        [STORAGE_KEYS.autoPopup]: {
          token,
          fingerprint_hash:
            fingerprintHash,
          tab_id:
            tabId,
          created_at:
            createdAt,
          deadline:
            createdAt +
            AUTO_POPUP_DURATION_MS,
          duration_ms:
            AUTO_POPUP_DURATION_MS,
          consumed:
            false,
          reason
        }
      });
  } catch (error) {
      console.warn("[BantAI v1.1.0] AUTO_POPUP_STATE_STORE_FAILED");
    return false;
  }

  try {
    if (
      typeof chrome.action
        ?.openPopup !==
      "function"
    ) {
      throw new Error(
        "Automatic popup opening requires Chrome or Chromium 127 or newer."
      );
    }

    if (
      Number.isInteger(
        windowId
      )
    ) {
      await chrome.action
        .openPopup({
          windowId
        });
    } else {
      await chrome.action
        .openPopup();
    }

    if (siteFingerprint) {
      try {
        const recentSites = Object.entries(seenSites).slice(-255);
        await chrome.storage.session.set({
          [STORAGE_KEYS.autoPopupSites]: Object.fromEntries([
            ...recentSites,
            [siteFingerprint, createdAt]
          ])
        });
      } catch {
        console.warn("[BantAI v1.1.0] AUTO_POPUP_SITE_STORE_FAILED");
      }
    }

    return true;
  } catch (error) {
    try {
      await chrome.action
        .setBadgeBackgroundColor({
          tabId,
          color:
            "#1565C0"
        });

      await chrome.action
        .setBadgeText({
          tabId,
          text:
            "NEW"
        });
    } catch {
      // No-op fallback.
    }

      console.warn("[BantAI v1.1.0] AUTO_POPUP_OPEN_FAILED");

    return false;
  }
}


async function injectProviderScript(
  tabId,
  url
) {
  if (
    !await checkDetectionAccess()
  ) {
    return;
  }

  const provider =
    providerForUrl(
      url
    );

  if (
    !provider ||
    !Number.isInteger(
      tabId
    )
  ) {
    return;
  }

  try {
    await chrome.scripting
      .executeScript({
        target: {
          tabId,
          allFrames:
            false
        },
        files: [
          "content/sender-authentication.js",
          provider.scriptFile
        ]
      });
  } catch (error) {
    const message =
      String(
        error?.message ||
        error
      );

    if (
      !message.includes(
        "Cannot access"
      )
    ) {
      console.debug("[BantAI v1.1.0] PROVIDER_INJECTION_MESSAGE");
    }
  }
}


async function scanActiveTab(
  reason,
  force = true
) {
  const tabs =
    await chrome.tabs.query({
      active:
        true,
      lastFocusedWindow:
        true
    });

  const tab =
    tabs[0];

  if (!tab) {
    return null;
  }

  await injectProviderScript(
    tab.id,
    tab.url
  );

  return scanCurrentTabUrl(
    tab,
    {
      force,
      reason
    }
  );
}


async function initializeExistingTabs() {
  if (
    !await checkDetectionAccess(
      true
    )
  ) {
    return;
  }

  const tabs =
    await chrome.tabs.query({});

  for (
    const tab of
    tabs
  ) {
    if (
      Number.isInteger(
        tab.id
      )
    ) {
      await injectProviderScript(
        tab.id,
        tab.url
      );
    }
  }

  await scanActiveTab(
    "extension_initialization",
    true
  );
}


chrome.runtime.onInstalled
  .addListener(
    () => {
      void restrictCredentialStorage();
      void checkServer();
      void initializeExistingTabs();
    }
  );


chrome.runtime.onStartup
  .addListener(
    () => {
      void restrictCredentialStorage();
      void checkServer();
      void initializeExistingTabs();
    }
  );


chrome.tabs.onActivated
  .addListener(
    (
      activeInfo
    ) => {
      void chrome.tabs
        .get(
          activeInfo.tabId
        )
        .then(
          async (tab) => {
            await injectProviderScript(
              tab.id,
              tab.url
            );

            await scanCurrentTabUrl(
              tab,
              {
                force:
                  false,
                reason:
                  "tab_switched"
              }
            );

            await restoreCurrentEmailDetailContext(
              tab
            );
          }
        )
        .catch(
          () => {}
        );
    }
  );


chrome.tabs.onUpdated
  .addListener(
    (
      tabId,
      changeInfo,
      tab
    ) => {
      if (
        changeInfo.url
      ) {
        void injectProviderScript(
          tabId,
          changeInfo.url
        );

        void scanCurrentTabUrl(
          {
            ...tab,
            id:
              tabId,
            url:
              changeInfo.url
          },
          {
            force:
              true,
            reason:
              "address_bar_changed"
          }
        );

        return;
      }

      if (
        changeInfo.status ===
          "complete"
      ) {
        void injectProviderScript(
          tabId,
          tab.url
        ).then(
          () =>
            restoreCurrentEmailDetailContext({
              ...tab,
              id: tabId
            })
        ).catch(
          () => {}
        );

        void scanCurrentTabUrl(
          tab,
          {
            force:
              false,
            reason:
              "page_loaded"
          }
        );
      }
    }
  );


chrome.tabs.onRemoved
  .addListener(
    (
      tabId
    ) => {
      urlSequences.delete(
        tabId
      );

      urlAnalysisRequests.delete(
        tabId
      );

      emailSequences.delete(
        tabId
      );

      popupFingerprints.delete(
        tabId
      );

      automaticPopupStates.delete(
        tabId
      );

      dangerModalRequests.delete(
        tabId
      );

      void removeTabState(
        tabId
      );
    }
  );


chrome.windows.onFocusChanged
  .addListener(
    (
      windowId
    ) => {
      if (
        windowId ===
        chrome.windows
          .WINDOW_ID_NONE
      ) {
        return;
      }

      void scanActiveTab(
        "window_focused",
        false
      );
    }
  );


chrome.runtime.onMessage
  .addListener(
    (
      message,
      sender,
      sendResponse
    ) => {
      if (message?.type === "BANTAI_RAW_SENDER_AUTHENTICATION") {
        void (async () => {
          const rawTab = sender.tab;
          if (providerForUrl(rawTab?.url)?.id !== "yahoo" || !Number.isInteger(rawTab?.openerTabId)) return;
          const tab = await chrome.tabs.get(rawTab.openerTabId);
          const provider = providerForUrl(tab.url);
          if (provider?.id !== "yahoo") return;
          const payload = await extractCurrentEmailForFeedback(tab, provider, 50000);
          if (String(payload.sender || "").toLowerCase() !== String(message.sender_address || "").toLowerCase() || payload.subject !== message.subject) return;
          const states = await getTabStates();
          if (states[String(tab.id)]?.email_detector?.fingerprint !== buildEmailFingerprint(payload)) return;
          payload.sender_authentication = message.authentication || {};
          const accepted = await chrome.tabs.sendMessage(tab.id, {
            type: "BANTAI_REMEMBER_SENDER_AUTHENTICATION", url: tab.url, payload
          });
          if (accepted) await analyzeOpenedEmail(payload, tab, {showAutomaticPopup: false});
        })().catch(() => {});
        sendResponse({received: true});
        return false;
      }
      const extractedTypes =
        new Set([
          "BANTAI_GMAIL_EMAIL_EXTRACTED",
          "BANTAI_OUTLOOK_EMAIL_EXTRACTED",
          "BANTAI_YAHOO_EMAIL_EXTRACTED"
        ]);

      if (
        extractedTypes.has(
          message?.type
        )
      ) {
        const payload =
          message?.payload
            ?.nlp_payload;

        if (
          payload &&
          sender?.tab
        ) {
          void analyzeOpenedEmail(
            payload,
            sender.tab
          );
        }

        sendResponse({
          received:
            true
        });

        return false;
      }

      if (
        message?.type ===
          "BANTAI_GMAIL_EXTRACTOR_STATUS"
      ) {
        const tabId =
          sender?.tab?.id;

        if (
          Number.isInteger(
            tabId
          ) &&
          message?.payload
            ?.status ===
              "NO_OPEN_EMAIL_FOUND"
        ) {
          void checkDetectionAccess()
            .then(
              (enabled) => {
                if (!enabled) {
                  return;
                }

                return patchTabState(
                  tabId,
                  (current) => ({
                    ...current,
                    email_detector: {
                      state:
                        "waiting",
                      provider:
                        "gmail",
                      provider_label:
                        "Gmail",
                      message:
                        "Open an email to check its message."
                    }
                  })
                );
              }
            );
        }

        sendResponse({
          received:
            true
        });

        return false;
      }

      if (
        message?.type ===
          "BANTAI_GET_CONNECTION"
      ) {
        void checkDetectionAccess(true).then(async () => {
          const stored = await chrome.storage.session.get(STORAGE_KEYS.access);
          const access = stored[STORAGE_KEYS.access] || {};
          const token = await deviceCredential();
          sendResponse({
            ok: true,
            connected: Boolean(token),
            detection_enabled: access.enabled === true,
            access_message: access.message || "Connect this browser extension to your BantAI account.",
            user_email: access.user_email || null
          });
        }).catch((error) => sendResponse({
          ok: false,
          connected: false,
          detection_enabled: false,
          detail: String(error?.message || error)
        }));
        return true;
      }

      if (
        message?.type ===
          "BANTAI_PAIR_EXTENSION"
      ) {
        void pairExtension(message.code, message.device_label).then(
          (result) => sendResponse({ok: true, result})
        ).catch(
          (error) => sendResponse({ok: false, detail: String(error?.message || error)})
        );
        return true;
      }

      if (
        message?.type ===
          "BANTAI_DISCONNECT_EXTENSION"
      ) {
        void disconnectExtension().then(
          (result) => sendResponse({ok: true, result})
        ).catch(
          (error) => sendResponse({ok: false, detail: String(error?.message || error)})
        );
        return true;
      }

      if (
        message?.type ===
          "BANTAI_SUBMIT_URL_FEEDBACK"
      ) {
        void submitCurrentUrlFeedback(message).then(
          (result) => sendResponse({ok: true, result})
        ).catch(
          (error) => sendResponse({ok: false, detail: String(error?.message || error)})
        );
        return true;
      }

      if (
        message?.type ===
          "BANTAI_PAIRING_CHANGED"
      ) {
        void checkDetectionAccess(
          true
        ).then(
          (enabled) => {
            if (enabled) {
              return scanActiveTab(
                "account_connected",
                true
              );
            }

            return null;
          }
        );

        sendResponse({
          received:
            true
        });

        return false;
      }

      if (
        message?.type ===
          "BANTAI_GET_CAPABILITIES"
      ) {
        sendResponse({
          version:
            VERSION,
          detection_enabled:
            detectionAccessCache
              .enabled,
          cloud_url_review:
            true,
          origin_only_url_payload:
            true
        });

        return false;
      }

      if (
        message?.type ===
          "BANTAI_REFRESH_ACTIVE_TAB"
      ) {
        void scanActiveTab(
          "popup_opened",
          true
        ).then(async () => {
          const tabs =
            await chrome.tabs.query({
              active: true,
              lastFocusedWindow: true
            });

          if (tabs[0]) {
            await restoreCurrentEmailDetailContext(
              tabs[0],
              {
                reanalyzeIfMissing:
                  true
              }
            );
          }

          return checkServer();
        });

        sendResponse({
          received:
            true
        });

        return false;
      }

      if (
        message?.type ===
          "BANTAI_SUBMIT_EMAIL_FEEDBACK"
      ) {
        void submitCurrentEmailFeedback(
          message
        ).then(
          (result) => {
            sendResponse({
              ok:
                true,
              result
            });
          }
        ).catch(
          (error) => {
            sendResponse({
              ok:
                false,
              detail:
                String(
                  error?.message ||
                  error ||
                  "BantAI could not submit this email report."
                )
            });
          }
        );

        return true;
      }

      if (
        message?.type ===
          "BANTAI_CHECK_SERVER"
      ) {
        void checkServer();

        sendResponse({
          received:
            true
        });

        return false;
      }

      sendResponse({
        received:
          false
      });

      return false;
    }
  );

void restrictCredentialStorage();


console.log("[BantAI] SERVICE_WORKER_STARTED");

void checkServer();
void initializeExistingTabs();
