const VERSION =
  "1.1.0";

const API_BASE =
  "http://127.0.0.1:8000";

const STORAGE_KEYS = {
  tabStates:
    "bantai_v110_tab_states",
  server:
    "bantai_v110_server",
  autoPopup:
    "bantai_v110_auto_popup",
  access:
    "bantai_v110_access"
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

const emailSequences =
  new Map();

const tabUpdateQueues =
  new Map();

const popupFingerprints =
  new Map();

const automaticPopupStates =
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
  emailSequences.clear();
  popupFingerprints.clear();
  automaticPopupStates.clear();

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
      STORAGE_KEYS.autoPopup
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
          await fetch(
            `${API_BASE}/companion/status`,
            {
              cache:
                "no-store",
              signal:
                controller.signal
            }
          );

        if (!response.ok) {
          throw new Error(
            `Companion status HTTP ${response.status}`
          );
        }

        const status =
          await response.json();
        const enabled =
          status
            ?.detection_enabled ===
          true;
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
      } catch {
        const message =
          "BantAI cannot verify a paired account. Start the Companion and check the shared service.";

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
      await fetch(
        `${API_BASE}/health`,
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


async function submitCompanionActivity(
  activity
) {
  try {
    await fetch(
      `${API_BASE}/companion/activity`,
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
    // Local results are authoritative; dashboard delivery is best-effort and
    // the companion keeps a bounded protected retry outbox when paired.
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
    console.debug(
      "[BantAI v1.1.0] Badge update failed:",
      error
    );
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
  cloudAiReview
) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => {
        controller.abort();
      },
      cloudAiReview
        ? 15000
        : 30000
    );

  try {
    const response =
      await fetch(
        `${API_BASE}/analyze-url`,
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
              cloud_ai_review:
                cloudAiReview
            }),
          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      const detail =
        await response.text();

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        throw new PairingRequiredError();
      }

      throw new Error(
        `URL detector HTTP ${response.status}: ${detail}`
      );
    }

    return response.json();
  } finally {
    clearTimeout(
      timeoutId
    );
  }
}


