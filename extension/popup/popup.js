const STORAGE_KEYS = {
  tabStates:
    "bantai_v100_tab_states",
  server:
    "bantai_v100_server",
  autoPopup:
    "bantai_v100_auto_popup"
};

let activeTabId =
  null;

let countdownTimer =
  null;


const byId =
  (id) =>
    document.getElementById(
      id
    );


const elements = {
  autoPopupBanner:
    byId(
      "autoPopupBanner"
    ),
  countdownText:
    byId(
      "countdownText"
    ),
  countdownBar:
    byId(
      "countdownBar"
    ),

  serverStatus:
    byId(
      "serverStatus"
    ),
  serverStatusText:
    byId(
      "serverStatusText"
    ),

  websiteCard:
    byId(
      "websiteCard"
    ),
  websiteIcon:
    byId(
      "websiteIcon"
    ),
  websiteDomain:
    byId(
      "websiteDomain"
    ),
  websiteBadge:
    byId(
      "websiteBadge"
    ),
  websiteMessage:
    byId(
      "websiteMessage"
    ),
  websiteUrl:
    byId(
      "websiteUrl"
    ),
  websiteScore:
    byId(
      "websiteScore"
    ),
  websiteThreshold:
    byId(
      "websiteThreshold"
    ),

  emailCard:
    byId(
      "emailCard"
    ),
  emailIcon:
    byId(
      "emailIcon"
    ),
  emailContext:
    byId(
      "emailContext"
    ),
  emailBadge:
    byId(
      "emailBadge"
    ),
  emailMessage:
    byId(
      "emailMessage"
    ),
  emailMetadata:
    byId(
      "emailMetadata"
    ),
  emailSender:
    byId(
      "emailSender"
    ),
  emailSubject:
    byId(
      "emailSubject"
    ),
  emailScore:
    byId(
      "emailScore"
    ),
  emailThreshold:
    byId(
      "emailThreshold"
    ),
  emailTruncated:
    byId(
      "emailTruncated"
    ),

  guidanceCard:
    byId(
      "guidanceCard"
    ),
  guidanceTitle:
    byId(
      "guidanceTitle"
    ),
  guidanceMessage:
    byId(
      "guidanceMessage"
    )
};


function percentage(
  value
) {
  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return "—";
  }

  return `${
    (
      number *
      100
    ).toFixed(
      2
    )
  }%`;
}


function shorten(
  value,
  maximum = 120
) {
  const text =
    String(
      value ||
      ""
    );

  if (
    text.length <=
      maximum
  ) {
    return text ||
      "—";
  }

  return (
    text.slice(
      0,
      maximum - 18
    ) +
    "…" +
    text.slice(
      -17
    )
  );
}


function applyDetectorStyle(
  card,
  badge,
  icon,
  signal
) {
  const normalized =
    String(
      signal ||
      ""
    ).toUpperCase();

  const style =
    normalized ===
      "SAFE"
      ? "safe"
      : normalized ===
          "SUSPICIOUS"
        ? "suspicious"
        : normalized ===
            "ANALYZING"
          ? "analyzing"
          : normalized ===
              "UNAVAILABLE"
            ? "unavailable"
            : "neutral";

  card.className =
    `detector-card ${style}`;

  badge.className =
    `status-badge ${style}`;

  badge.textContent =
    normalized ===
      "ANALYZING"
      ? "CHECKING"
      : normalized ===
          "UNAVAILABLE"
        ? "OFF"
        : normalized ||
          "WAITING";

  icon.textContent =
    normalized ===
      "SAFE"
      ? "✓"
      : normalized ===
          "SUSPICIOUS"
        ? "!"
        : normalized ===
            "ANALYZING"
          ? "…"
          : normalized ===
              "UNAVAILABLE"
            ? "—"
            : icon ===
                elements.emailIcon
              ? "✉"
              : "…";
}


function renderServer(
  server
) {
  elements.serverStatus.className =
    "server-status checking";

  if (
    server?.status ===
      "connected"
  ) {
    elements.serverStatus
      .classList
      .add(
        "connected"
      );

    elements.serverStatusText
      .textContent =
        "Ready";

    return;
  }

  if (
    server?.status ===
      "unavailable"
  ) {
    elements.serverStatus
      .classList
      .add(
        "unavailable"
      );

    elements.serverStatusText
      .textContent =
        "Server off";

    return;
  }

  elements.serverStatusText
    .textContent =
      "Checking";
}


