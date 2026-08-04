const VERSION =
  "1.0.0";

const API_BASE =
  "http://127.0.0.1:8000";

const STORAGE_KEYS = {
  tabStates:
    "bantai_v100_tab_states",
  server:
    "bantai_v100_server",
  autoPopup:
    "bantai_v100_auto_popup"
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

const urlSequences =
  new Map();

const emailSequences =
  new Map();

const tabUpdateQueues =
  new Map();

const popupFingerprints =
  new Map();


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
      ?.signal ||
    "";

  try {
    if (
      signal ===
      "SUSPICIOUS"
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
      "SAFE"
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

    await chrome.action
      .setBadgeText({
        tabId,
        text:
          ""
      });
  } catch (error) {
    console.debug(
      "[BantAI v1.0.0] Badge update failed:",
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

  if (
    !force &&
    existing
      ?.url_detector
      ?.state ===
        "complete" &&
    existing
      ?.url_detector
      ?.result
      ?.current_url ===
        currentUrl
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
                currentUrl
            })
        }
      );

    if (!response.ok) {
      const text =
        await response.text();

      throw new Error(
        `URL detector HTTP ${
          response.status
        }: ${text}`
      );
    }

    const result =
      await response.json();

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
          hostname:
            result.hostname ||
            hostnameForUrl(
              currentUrl
            ),
          url_detector: {
            state:
              "complete",
            signal:
              result.signal,
            result,
            reason,
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

    if (reason !== "new_email_opened" && tab) {
      void openFiveSecondPopup(
        tab,
        currentUrl,
        "url_scanned"
      );
    }

    return state
      ?.url_detector ||
      null;
  } catch (error) {
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
      "[BantAI v1.0.0] Ignoring email extraction outside a matching supported provider."
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
      fingerprint &&
    Date.now() -
      priorPopup.timestamp <
      3000
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
      }
    })
  );

  const urlPromise =
    scanCurrentTabUrl(
      tab,
      {
        force:
          true,
        reason:
          "new_email_opened"
      }
    );

  const emailPromise =
    fetch(
      `${API_BASE}/analyze-email`,
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
              ""
          })
      }
    ).then(
      async (response) => {
        if (!response.ok) {
          const text =
            await response.text();

          throw new Error(
            `Email detector HTTP ${
              response.status
            }: ${text}`
          );
        }

        return response.json();
      }
    );

  const [
    urlOutcome,
    emailOutcome
  ] =
    await Promise.allSettled([
      urlPromise,
      emailPromise
    ]);

  if (
    emailSequences.get(
      tabId
    ) !== sequence
  ) {
    return null;
  }

  if (
    emailOutcome.status ===
      "fulfilled"
  ) {
    const result =
      emailOutcome.value;

    await patchTabState(
      tabId,
      (current) => ({
        ...current,
        email_detector: {
          state:
            "complete",
          signal:
            result.signal,
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
          result,
          completed_at:
            nowIso()
        }
      })
    );
  } else {
    await patchTabState(
      tabId,
      (current) => ({
        ...current,
        email_detector: {
          state:
            "error",
          signal:
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
          fingerprint,
          message:
            "The email check could not be completed. Make sure the BantAI server is running.",
          error:
            String(
              emailOutcome
                .reason?.message ||
              emailOutcome.reason
            )
        }
      })
    );
  }

  if (
    urlOutcome.status ===
      "rejected"
  ) {
    console.warn(
      "[BantAI v1.0.0] Current URL analysis failed while opening email:",
      urlOutcome.reason
    );
  }

  await openFiveSecondPopup(
    tab,
    fingerprint
  );

  return true;
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
    return;
  }

  const token =
    `${tabId}:${
      Date.now()
    }:${
      compactHash(
        fingerprint
      )
    }`;

  await chrome.storage
    .session
    .set({
      [STORAGE_KEYS.autoPopup]: {
        token,
        tab_id:
          tabId,
        created_at:
          Date.now(),
        deadline:
          Date.now() +
          AUTO_POPUP_DURATION_MS,
        duration_ms:
          AUTO_POPUP_DURATION_MS,
        consumed:
          false,
        reason
      }
    });

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
      "[BantAI v1.0.0] Automatic popup could not be opened:",
      error
    );
  }
}


async function injectProviderScript(
  tabId,
  url
) {
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
        `[BantAI v1.0.0] ${
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
                  true,
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
              true,
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
        true
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
          void patchTabState(
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

        sendResponse({
          received:
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
  `[BantAI v${VERSION}] Dual Detector service worker started.`
);

void checkServer();
void initializeExistingTabs();