async function scanCurrentTabUrl(
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
              "complete",
            signal:
              result.final_result ||
              result.signal,
            result,
            cloud_review:
              shouldRunCloudReview
                ? {
                    enabled: true,
                    status: "CHECKING",
                    provider: "gemini",
                    reasoning_summary:
                      "Only the website origin is being reviewed. Page content is not shared."
                  }
                : result.llm_review,
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

    await checkServer();

    if (!shouldRunCloudReview) {
      await submitCompanionActivity({
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
          "COMPLETE",
        occurred_at:
          state?.url_detector
            ?.completed_at ||
          nowIso()
      });

      return state
        ?.url_detector ||
        null;
    }

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

      state =
        await patchTabState(
          tabId,
          (current) => ({
            ...current,
            url_detector: {
              ...current.url_detector,
              cloud_review: {
                enabled: true,
                status: "UNAVAILABLE",
                provider: "gemini",
                reasoning_summary:
                  "Cloud URL Review could not be completed. The local URL warning still applies."
              }
            }
          })
        );
    }

    const finalUrlResult =
      state?.url_detector
        ?.result ||
      result;

    await submitCompanionActivity({
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


async function fetchHybridEmail(
  payload,
  currentUrl,
  cloudAiReview
) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => {
        controller.abort();
      },
      cloudAiReview
        ? 15000
        : 30000
    );

  try {
    const response =
      await fetch(
        `${API_BASE}/analyze-hybrid-email`,
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
              cloud_ai_review:
                cloudAiReview
            }),
          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      if (
        response.status === 401 ||
        response.status === 403
      ) {
        throw new PairingRequiredError();
      }

      throw new Error(
        `Hybrid detector HTTP ${
          response.status
        }`
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


async function analyzeOpenedEmail(
  payload,
  tab
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

  const priorPopup =
    popupFingerprints.get(
      tabId
    );

  if (
    priorPopup?.fingerprint ===
      fingerprint
  ) {
    return null;
  }

  popupFingerprints.set(
    tabId,
    {
      fingerprint,
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
          "Cloud AI Review will run after local checks finish."
      },
      fusion: null,
      local_fusion: null
    })
  );

  const currentUrl =
    String(
      tab.url ||
      ""
    );

  let localResult;

  try {
    localResult =
      await fetchHybridEmail(
        payload,
        currentUrl,
        false
      );
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

    await patchTabState(
      tabId,
      (current) => ({
        ...current,
        url_detector: {
          state: "error",
          signal: "UNAVAILABLE",
          message:
            "The website check could not be completed. Make sure the BantAI server is running.",
          reason:
            "new_email_opened"
        },
        email_detector: {
          state: "error",
          signal: "UNAVAILABLE",
          provider: provider.id,
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
            "The email check could not be completed. Make sure the BantAI server is running."
        },
        llm_review: {
          enabled:
            true,
          status:
            "UNAVAILABLE",
          reasoning_summary:
            "Cloud AI Review could not run because the local BantAI server is unavailable."
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
      {
        signal:
          "UNAVAILABLE"
      }
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

  const localState =
    await patchTabState(
      tabId,
      (current) => ({
        ...current,
        current_url:
          localResult.url_model
            ?.current_url ||
          currentUrl,
        hostname:
          localResult.url_model
            ?.hostname ||
          hostnameForUrl(
            currentUrl
          ),
        url_detector: {
          state: "complete",
          signal:
            localResult.url_model
              ?.signal ||
            "UNAVAILABLE",
          result:
            localResult.url_model,
          reason:
            "new_email_opened",
          completed_at:
            nowIso()
        },
        email_detector: {
          state: "complete",
          signal:
            localResult.email_model
              ?.signal ||
            "UNAVAILABLE",
          provider: provider.id,
          provider_label:
            provider.label,
          sender:
            payload?.sender ||
            null,
          subject:
            payload?.subject ||
            "",
          fingerprint,
          result:
            localResult.email_model,
          completed_at:
            nowIso()
        },
        local_indicators:
          localResult.local_indicators,
        llm_review: {
          enabled: true,
          status: "CHECKING",
          provider:
            localResult.llm_review
              ?.provider ||
            "gemini",
          reasoning_summary:
            "A limited, cleaned version of this email is being reviewed."
        },
        fusion:
          localResult.fusion,
        local_fusion:
          localResult.fusion,
        hybrid_analysis_id:
          localResult.analysis_id
      })
    );

  await updateBadge(
    tabId,
    localState?.url_detector
  );

  await checkServer();

  try {
    const cloudResult =
      await fetchHybridEmail(
        payload,
        currentUrl,
        true
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

    const updatedState =
      await patchTabState(
        tabId,
        (current) => ({
          ...current,
          url_detector: {
            state: "complete",
            signal:
              cloudResult.url_model
                ?.signal ||
              current.url_detector
                ?.signal ||
              "UNAVAILABLE",
            result:
              cloudResult.url_model ||
              current.url_detector
                ?.result,
            reason:
              "new_email_opened",
            completed_at:
              nowIso()
          },
          email_detector: {
            ...current.email_detector,
            state: "complete",
            signal:
              cloudResult.email_model
                ?.signal ||
              current.email_detector
                ?.signal,
            result:
              cloudResult.email_model ||
              current.email_detector
                ?.result,
            fingerprint
          },
          local_indicators:
            cloudResult.local_indicators ||
            current.local_indicators,
          llm_review:
            cloudResult.llm_review,
          fusion:
            cloudResult.fusion,
          hybrid_analysis_id:
            cloudResult.analysis_id
        })
      );

    await updateBadge(
      tabId,
      updatedState?.url_detector
    );

    if (
      cloudReviewIsComplete(
        cloudResult.llm_review
      )
    ) {
      await openFiveSecondPopup(
        tab,
        fingerprint,
        "email_review_complete"
      );
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

    await patchTabState(
      tabId,
      (current) => ({
        ...current,
        llm_review: {
          enabled: true,
          status: "UNAVAILABLE",
          provider: "gemini",
          reasoning_summary:
            "Cloud AI Review could not be completed. Local BantAI checks are still available."
        },
        fusion:
          current.local_fusion ||
          current.fusion
      })
    );
  }

  const completedStates =
    await getTabStates();

  const completedEmailState =
    completedStates[
      String(
        tabId
      )
    ];

  const finalEmailOutcome =
    completedEmailState
      ?.fusion
      ?.final_result;

  if (
    COMPLETE_CLOUD_STATUSES
      .has(
        String(
          finalEmailOutcome ||
          ""
        ).toUpperCase()
      )
  ) {
    await submitCompanionActivity({
      client_event_id:
        completedEmailState
          ?.hybrid_analysis_id ||
        localResult.analysis_id,
      event_type:
        "EMAIL",
      origin:
        null,
      provider:
        provider.id,
      sender:
        payload?.sender ||
        null,
      subject:
        payload?.subject ||
        "",
      outcome:
        finalEmailOutcome,
      cloud_status:
        cloudReviewIsComplete(
          completedEmailState
            ?.llm_review
        )
          ? "COMPLETE"
          : "UNAVAILABLE",
      occurred_at:
        completedEmailState
          ?.email_detector
          ?.completed_at ||
        nowIso()
    });
  }

  return true;
}


async function extractCurrentEmailForFeedback(
  tab,
  provider
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

  const extracted =
    await chrome.tabs.sendMessage(
      tab.id,
      {
        type:
          requestType
      }
    );

  const payload =
    extracted?.nlp_payload ||
    extracted;

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
    ).length > 10000
  ) {
    throw new Error(
      "This email is too long to include in a report."
    );
  }

  return payload;
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

  const response =
    await fetch(
      `${API_BASE}/companion/email-feedback`,
      {
        method:
          "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify({
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
            body:
              payload.body,
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
          })
      }
    );

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
      // Keep the short local error for non-JSON failures.
    }

    throw new Error(
      detail
    );
  }

  return response.json();
}


async function openFiveSecondPopup(
  tab,
  fingerprint,
  reason = "new_email"
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

  const fingerprintHash =
    compactHash(
      fingerprint
    );

  const existingPopup =
    automaticPopupStates.get(
      tabId
    );

  if (
    existingPopup?.fingerprintHash ===
      fingerprintHash ||
    existingPopup?.deadline >
      createdAt
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
    storedPopup?.deadline >
      createdAt
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
    console.warn(
      "[BantAI v1.1.0] Automatic popup state could not be stored:",
      error
    );
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

    console.warn(
      "[BantAI v1.1.0] Automatic popup could not be opened:",
      error
    );

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
      console.debug(
        `[BantAI v1.1.0] ${
          provider.label
        } injection:`,
        message
      );
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
      void checkServer();
      void initializeExistingTabs();
    }
  );


chrome.runtime.onStartup
  .addListener(
    () => {
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

      emailSequences.delete(
        tabId
      );

      popupFingerprints.delete(
        tabId
      );

      automaticPopupStates.delete(
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
        ).then(
          () =>
            checkServer()
        );

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


console.log(
  `[BantAI v${VERSION}] Hybrid AI Decision-Support service worker started.`
);

void checkServer();
void initializeExistingTabs();