function renderWebsite(
  state
) {
  const detector =
    state?.url_detector ||
    {
      state:
        "waiting",
      signal:
        "WAITING",
      message:
        "Waiting for the current website."
    };

  const result =
    detector.result ||
    {};

  applyDetectorStyle(
    elements.websiteCard,
    elements.websiteBadge,
    elements.websiteIcon,
    detector.signal ||
      detector.state
  );

  elements.websiteDomain
    .textContent =
      result.hostname ||
      state?.hostname ||
      "Current browser tab";

  elements.websiteMessage
    .textContent =
      result.message ||
      detector.message ||
      "BantAI checks only the URL shown in the browser address bar.";

  elements.websiteUrl
    .textContent =
      shorten(
        result.current_url ||
        state?.current_url ||
        "—"
      );

  elements.websiteUrl.title =
    result.current_url ||
    state?.current_url ||
    "";

  elements.websiteScore
    .textContent =
      percentage(
        result
          .suspicious_probability
      );

  elements.websiteThreshold
    .textContent =
      result.threshold ??
      "—";
}


function renderEmail(
  state
) {
  const detector =
    state?.email_detector ||
    {
      state:
        "disabled",
      signal:
        "UNAVAILABLE",
      message:
        "Email checking works only in Gmail, Outlook, and Yahoo."
    };

  const signal =
    detector.signal ||
    (
      detector.state ===
        "disabled"
        ? "UNAVAILABLE"
        : detector.state ===
            "waiting"
          ? "WAITING"
          : detector.state
    );

  const result =
    detector.result ||
    {};

  applyDetectorStyle(
    elements.emailCard,
    elements.emailBadge,
    elements.emailIcon,
    signal
  );

  if (
    detector.state ===
      "disabled"
  ) {
    elements.emailContext
      .textContent =
        "Gmail, Outlook, or Yahoo only";
  } else if (
    detector.state ===
      "waiting"
  ) {
    elements.emailContext
      .textContent =
        `${
          detector.provider_label ||
          state?.provider_label ||
          "Supported email"
        } · Open an email`;
  } else {
    elements.emailContext
      .textContent =
        detector.provider_label ||
        state?.provider_label ||
        result.provider ||
        "Supported email";
  }

  elements.emailMessage
    .textContent =
      result.message ||
      detector.message ||
      "Open an email to check its message.";

  const sender =
    detector.sender ||
    result.sender ||
    "";

  const subject =
    detector.subject ||
    result.subject ||
    "";

  if (
    sender ||
    subject
  ) {
    elements.emailMetadata
      .classList
      .remove(
        "hidden"
      );

    elements.emailSender
      .textContent =
        sender ||
        "Not shown";

    elements.emailSubject
      .textContent =
        subject ||
        "No subject";
  } else {
    elements.emailMetadata
      .classList
      .add(
        "hidden"
      );
  }

  elements.emailScore
    .textContent =
      percentage(
        result
          .suspicious_probability
      );

  elements.emailThreshold
    .textContent =
      result.threshold ??
      "—";

  elements.emailTruncated
    .textContent =
      typeof result.was_truncated ===
        "boolean"
        ? (
            result.was_truncated
              ? "Yes"
              : "No"
          )
        : "—";
}


function renderGuidance(
  state
) {
  const websiteSignal =
    state?.url_detector
      ?.result
      ?.signal ||
    state?.url_detector
      ?.signal ||
    "";

  const emailSignal =
    state?.email_detector
      ?.result
      ?.signal ||
    state?.email_detector
      ?.signal ||
    "";

  const suspicious =
    websiteSignal ===
      "SUSPICIOUS" ||
    emailSignal ===
      "SUSPICIOUS";

  elements.guidanceCard
    .className =
      suspicious
        ? "guidance-card warning"
        : "guidance-card";

  if (suspicious) {
    elements.guidanceTitle
      .textContent =
        "Stop and verify";

    elements.guidanceMessage
      .textContent =
        "A warning sign was found. Do not share passwords, OTPs, personal information, or payment details until you verify the request through an official channel.";

    return;
  }

  elements.guidanceTitle
    .textContent =
      "Continue carefully";

  elements.guidanceMessage
    .textContent =
      "No strong warning sign is currently shown. Still verify unexpected requests before clicking, paying, or sharing information.";
}


