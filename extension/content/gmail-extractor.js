(() => {
  "use strict";

  if (
    globalThis.
      __BANTAI_GMAIL_EXTRACTOR_V100_LOADED__
  ) {
    return;
  }

  globalThis.
    __BANTAI_GMAIL_EXTRACTOR_V100_LOADED__ =
      true;

  const VERSION =
    "BANTAI_GMAIL_EXTRACTOR_V1.0.0_EMAIL_ONLY";

  let scanTimer =
    null;

  let lastEmailFingerprint =
    null;

  let lastStatusFingerprint =
    null;

  let lastObservedUrl =
    location.href;

  let scanInProgress =
    false;

  let latestExtractedPayload =
    null;

  const PERIODIC_SCAN_MS =
    1000;

  function clean(value) {
    return String(
      value ??
      ""
    )
      .replace(
        /\u00a0/g,
        " "
      )
      .replace(
        /[ \t]+/g,
        " "
      )
      .replace(
        /\n[ \t]+/g,
        "\n"
      )
      .replace(
        /\n{3,}/g,
        "\n\n"
      )
      .trim();
  }


  async function send(
    type,
    payload
  ) {
    try {
      return await chrome.runtime.sendMessage({
        type,
        payload
      });
    } catch (error) {
      /*
       * Reloading an unpacked extension invalidates old content-script
       * contexts. Ignore that expected development-only condition;
       * refreshing Gmail loads the new context.
       */
      if (
        String(
          error?.message ||
          error
        ).includes(
          "Extension context invalidated"
        )
      ) {
        return null;
      }

      console.error("[Signalam Gmail] SEND_MESSAGE_FAILED");

      return null;
    }
  }

  function findSubject() {
    const subjectNode =
      document.querySelector(
        "h2.hP"
      );

    return subjectNode
      ? clean(
          subjectNode.textContent
        )
      : "";
  }

  function findBodyCandidates() {
    const selectors = [
      ".a3s.aiL",
      ".a3s",
      "div[role='main'] .a3s"
    ];

    const seen =
      new Set();

    const results =
      [];

    for (
      const selector of
      selectors
    ) {
      for (
        const node of
        document.querySelectorAll(
          selector
        )
      ) {
        if (
          seen.has(
            node
          )
        ) {
          continue;
        }

        seen.add(
          node
        );

        const text =
          clean(
            node.innerText ||
            node.textContent
          );

        if (text) {
          results.push({
            node,
            text
          });
        }
      }
    }

    return results;
  }

  function findSender(
    bodyNode
  ) {
    const container =
      bodyNode.closest(
        ".adn.ads"
      ) ||
      bodyNode.closest(
        ".adn"
      ) ||
      bodyNode.closest(
        "[role='listitem']"
      ) ||
      bodyNode.parentElement;

    if (!container) {
      return {
        name: "",
        email: ""
      };
    }

    const sender =
      container.querySelector(
        ".gD[email]"
      ) ||
      container.querySelector(
        ".gD[data-hovercard-id]"
      ) ||
      container.querySelector(
        "[email]"
      ) ||
      container.querySelector(
        "[data-hovercard-id]"
      );

    if (!sender) {
      return {
        name: "",
        email: ""
      };
    }

    return {
      name:
        clean(
          sender.getAttribute(
            "name"
          ) ||
          sender.textContent
        ),

      email:
        clean(
          sender.getAttribute(
            "email"
          ) ||
          sender.getAttribute(
            "data-hovercard-id"
          )
        )
    };
  }

  function hashText(raw) {
    let hash =
      2166136261;

    for (
      let index = 0;
      index < raw.length;
      index += 1
    ) {
      hash ^=
        raw.charCodeAt(
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

  function makeEmailFingerprint(
    payload
  ) {
    return hashText(
      [
        payload.subject,
        payload.sender_email,
        payload.body
      ].join(
        "\u241F"
      )
    );
  }

  function makeStatusFingerprint(
    payload
  ) {
    return hashText(
      [
        payload.status,
        payload.url,
        payload.subject,
        payload.body_candidate_count
      ].join(
        "\u241F"
      )
    );
  }

  async function sendStatus(
    payload
  ) {
    const fingerprint =
      makeStatusFingerprint(
        payload
      );

    if (
      fingerprint ===
      lastStatusFingerprint
    ) {
      return;
    }

    lastStatusFingerprint =
      fingerprint;

    await send(
      "BANTAI_GMAIL_EXTRACTOR_STATUS",
      payload
    );
  }

  async function scan() {
    if (
      scanInProgress
    ) {
      return;
    }

    scanInProgress =
      true;

    try {
      const subject =
        findSubject();

    const bodies =
      findBodyCandidates();

    const status =
      bodies.length > 0 &&
      subject
        ? "EMAIL_CANDIDATE_FOUND"
        : "NO_OPEN_EMAIL_FOUND";

    await sendStatus({
      version:
        VERSION,
      status,
      url:
        location.href,
      subject,
      body_candidate_count:
        bodies.length,
      timestamp:
        new Date().
          toISOString()
    });

      if (
        !subject ||
        bodies.length === 0
      ) {
        /*
         * Reset the deduplication fingerprint when the user returns to the
         * inbox or no message is open. Re-opening the same email will then
         * trigger a fresh analysis.
         */
        lastEmailFingerprint =
          null;

        latestExtractedPayload =
          null;

        return;
      }

    const selected =
      bodies[
        bodies.length - 1
      ];

    const sender =
      findSender(
        selected.node
      );


    const payload = {
      extractor_version:
        VERSION,

      status:
        "EMAIL_EXTRACTED",

      provider:
        "gmail",

      subject,

      body:
        selected.text,

      sender_name:
        sender.name,

      sender_email:
        sender.email,

      page_url:
        location.href,

      extracted_at:
        new Date().
          toISOString(),

      diagnostics: {
        body_candidate_count:
          bodies.length,

        selected_message_strategy:
          "last_detected_message_body",

        body_char_count:
          selected.text.length,

        message_clipped_marker_detected:
          selected.text.includes(
            "[Message clipped]"
          )
      },

      nlp_payload: {
        provider:
          "gmail",

        sender:
          sender.email ||
          sender.name ||
          null,

        subject,

        body:
          selected.text
      },

      overall_risk: {
        calculated:
          false,
        level:
          null,
        score:
          null
      }
    };

    const authenticationFingerprint = await globalThis.BantAISenderAuthentication?.attach(payload) || "{}";
    const currentFingerprint = authenticationFingerprint +
      makeEmailFingerprint(
        payload
      );

    latestExtractedPayload =
      payload;

    if (
      currentFingerprint ===
      lastEmailFingerprint
    ) {
      return;
    }

    lastEmailFingerprint =
      currentFingerprint;

      await send(
        "BANTAI_GMAIL_EMAIL_EXTRACTED",
        payload
      );
    } finally {
      scanInProgress =
        false;
    }
  }

  void send(
    "BANTAI_GMAIL_CONTENT_SCRIPT_LOADED",
    {
      version:
        VERSION,
      url:
        location.href,
      timestamp:
        new Date().
          toISOString()
    }
  );

  chrome.runtime.onMessage.addListener(
    (
      message,
      _sender,
      sendResponse
    ) => {
      if (
        message?.type !==
          "BANTAI_GMAIL_GET_OPEN_EMAIL"
      ) {
        return false;
      }

      sendResponse(
        latestExtractedPayload || {
          status: "NO_OPEN_EMAIL_FOUND",
          provider: "gmail"
        }
      );

      return false;
    }
  );

  function scheduleScanBurst() {
    /*
     * Email web apps are SPAs. Opening a message may update the DOM in several
     * phases, so run a short burst of rescans.
     */
    window.setTimeout(
      () => {
        void scan();
      },
      80
    );

    window.setTimeout(
      () => {
        void scan();
      },
      350
    );

    window.setTimeout(
      () => {
        void scan();
      },
      900
    );
  }

  const observer =
    new MutationObserver(
      () => {
        clearTimeout(
          scanTimer
        );

        scanTimer =
          setTimeout(
            () => {
              void scan();
            },
            350
          );
      }
    );

  observer.observe(
    document.documentElement,
    {
      childList:
        true,
      subtree:
        true
    }
  );

  /*
   * Clicking an email row does not always cause a mutation that our observer
   * catches at the right time. Rescan after any click; fingerprinting prevents
   * duplicate analysis when the currently open email did not change.
   */
  document.addEventListener(
    "click",
    () => {
      scheduleScanBurst();
    },
    true
  );

  window.addEventListener(
    "hashchange",
    () => {
      lastEmailFingerprint =
        null;
      scheduleScanBurst();
    }
  );

  window.addEventListener(
    "popstate",
    () => {
      lastEmailFingerprint =
        null;
      scheduleScanBurst();
    }
  );

  /*
   * Poll the SPA URL because Gmail can navigate with History API updates
   * without firing hashchange/popstate in all flows.
   */
  window.setInterval(
    () => {
      if (
        location.href !==
        lastObservedUrl
      ) {
        lastObservedUrl =
          location.href;

        lastEmailFingerprint =
          null;

        scheduleScanBurst();
      }
    },
    500
  );

  /*
   * Reliable fallback: check once per second. Fingerprinting means an unchanged
   * open email is not re-sent to the model.
   */
  window.setInterval(
    () => {
      void scan();
    },
    PERIODIC_SCAN_MS
  );

  scheduleScanBurst();
})();