function renderState(
  state
) {
  renderWebsite(
    state
  );

  renderEmail(
    state
  );

  renderGuidance(
    state
  );
}


async function loadActiveTab() {
  const tabs =
    await chrome.tabs.query({
      active:
        true,
      lastFocusedWindow:
        true
    });

  const tab =
    tabs[0];

  activeTabId =
    tab?.id ??
    null;

  return tab;
}


async function loadStoredState() {
  const stored =
    await chrome.storage
      .session
      .get([
        STORAGE_KEYS.tabStates,
        STORAGE_KEYS.server
      ]);

  renderServer(
    stored[
      STORAGE_KEYS.server
    ]
  );

  const states =
    stored[
      STORAGE_KEYS.tabStates
    ] ||
    {};

  renderState(
    states[
      String(
        activeTabId
      )
    ] ||
    {}
  );
}


async function configureAutoClose() {
  const stored =
    await chrome.storage
      .session
      .get(
        STORAGE_KEYS.autoPopup
      );

  const popup =
    stored[
      STORAGE_KEYS.autoPopup
    ];

  if (
    !popup ||
    popup.consumed ||
    popup.tab_id !==
      activeTabId
  ) {
    return;
  }

  const remaining =
    popup.deadline -
    Date.now();

  if (
    remaining <= 0
  ) {
    return;
  }

  await chrome.storage
    .session
    .set({
      [STORAGE_KEYS.autoPopup]: {
        ...popup,
        consumed:
          true,
        consumed_at:
          Date.now()
      }
    });

  elements.autoPopupBanner
    .classList
    .remove(
      "hidden"
    );

  const duration =
    Number(
      popup.duration_ms
    ) ||
    5000;

  const startedAt =
    Date.now();

  function updateCountdown() {
    const elapsed =
      Date.now() -
      startedAt;

    const timeLeft =
      Math.max(
        0,
        remaining -
        elapsed
      );

    const seconds =
      Math.max(
        1,
        Math.ceil(
          timeLeft /
          1000
        )
      );

    elements.countdownText
      .textContent =
        `Closing in ${
          seconds
        } second${
          seconds === 1
            ? ""
            : "s"
        }`;

    const ratio =
      Math.max(
        0,
        Math.min(
          1,
          timeLeft /
          duration
        )
      );

    elements.countdownBar
      .style
      .transform =
        `scaleX(${ratio})`;

    if (
      timeLeft <= 0
    ) {
      window.clearInterval(
        countdownTimer
      );

      window.close();
    }
  }

  updateCountdown();

  countdownTimer =
    window.setInterval(
      updateCountdown,
      100
    );
}


chrome.storage.onChanged
  .addListener(
    (
      changes,
      areaName
    ) => {
      if (
        areaName !==
        "session"
      ) {
        return;
      }

      if (
        changes[
          STORAGE_KEYS.server
        ]
      ) {
        renderServer(
          changes[
            STORAGE_KEYS.server
          ].newValue
        );
      }

      if (
        changes[
          STORAGE_KEYS.tabStates
        ] &&
        activeTabId !==
          null
      ) {
        const states =
          changes[
            STORAGE_KEYS.tabStates
          ].newValue ||
          {};

        renderState(
          states[
            String(
              activeTabId
            )
          ] ||
          {}
        );
      }
    }
  );


async function initialize() {
  await loadActiveTab();

  await loadStoredState();

  await configureAutoClose();

  void chrome.runtime
    .sendMessage({
      type:
        "BANTAI_CHECK_SERVER"
    });

  /*
   * A manually opened popup requests a fresh address-bar scan.
   * The service worker skips duplicate stored email content.
   */
  void chrome.runtime
    .sendMessage({
      type:
        "BANTAI_REFRESH_ACTIVE_TAB"
    });
}


void initialize();
