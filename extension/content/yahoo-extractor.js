/*
 * BantAI Yahoo Mail Email-Content Extractor V1
 * ============================================
 *
 * BantAI milestone:
 *   v0.8 - Yahoo Mail integration
 *
 * Scope:
 *   https://mail.yahoo.com/*
 *
 * Architecture:
 *   Yahoo Mail DOM
 *       -> this content script
 *       -> chrome.runtime.sendMessage()
 *       -> unified BantAI service worker
 *       -> authenticated BantAI server API
 *       -> frozen BantAI XLM-RoBERTa email model
 *
 * IMPORTANT:
 *   - Email content only.
 *   - No overall BantAI risk calculation.
 *   - No threshold changes.
 *   - No arbitrary webpage classification.
 *   - Yahoo's rendered DOM is treated as unstable; defensive selectors
 *     and spatial heuristics are used.
 */

(() => {
  "use strict";

  if (
    globalThis.__BANTAI_YAHOO_EXTRACTOR_V100_LOADED__
  ) {
    return;
  }

  globalThis.__BANTAI_YAHOO_EXTRACTOR_V100_LOADED__ = true;

  const EXTRACTOR_VERSION =
    "BANTAI_YAHOO_EMAIL_EXTRACTOR_V24_EMAIL_ONLY";

  const MESSAGE_TYPE =
    "BANTAI_YAHOO_EMAIL_EXTRACTED";

  const REQUEST_TYPE =
    "BANTAI_YAHOO_GET_OPEN_EMAIL";

  const DEBOUNCE_MS = 900;

  let debounceTimer = null;
  let lastFingerprint = null;

  let lastObservedUrl =
    location.href;

  let scanInProgress =
    false;

  const PERIODIC_SCAN_MS =
    1200;

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }


  function directText(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    const parts = [];

    for (const node of element.childNodes) {
      if (
        node.nodeType ===
        Node.TEXT_NODE
      ) {
        const text =
          normalizeText(
            node.textContent ||
            ""
          );

        if (text) {
          parts.push(text);
        }
      }
    }

    return normalizeText(
      parts.join(" ")
    );
  }

  function isVisible(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const style =
      window.getComputedStyle(element);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity || "1") === 0
    ) {
      return false;
    }

    const rect =
      element.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= window.innerHeight &&
      rect.left <= window.innerWidth
    );
  }

  function queryAll(
    selectors,
    root = document
  ) {
    const results = [];

    for (const selector of selectors) {
      try {
        results.push(
          ...root.querySelectorAll(
            selector
          )
        );
      } catch {
        // Ignore unsupported selectors.
      }
    }

    return [
      ...new Set(results)
    ];
  }

  function extractEmailAddress(value) {
    const match =
      String(value ?? "")
        .match(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
        );

    return match
      ? match[0]
      : "";
  }

  function looksLikeDateTime(text) {
    const value =
      normalizeText(
        text
      );

    if (!value) {
      return false;
    }

    return (
      /^(mon|tue|wed|thu|fri|sat|sun)\b/i
        .test(value) ||
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/
        .test(value) ||
      /\b\d{1,2}:\d{2}\s*(am|pm)\b/i
        .test(value) ||
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i
        .test(value)
    );
  }

  function looksLikeUiText(text) {
    const value =
      normalizeText(
        text
      ).toLowerCase();

    if (!value) {
      return true;
    }

    const blocked =
      new Set([
        "yahoo",
        "mail",
        "inbox",
        "archive",
        "spam",
        "trash",
        "sent",
        "drafts",
        "starred",
        "contacts",
        "calendar",
        "settings",
        "compose",
        "reply",
        "reply all",
        "forward",
        "more",
        "delete",
        "move",
        "search",
        "conversation view",
        "side section",
        "main section",
        "navigation section",
        "unread",
        "drafts",
        "sent",
        "scheduled",
        "folders",
        "all mail",
        "message view",
        "priority",
        "other",
        "back"
      ]);

    return blocked.has(
      value
    );
  }

  function isComposeElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    return Boolean(
      element.closest(
        "[contenteditable='true'], " +
        "textarea, " +
        "[data-test-id*='compose' i], " +
        "[aria-label*='compose' i]"
      )
    );
  }

  function getRect(element) {
    return element
      .getBoundingClientRect();
  }

  function horizontalOverlap(
    a,
    b
  ) {
    const overlap =
      Math.max(
        0,
        Math.min(
          a.right,
          b.right
        ) -
        Math.max(
          a.left,
          b.left
        )
      );

    return overlap /
      Math.max(
        1,
        Math.min(
          a.width,
          b.width
        )
      );
  }

  function spatialScore(
    element,
    bodyRect
  ) {
    const rect =
      getRect(
        element
      );

    const verticalGap =
      Math.max(
        0,
        bodyRect.top -
        rect.bottom
      );

    const xDistance =
      Math.abs(
        (
          rect.left +
          rect.width / 2
        ) -
        (
          bodyRect.left +
          bodyRect.width / 2
        )
      );

    const overlap =
      horizontalOverlap(
        rect,
        bodyRect
      );

    return (
      verticalGap +
      xDistance * 0.08 -
      overlap * 100
    );
  }

  function bodyCandidateScore(
    element
  ) {
    if (
      !isVisible(
        element
      ) ||
      isComposeElement(
        element
      )
    ) {
      return -Infinity;
    }

    const text =
      normalizeText(
        element.innerText ||
        element.textContent ||
        ""
      );

    if (
      text.length < 2
    ) {
      return -Infinity;
    }

    const rect =
      getRect(
        element
      );

    let score =
      Math.min(
        text.length,
        16000
      ) / 100;

    const testId =
      normalizeText(
        element.getAttribute(
          "data-test-id"
        ) || ""
      ).toLowerCase();

    if (
      testId.includes(
        "message-view-body"
      )
    ) {
      score += 250;
    }

    if (
      testId.includes(
        "message-body"
      )
    ) {
      score += 200;
    }

    if (
      element.matches(
        "[role='article']"
      )
    ) {
      score += 100;
    }

    if (
      element.matches(
        "[role='document']"
      )
    ) {
      score += 80;
    }

    if (
      rect.width > 300
    ) {
      score += 15;
    }

    if (
      rect.height > 80
    ) {
      score += 15;
    }

    return score;
  }

  function getMessageBodyCandidates() {
    const selectors = [
      "[data-test-id='message-view-body-content']",
      "[data-test-id*='message-view-body' i]",
      "[data-test-id*='message-body' i]",
      "[data-test-id*='message-content' i]",
      "[role='main'] [role='article']",
      "[role='main'] [role='document']",
      "[role='article']",
      "[role='document']"
    ];

    return queryAll(
      selectors
    )
      .map(
        (element) => ({
          element,
          score:
            bodyCandidateScore(
              element
            )
        })
      )
      .filter(
        (entry) =>
          Number.isFinite(
            entry.score
          )
      )
      .sort(
        (a, b) =>
          a.score -
          b.score
      )
      .map(
        (entry) =>
          entry.element
      );
  }

  function getMessageContainer(
    bodyElement
  ) {
    const selectors = [
      "[data-test-id*='message-view' i]",
      "[role='main']",
      "[role='article']"
    ];

    for (const selector of selectors) {
      const container =
        bodyElement.closest(
          selector
        );

      if (container) {
        return container;
      }
    }

    return bodyElement.parentElement;
  }


  function cleanYahooSubject(text) {
    return normalizeText(text)
      .replace(
        /\s+(inbox|archive|spam|trash|sent|drafts|starred)$/i,
        ""
      )
      .trim();
  }

  function looksLikeRecipientLine(text) {
    const value = normalizeText(text).toLowerCase();

    return (
      /^to\s*:/i.test(value) ||
      /^to\s+me\b/i.test(value) ||
      /\bto:\s*me\b/i.test(value)
    );
  }

  function likelySenderName(text) {
    const value = normalizeText(text)
      .replace(/^from\s*:\s*/i, "")
      .trim();

    if (
      !value ||
      looksLikeRecipientLine(value) ||
      looksLikeUiText(value) ||
      looksLikeDateTime(value) ||
      value.length > 180
    ) {
      return "";
    }

    return value;
  }


  function isInReadingPaneColumn(
    element,
    bodyRect,
    tolerance = 180
  ) {
    if (!element) {
      return false;
    }

    const rect =
      getRect(
        element
      );

    /*
     * Reject left-navigation/sidebar elements.
     * A valid header candidate should overlap the opened message column
     * or at least begin near the body's left edge.
     */
    const overlapsBodyColumn =
      rect.right >=
        bodyRect.left - 20 &&
      rect.left <=
        bodyRect.right + 60;

    const nearBodyLeft =
      Math.abs(
        rect.left -
        bodyRect.left
      ) <= tolerance;

    return (
      overlapsBodyColumn &&
      nearBodyLeft
    );
  }

  function looksLikeYahooSidebarLabel(
    text
  ) {
    const value =
      normalizeText(
        text
      ).toLowerCase();

    return (
      /^(inbox|unread|starred|sent|drafts|scheduled|trash|spam|all mail|folders|more)(\s+\d+[km]?)?$/i
        .test(value) ||
      /^drafts\s+\d+$/i.test(value) ||
      /^unread\s+\d+$/i.test(value)
    );
  }

  function looksLikeYahooNonMessageUi(text) {
    const value =
      normalizeText(
        text
      ).toLowerCase();

    if (!value) {
      return true;
    }

    return (
      value === "yahoo mail" ||
      value === "yahoo! mail" ||
      value === "yahoo mail search" ||
      value === "search your mail" ||
      value.includes(
        "yahoo mail yahoo mail search"
      ) ||
      value.includes(
        "summarized by yahoo scout"
      ) ||
      value.includes(
        "was this message summary helpful"
      ) ||
      value.includes(
        "yahoo scout"
      ) ||
      value.includes(
        "learn how message summaries work"
      ) ||
      value.includes(
        "message summaries work"
      ) ||
      value.includes(
        "was this summary helpful"
      ) ||
      value.includes(
        "was this message summary helpful"
      ) ||
      /^search(\s+your)?\s+mail$/i.test(
        value
      )
    );
  }

  function findYahooRecipientHeader(bodyElement) {
    const bodyRect = getRect(bodyElement);

    const selectors = [
      "[data-test-id*='message-view-to' i]",
      "[data-test-id*='message-to' i]",
      "[data-test-id*='recipient' i]",
      "[aria-label^='to:' i]",
      "[aria-label^='to ' i]",
      "div",
      "span"
    ];

    const candidates = [];

    for (const element of queryAll(selectors, document)) {
      if (
        !isVisible(element) ||
        bodyElement.contains(element)
      ) {
        continue;
      }

      const rect = getRect(element);

      if (
        !isInReadingPaneColumn(
          element,
          bodyRect,
          220
        )
      ) {
        continue;
      }

      if (rect.bottom > bodyRect.top + 30) {
        continue;
      }

      const gap = bodyRect.top - rect.bottom;

      if (gap < 0 || gap > 350) {
        continue;
      }

      const raw = normalizeText(
        directText(element) ||
        element.innerText ||
        element.textContent ||
        element.getAttribute("aria-label") ||
        ""
      );

      if (
        !raw ||
        !(
          /^to\s*:/i.test(raw) ||
          /^to\s+me\b/i.test(raw) ||
          /\bto:\s*me\b/i.test(raw)
        )
      ) {
        continue;
      }

      candidates.push({
        element,
        text: raw,
        score: spatialScore(element, bodyRect)
      });
    }

    candidates.sort((a, b) => a.score - b.score);

    return candidates.length > 0
      ? candidates[0].element
      : null;
  }

  function findSenderNearRecipientHeader(
    bodyElement,
    recipientElement
  ) {
    if (!recipientElement) {
      return null;
    }

    const recipientRect = getRect(recipientElement);
    const candidates = [];

    for (
      const element of
      queryAll(
        [
          "div",
          "span",
          "button",
          "a"
        ],
        document
      )
    ) {
      if (
        !isVisible(element) ||
        bodyElement.contains(element) ||
        element === recipientElement ||
        element.children.length > 3
      ) {
        continue;
      }

      const rect = getRect(element);

      const bodyRect =
        getRect(
          bodyElement
        );

      if (
        !isInReadingPaneColumn(
          element,
          bodyRect,
          220
        )
      ) {
        continue;
      }

      if (
        rect.bottom >
        recipientRect.top + 12
      ) {
        continue;
      }

      const gap =
        recipientRect.top -
        rect.bottom;

      if (
        gap < 0 ||
        gap > 85
      ) {
        continue;
      }

      const xDistance =
        Math.abs(
          rect.left -
          recipientRect.left
        );

      if (
        xDistance > 260
      ) {
        continue;
      }

      const raw = normalizeText(
        directText(element) ||
        element.innerText ||
        element.textContent ||
        element.getAttribute("title") ||
        element.getAttribute("aria-label") ||
        ""
      );

      if (
        looksLikeYahooSidebarLabel(
          raw
        ) ||
        looksLikeYahooNonMessageUi(
          raw
        )
      ) {
        continue;
      }

      const email =
        extractEmailAddress(
          raw
        );

      const name =
        likelySenderName(
          raw
        );

      if (
        !email &&
        !name
      ) {
        continue;
      }

      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      if (
        Number.isFinite(
          fontSize
        ) &&
        fontSize > 19
      ) {
        continue;
      }

      let score =
        gap +
        xDistance * 0.05;

      if (email) {
        score -= 40;
      }

      const testId =
        normalizeText(
          element.getAttribute(
            "data-test-id"
          ) || ""
        ).toLowerCase();

      if (
        testId.includes(
          "from"
        ) ||
        testId.includes(
          "sender"
        )
      ) {
        score -= 120;
      }

      candidates.push({
        element,
        sender_name:
          name
            .replace(
              email,
              ""
            )
            .replace(
              /[<>]/g,
              " "
            )
            .trim(),
        sender_email:
          email,
        score
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    return (
      candidates.length > 0
        ? candidates[0]
        : null
    );
  }

  function isUsableYahooHeaderBandElement(
    element,
    bodyElement,
    maxGap = 360
  ) {
    if (
      !element ||
      !isVisible(
        element
      ) ||
      bodyElement.contains(
        element
      ) ||
      isComposeElement(
        element
      )
    ) {
      return false;
    }

    const bodyRect =
      getRect(
        bodyElement
      );

    const rect =
      getRect(
        element
      );

    /*
     * Candidate must be above the visible email body.
     */
    if (
      rect.bottom >
      bodyRect.top + 15
    ) {
      return false;
    }

    const gap =
      bodyRect.top -
      rect.bottom;

    if (
      gap < 0 ||
      gap > maxGap
    ) {
      return false;
    }

    /*
     * Keep candidates inside the opened-message reading pane.
     * The subject/sender can sit slightly left of the body content,
     * but Yahoo page header/search and left navigation should be excluded.
     */
    if (
      rect.right <
      bodyRect.left - 80
    ) {
      return false;
    }

    if (
      rect.left >
      bodyRect.right + 80
    ) {
      return false;
    }

    if (
      rect.left <
      bodyRect.left - 140
    ) {
      return false;
    }

    return true;
  }

  function yahooHeaderCandidateText(
    element
  ) {
    return normalizeText(
      directText(
        element
      ) ||
      element.innerText ||
      element.textContent ||
      element.getAttribute(
        "title"
      ) ||
      element.getAttribute(
        "aria-label"
      ) ||
      ""
    );
  }

  function rejectYahooHeaderUi(
    text
  ) {
    const value =
      normalizeText(
        text
      );

    if (!value) {
      return true;
    }

    return (
      looksLikeYahooSidebarLabel(
        value
      ) ||
      looksLikeYahooNonMessageUi(
        value
      ) ||
      looksLikeUiText(
        value
      ) ||
      looksLikeDateTime(
        value
      ) ||
      looksLikeRecipientLine(
        value
      ) ||
      /summari[sz]ed\s+by/i.test(
        value
      ) ||
      /yahoo\s+scout/i.test(
        value
      ) ||
      /message\s+summar/i.test(
        value
      ) ||
      /learn\s+how\s+message\s+summaries\s+work/i.test(
        value
      ) ||
      /was\s+this\s+(message\s+)?summary\s+helpful/i.test(
        value
      ) ||
      /yahoo\s*!?\s*mail.*search/i.test(
        value
      ) ||
      /^search\s+your\s+mail$/i.test(
        value
      )
    );
  }

  function getYahooHeaderBandElements(
    bodyElement
  ) {
    return queryAll(
      [
        "[data-test-id]",
        "h1",
        "h2",
        "h3",
        "[role='heading']",
        "div",
        "span",
        "button",
        "a"
      ],
      document
    ).filter(
      (element) => {
        if (
          !isUsableYahooHeaderBandElement(
            element,
            bodyElement,
            380
          )
        ) {
          return false;
        }

        /*
         * Avoid large container nodes containing whole sections.
         */
        if (
          (
            element.tagName === "DIV" ||
            element.tagName === "SPAN"
          ) &&
          element.children.length > 3
        ) {
          return false;
        }

        return true;
      }
    );
  }

  function findYahooLargeSubjectFallback(
    bodyElement
  ) {
    const bodyRect =
      getRect(
        bodyElement
      );

    const candidates = [];

    /*
     * This fallback is used ONLY when the normal Yahoo subject search fails.
     * It looks for the largest title-like visible text in the upper portion
     * of the opened-message reading pane.
     */
    for (
      const element of
      queryAll(
        [
          "h1",
          "h2",
          "h3",
          "[role='heading']",
          "div",
          "span"
        ],
        document
      )
    ) {
      if (
        !isVisible(
          element
        ) ||
        bodyElement.contains(
          element
        ) ||
        isComposeElement(
          element
        )
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Candidate must be above the body and near the opened-message column.
       */
      if (
        rect.bottom >
        bodyRect.top + 20
      ) {
        continue;
      }

      const gap =
        bodyRect.top -
        rect.bottom;

      if (
        gap < 0 ||
        gap > 520
      ) {
        continue;
      }

      /*
       * Keep candidate in the main reading pane. Allow some left offset
       * because Yahoo's subject starts slightly left of the HTML email body.
       */
      if (
        rect.right <
        bodyRect.left - 120 ||
        rect.left >
        bodyRect.right + 100 ||
        rect.left <
        bodyRect.left - 220
      ) {
        continue;
      }

      let subject =
        cleanYahooSubject(
          directText(
            element
          ) ||
          element.innerText ||
          element.textContent ||
          ""
        );

      if (
        !subject ||
        subject.length < 5 ||
        subject.length > 500 ||
        rejectYahooHeaderUi(
          subject
        ) ||
        looksLikeRecipientLine(
          subject
        ) ||
        looksLikeDateTime(
          subject
        ) ||
        extractEmailAddress(
          subject
        )
      ) {
        continue;
      }

      /*
       * Avoid generic email-body headings such as "Thank you" when they are
       * outside the message title area.
       */
      const wordCount =
        subject.split(
          /\s+/
        ).filter(Boolean).length;

      if (
        wordCount > 22
      ) {
        continue;
      }

      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      /*
       * Opened-message subject is visually prominent.
       */
      if (
        !Number.isFinite(
          fontSize
        ) ||
        fontSize < 20
      ) {
        continue;
      }

      /*
       * Large container nodes can duplicate lots of text. Prefer leaf-like
       * nodes, but permit semantic heading elements even with children.
       */
      const semanticHeading =
        element.matches(
          "h1, h2, h3, [role='heading']"
        );

      if (
        !semanticHeading &&
        element.children.length > 2
      ) {
        continue;
      }

      let score =
        gap * 0.45 +
        Math.abs(
          rect.left -
          bodyRect.left
        ) * 0.05 -
        fontSize * 22;

      /*
       * Subject usually appears in roughly the first 300px above the body.
       */
      if (
        gap <= 300
      ) {
        score -= 120;
      }

      if (
        semanticHeading
      ) {
        score -= 100;
      }

      candidates.push({
        element,
        text:
          subject,
        score,
        fontSize,
        gap
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    return (
      candidates.length > 0
        ? {
            subject:
              candidates[0].text,
            strategy:
              "yahoo_largest_upper_reading_pane_heading_fallback",
            element:
              candidates[0].element
          }
        : {
            subject:
              "",
            strategy:
              "no_large_subject_fallback_candidate",
            element:
              null
          }
    );
  }

  function findSubjectFromSenderDom(
    senderElement,
    bodyElement
  ) {
    if (
      !senderElement
    ) {
      return {
        subject: "",
        strategy:
          "no_sender_dom_anchor",
        element:
          null
      };
    }

    const senderRect =
      getRect(
        senderElement
      );

    const bodyRect =
      getRect(
        bodyElement
      );

    const candidateElements =
      new Set();

    /*
     * 1. Walk up the sender's ancestor chain and inspect previous siblings.
     * Yahoo's visible message subject is commonly rendered in a sibling block
     * immediately before the sender/header block.
     */
    let node =
      senderElement;

    for (
      let depth = 0;
      depth < 8 &&
      node &&
      node !==
        document.body;
      depth += 1
    ) {
      let sibling =
        node.previousElementSibling;

      let siblingCount =
        0;

      while (
        sibling &&
        siblingCount < 6
      ) {
        candidateElements.add(
          sibling
        );

        for (
          const descendant of
          queryAll(
            [
              "h1",
              "h2",
              "h3",
              "[role='heading']",
              "[data-test-id*='subject' i]",
              "div",
              "span"
            ],
            sibling
          )
        ) {
          candidateElements.add(
            descendant
          );
        }

        sibling =
          sibling.previousElementSibling;

        siblingCount += 1;
      }

      node =
        node.parentElement;
    }

    /*
     * 2. Add visible large headings above the sender as a broader fallback.
     */
    for (
      const element of
      queryAll(
        [
          "h1",
          "h2",
          "h3",
          "[role='heading']",
          "[data-test-id*='subject' i]",
          "div",
          "span"
        ],
        document
      )
    ) {
      candidateElements.add(
        element
      );
    }

    const candidates = [];

    for (
      const element of
      candidateElements
    ) {
      if (
        !isVisible(
          element
        ) ||
        element ===
          senderElement ||
        senderElement.contains(
          element
        ) ||
        bodyElement.contains(
          element
        ) ||
        isComposeElement(
          element
        )
      ) {
        continue;
      }

      const semanticHeading =
        element.matches(
          "h1, h2, h3, [role='heading']"
        );

      if (
        !semanticHeading &&
        (
          element.tagName ===
            "DIV" ||
          element.tagName ===
            "SPAN"
        ) &&
        element.children.length >
          2
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Subject must appear above the detected sender.
       */
      if (
        rect.bottom >
        senderRect.top + 18
      ) {
        continue;
      }

      const gap =
        senderRect.top -
        rect.bottom;

      if (
        gap < 0 ||
        gap > 620
      ) {
        continue;
      }

      /*
       * Stay in the opened-message pane.
       * Subject may begin left of sender but should not come from sidebar.
       */
      if (
        rect.right <
          senderRect.left - 140 ||
        rect.left >
          bodyRect.right + 120
      ) {
        continue;
      }

      let subject =
        cleanYahooSubject(
          directText(
            element
          ) ||
          element.innerText ||
          element.textContent ||
          element.getAttribute(
            "title"
          ) ||
          ""
        );

      if (
        !subject ||
        subject.length < 5 ||
        subject.length > 500 ||
        rejectYahooHeaderUi(
          subject
        ) ||
        looksLikeYahooSidebarLabel(
          subject
        ) ||
        looksLikeRecipientLine(
          subject
        ) ||
        looksLikeDateTime(
          subject
        ) ||
        extractEmailAddress(
          subject
        )
      ) {
        continue;
      }

      const wordCount =
        subject.split(
          /\s+/
        ).filter(Boolean).length;

      if (
        wordCount > 24
      ) {
        continue;
      }

      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      const testId =
        normalizeText(
          element.getAttribute(
            "data-test-id"
          ) || ""
        ).toLowerCase();

      const explicitSubject =
        testId.includes(
          "subject"
        );

      /*
       * Generic candidates must be visually title-like.
       */
      if (
        !explicitSubject &&
        (
          !Number.isFinite(
            fontSize
          ) ||
          fontSize < 20
        )
      ) {
        continue;
      }

      let score =
        gap * 0.22;

      if (
        explicitSubject
      ) {
        score -= 1800;
      }

      if (
        semanticHeading
      ) {
        score -= 150;
      }

      if (
        Number.isFinite(
          fontSize
        )
      ) {
        score -=
          fontSize * 42;
      }

      /*
       * Reward subjects aligned near the message pane's left edge.
       */
      score +=
        Math.abs(
          rect.left -
          Math.min(
            senderRect.left,
            bodyRect.left
          )
        ) * 0.04;

      candidates.push({
        element,
        text:
          subject,
        score,
        fontSize,
        gap
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    if (
      candidates.length > 0
    ) {
      return {
        subject:
          candidates[0].text,
        strategy:
          "yahoo_subject_from_sender_dom_and_previous_siblings",
        element:
          candidates[0].element
      };
    }

    return {
      subject:
        "",
      strategy:
        "no_sender_dom_subject_candidate",
      element:
        null
    };
  }

  function cleanYahooDocumentTitle(
    title
  ) {
    let value =
      normalizeText(
        title
      );

    value = value
      .replace(
        /\s*[-|–—]\s*yahoo!?(\s+mail)?\s*$/i,
        ""
      )
      .replace(
        /^yahoo!?(\s+mail)?\s*[-|–—]\s*/i,
        ""
      )
      .trim();

    return value;
  }

  function findYahooVisibleHeadingAboveSender(
    senderElement,
    bodyElement
  ) {
    if (!senderElement) {
      return {
        subject: "",
        strategy:
          "no_sender_for_visible_heading_fallback",
        element:
          null
      };
    }

    const senderRect =
      getRect(
        senderElement
      );

    const bodyRect =
      getRect(
        bodyElement
      );

    const candidates = [];

    for (
      const element of
      queryAll(
        [
          "h1",
          "h2",
          "h3",
          "[role='heading']",
          "[data-test-id*='subject' i]",
          "div",
          "span"
        ],
        document
      )
    ) {
      if (
        !isVisible(
          element
        ) ||
        element ===
          senderElement ||
        senderElement.contains(
          element
        ) ||
        bodyElement.contains(
          element
        ) ||
        isComposeElement(
          element
        )
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Real Yahoo subject must be visibly above the sender row.
       */
      if (
        rect.bottom >
        senderRect.top + 12
      ) {
        continue;
      }

      const gap =
        senderRect.top -
        rect.bottom;

      /*
       * Keep search close to the message header.
       */
      if (
        gap < 0 ||
        gap > 260
      ) {
        continue;
      }

      /*
       * Stay in the central message pane.
       */
      if (
        rect.left < 180 ||
        rect.right >
          window.innerWidth - 180
      ) {
        continue;
      }

      /*
       * Subject should overlap roughly the same central column as sender/body.
       */
      if (
        rect.right <
          senderRect.left - 80 ||
        rect.left >
          bodyRect.right + 100
      ) {
        continue;
      }

      let subject =
        cleanYahooSubject(
          directText(
            element
          ) ||
          element.innerText ||
          element.textContent ||
          element.getAttribute(
            "title"
          ) ||
          ""
        );

      if (
        !subject ||
        subject.length < 5 ||
        subject.length > 500 ||
        rejectYahooHeaderUi(
          subject
        ) ||
        looksLikeYahooSidebarLabel(
          subject
        ) ||
        looksLikeRecipientLine(
          subject
        ) ||
        looksLikeDateTime(
          subject
        ) ||
        extractEmailAddress(
          subject
        )
      ) {
        continue;
      }

      const wordCount =
        subject.split(
          /\s+/
        ).filter(Boolean).length;

      if (
        wordCount > 24
      ) {
        continue;
      }

      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      const fontWeight =
        Number.parseInt(
          style.fontWeight ||
          "400",
          10
        );

      const testId =
        normalizeText(
          element.getAttribute(
            "data-test-id"
          ) || ""
        ).toLowerCase();

      const explicitSubject =
        testId.includes(
          "subject"
        );

      const semanticHeading =
        element.matches(
          "h1, h2, h3, [role='heading']"
        );

      /*
       * The observed Yahoo page subject is a prominent visible heading.
       */
      if (
        !explicitSubject &&
        !semanticHeading &&
        (
          !Number.isFinite(
            fontSize
          ) ||
          fontSize < 17
        )
      ) {
        continue;
      }

      /*
       * Avoid selecting a large wrapper container.
       */
      if (
        !semanticHeading &&
        !explicitSubject &&
        element.children.length > 2
      ) {
        continue;
      }

      let score =
        gap * 0.45;

      if (
        Number.isFinite(
          fontSize
        )
      ) {
        score -=
          fontSize * 55;
      }

      if (
        Number.isFinite(
          fontWeight
        )
      ) {
        score -=
          Math.min(
            fontWeight,
            900
          ) * 0.10;
      }

      if (
        explicitSubject
      ) {
        score -= 2000;
      }

      if (
        semanticHeading
      ) {
        score -= 180;
      }

      /*
       * Prefer subject aligned slightly left of sender, as observed in Yahoo.
       */
      score +=
        Math.abs(
          rect.left -
          Math.max(
            220,
            senderRect.left - 60
          )
        ) * 0.04;

      candidates.push({
        element,
        text:
          subject,
        score,
        gap,
        fontSize
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    if (
      candidates.length > 0
    ) {
      return {
        subject:
          candidates[0].text,
        strategy:
          "yahoo_visible_heading_directly_above_sender",
        element:
          candidates[0].element
      };
    }

    return {
      subject: "",
      strategy:
        "no_visible_heading_above_sender",
      element:
        null
    };
  }

  function findYahooViewportSubjectFallback(
    senderElement,
    bodyElement
  ) {
    const bodyRect =
      getRect(
        bodyElement
      );

    const senderRect =
      senderElement
        ? getRect(
            senderElement
          )
        : null;

    /*
     * First fallback: document.title.
     * Some Yahoo layouts expose the opened message subject in the page title.
     */
    const titleCandidate =
      cleanYahooDocumentTitle(
        document.title ||
        ""
      );

    if (
      titleCandidate &&
      titleCandidate.length >= 5 &&
      titleCandidate.length <= 500 &&
      !rejectYahooHeaderUi(
        titleCandidate
      ) &&
      !looksLikeYahooSidebarLabel(
        titleCandidate
      ) &&
      !looksLikeRecipientLine(
        titleCandidate
      ) &&
      !looksLikeDateTime(
        titleCandidate
      ) &&
      !/\binbox\b/i.test(
        titleCandidate
      ) &&
      !/\bunread\b/i.test(
        titleCandidate
      ) &&
      !extractEmailAddress(
        titleCandidate
      )
    ) {
      return {
        subject:
          titleCandidate,
        strategy:
          "yahoo_document_title_fallback",
        element:
          null
      };
    }

    const candidates = [];

    /*
     * Second fallback: scan the visible central Yahoo reading-pane band.
     *
     * In the observed Yahoo UI, the real opened-message subject is a prominent
     * line below the top Yahoo toolbar/search area and above the sender row.
     */
    for (
      const element of
      queryAll(
        [
          "h1",
          "h2",
          "h3",
          "[role='heading']",
          "[data-test-id*='subject' i]",
          "div",
          "span"
        ],
        document
      )
    ) {
      if (
        !isVisible(
          element
        ) ||
        bodyElement.contains(
          element
        ) ||
        element ===
          senderElement ||
        isComposeElement(
          element
        )
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Hard viewport band:
       * - Below Yahoo's global search/header area.
       * - Above the sender row when available.
       * - Inside the central reading pane, not left navigation or right ads.
       */
      if (
        rect.top < 120
      ) {
        continue;
      }

      if (
        senderRect &&
        rect.bottom >
          senderRect.top + 20
      ) {
        continue;
      }

      if (
        rect.left < 180 ||
        rect.right >
          window.innerWidth - 220
      ) {
        continue;
      }

      if (
        rect.width < 120 ||
        rect.height < 18 ||
        rect.height > 110
      ) {
        continue;
      }

      /*
       * Avoid large containers containing multiple UI regions.
       */
      if (
        (
          element.tagName === "DIV" ||
          element.tagName === "SPAN"
        ) &&
        element.children.length > 4
      ) {
        continue;
      }

      let subject =
        cleanYahooSubject(
          directText(
            element
          ) ||
          element.innerText ||
          element.textContent ||
          element.getAttribute(
            "title"
          ) ||
          ""
        );

      if (
        !subject ||
        subject.length < 5 ||
        subject.length > 500 ||
        rejectYahooHeaderUi(
          subject
        ) ||
        looksLikeYahooSidebarLabel(
          subject
        ) ||
        looksLikeRecipientLine(
          subject
        ) ||
        looksLikeDateTime(
          subject
        ) ||
        extractEmailAddress(
          subject
        )
      ) {
        continue;
      }

      const wordCount =
        subject.split(
          /\s+/
        ).filter(Boolean).length;

      if (
        wordCount > 28
      ) {
        continue;
      }

      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      const fontWeight =
        Number.parseInt(
          style.fontWeight ||
          "400",
          10
        );

      const testId =
        normalizeText(
          element.getAttribute(
            "data-test-id"
          ) || ""
        ).toLowerCase();

      const semanticHeading =
        element.matches(
          "h1, h2, h3, [role='heading']"
        );

      const explicitSubject =
        testId.includes(
          "subject"
        );

      /*
       * The real Yahoo subject is generally at least medium-large.
       * Avoid overly strict thresholds because Yahoo's CSS varies.
       */
      if (
        !explicitSubject &&
        !semanticHeading &&
        (
          !Number.isFinite(
            fontSize
          ) ||
          fontSize < 15
        )
      ) {
        continue;
      }

      let score = 0;

      /*
       * Prefer larger / heavier text.
       */
      if (
        Number.isFinite(
          fontSize
        )
      ) {
        score -=
          fontSize * 45;
      }

      if (
        Number.isFinite(
          fontWeight
        )
      ) {
        score -=
          Math.min(
            fontWeight,
            900
          ) * 0.12;
      }

      if (
        explicitSubject
      ) {
        score -= 1800;
      }

      if (
        semanticHeading
      ) {
        score -= 180;
      }

      /*
       * Prefer text horizontally near the central message pane.
       */
      score +=
        Math.abs(
          rect.left -
          Math.max(
            220,
            bodyRect.left - 180
          )
        ) * 0.05;

      /*
       * When sender exists, prefer the nearest prominent heading above sender,
       * but allow enough distance for Yahoo Scout/calendar blocks.
       */
      if (
        senderRect
      ) {
        const gap =
          senderRect.top -
          rect.bottom;

        if (
          gap < 0 ||
          gap > 520
        ) {
          continue;
        }

        score +=
          gap * 0.15;
      }

      candidates.push({
        element,
        text:
          subject,
        score,
        fontSize,
        fontWeight
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    if (
      candidates.length > 0
    ) {
      return {
        subject:
          candidates[0].text,
        strategy:
          "yahoo_central_viewport_subject_fallback",
        element:
          candidates[0].element
      };
    }

    return {
      subject:
        "",
      strategy:
        "no_viewport_subject_candidate",
      element:
        null
    };
  }

  function findYahooDirectTextSubject(
    senderElement,
    bodyElement
  ) {
    if (!senderElement) {
      return {
        subject: "",
        strategy:
          "no_sender_for_direct_text_subject",
        element:
          null
      };
    }

    const senderRect =
      getRect(
        senderElement
      );

    const bodyRect =
      getRect(
        bodyElement
      );

    const candidates = [];

    /*
     * Scan all visible elements, but read only their DIRECT text-node content.
     * This is important for Yahoo because the visible subject may share a
     * container with an Inbox badge or other child elements.
     */
    for (
      const element of
      document.querySelectorAll(
        "body *"
      )
    ) {
      if (
        !isVisible(
          element
        ) ||
        element ===
          senderElement ||
        senderElement.contains(
          element
        ) ||
        bodyElement.contains(
          element
        ) ||
        isComposeElement(
          element
        )
      ) {
        continue;
      }

      const rawDirectText =
        directText(
          element
        );

      if (
        !rawDirectText
      ) {
        continue;
      }

      let subject =
        cleanYahooSubject(
          rawDirectText
        );

      if (
        !subject ||
        subject.length < 5 ||
        subject.length > 500 ||
        rejectYahooHeaderUi(
          subject
        ) ||
        looksLikeYahooSidebarLabel(
          subject
        ) ||
        looksLikeRecipientLine(
          subject
        ) ||
        looksLikeDateTime(
          subject
        ) ||
        extractEmailAddress(
          subject
        )
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Real Yahoo subject must be above the selected sender.
       */
      if (
        rect.bottom >
        senderRect.top + 18
      ) {
        continue;
      }

      const gap =
        senderRect.top -
        rect.bottom;

      /*
       * Keep the scan in the header region.
       */
      if (
        gap < 0 ||
        gap > 320
      ) {
        continue;
      }

      /*
       * Exclude the left folder sidebar and right ad column.
       * Allow the subject to begin left of the sender.
       */
      if (
        rect.left < 200 ||
        rect.right >
          window.innerWidth - 180
      ) {
        continue;
      }

      /*
       * Subject text should occupy a meaningful width in the reading pane.
       */
      if (
        rect.width < 180
      ) {
        continue;
      }

      /*
       * Avoid text from tiny toolbar controls.
       */
      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      const fontWeight =
        Number.parseInt(
          style.fontWeight ||
          "400",
          10
        );

      if (
        !Number.isFinite(
          fontSize
        ) ||
        fontSize < 16
      ) {
        continue;
      }

      const wordCount =
        subject.split(
          /\s+/
        ).filter(Boolean).length;

      if (
        wordCount > 28
      ) {
        continue;
      }

      /*
       * Require reasonable overlap with the sender/body column.
       */
      if (
        rect.right <
          senderRect.left - 100 ||
        rect.left >
          bodyRect.right + 120
      ) {
        continue;
      }

      let score =
        gap * 0.40;

      /*
       * Prefer larger, heavier subject text.
       */
      score -=
        fontSize * 60;

      if (
        Number.isFinite(
          fontWeight
        )
      ) {
        score -=
          Math.min(
            fontWeight,
            900
          ) * 0.12;
      }

      /*
       * Prefer text near the sender's horizontal message column.
       */
      score +=
        Math.abs(
          rect.left -
          Math.max(
            220,
            senderRect.left - 80
          )
        ) * 0.04;

      candidates.push({
        element,
        text:
          subject,
        score,
        gap,
        fontSize,
        fontWeight
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    if (
      candidates.length > 0
    ) {
      return {
        subject:
          candidates[0].text,
        strategy:
          "yahoo_direct_text_node_above_sender",
        element:
          candidates[0].element
      };
    }

    return {
      subject:
        "",
      strategy:
        "no_direct_text_subject_candidate",
      element:
        null
    };
  }

  function findYahooGoogleSubjectFallback(
    senderElement,
    bodyElement
  ) {
    if (!senderElement) {
      return {
        subject: "",
        strategy:
          "no_sender_for_google_subject_fallback",
        element:
          null
      };
    }

    const senderRect =
      getRect(
        senderElement
      );

    const bodyRect =
      getRect(
        bodyElement
      );

    const candidates = [];

    /*
     * Yahoo's Google Play emails sometimes render the visible message subject
     * in a page-level title container that is not exposed through normal
     * subject selectors. Search the upper-center message pane directly.
     *
     * This fallback is only called when:
     *   - sender is Google
     *   - all general Yahoo subject extraction methods returned empty
     */
    for (
      const element of
      document.querySelectorAll(
        "body *"
      )
    ) {
      if (
        !isVisible(
          element
        ) ||
        element ===
          senderElement ||
        senderElement.contains(
          element
        ) ||
        bodyElement.contains(
          element
        ) ||
        isComposeElement(
          element
        )
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Subject is above the sender and below Yahoo's top toolbar.
       */
      if (
        rect.top < 120 ||
        rect.bottom >
          senderRect.top + 20
      ) {
        continue;
      }

      const gap =
        senderRect.top -
        rect.bottom;

      if (
        gap < 0 ||
        gap > 320
      ) {
        continue;
      }

      /*
       * Keep to the central message pane.
       */
      if (
        rect.left < 180 ||
        rect.right >
          window.innerWidth - 220
      ) {
        continue;
      }

      /*
       * Require meaningful width so toolbar controls are ignored.
       */
      if (
        rect.width < 220
      ) {
        continue;
      }

      /*
       * Read direct text first. If empty, allow full text only for
       * leaf-like nodes.
       */
      let candidateText =
        directText(
          element
        );

      if (
        !candidateText &&
        element.children.length <= 1
      ) {
        candidateText =
          normalizeText(
            element.innerText ||
            element.textContent ||
            ""
          );
      }

      let subject =
        cleanYahooSubject(
          candidateText
        );

      if (
        !subject ||
        subject.length < 5 ||
        subject.length > 500 ||
        rejectYahooHeaderUi(
          subject
        ) ||
        looksLikeYahooSidebarLabel(
          subject
        ) ||
        looksLikeRecipientLine(
          subject
        ) ||
        looksLikeDateTime(
          subject
        ) ||
        extractEmailAddress(
          subject
        )
      ) {
        continue;
      }

      /*
       * Avoid short inner-body headings such as "Thank you".
       */
      const wordCount =
        subject.split(
          /\s+/
        ).filter(Boolean).length;

      if (
        wordCount < 4 ||
        wordCount > 28
      ) {
        continue;
      }

      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      const fontWeight =
        Number.parseInt(
          style.fontWeight ||
          "400",
          10
        );

      /*
       * Google Play Yahoo subjects are visibly prominent.
       */
      if (
        !Number.isFinite(
          fontSize
        ) ||
        fontSize < 18
      ) {
        continue;
      }

      /*
       * Reject very tall wrappers / section containers.
       */
      if (
        rect.height > 100
      ) {
        continue;
      }

      let score =
        gap * 0.30;

      score -=
        fontSize * 65;

      if (
        Number.isFinite(
          fontWeight
        )
      ) {
        score -=
          Math.min(
            fontWeight,
            900
          ) * 0.12;
      }

      /*
       * Prefer title positioned near the left edge of the message pane.
       */
      score +=
        Math.abs(
          rect.left -
          Math.max(
            220,
            senderRect.left - 80
          )
        ) * 0.04;

      candidates.push({
        element,
        text:
          subject,
        score,
        gap,
        fontSize
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    if (
      candidates.length > 0
    ) {
      return {
        subject:
          candidates[0].text,
        strategy:
          "yahoo_google_sender_upper_message_title_fallback",
        element:
          candidates[0].element
      };
    }

    return {
      subject:
        "",
      strategy:
        "no_google_specific_subject_candidate",
      element:
        null
    };
  }

  function looksLikeStandaloneDateTimeLabel(
    text
  ) {
    const value =
      normalizeText(
        text
      );

    if (!value) {
      return false;
    }

    /*
     * A real email subject can legitimately contain a date.
     * Only reject text when the WHOLE value looks like a timestamp/date label.
     */
    if (
      value.length > 90
    ) {
      return false;
    }

    return (
      /^(mon|tue|wed|thu|fri|sat|sun)(day)?[,]?\s+/i.test(
        value
      ) ||
      /^\d{1,2}\/\d{1,2}\/\d{2,4}(\s+.*)?$/i.test(
        value
      ) ||
      /^\d{1,2}:\d{2}\s*(am|pm)(\s+.*)?$/i.test(
        value
      ) ||
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(,?\s+\d{2,4})?(\s+.*)?$/i.test(
        value
      ) ||
      /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(\s+\d{2,4})?(\s+.*)?$/i.test(
        value
      )
    );
  }

  function findExactYahooMessageGroupSubject(
    senderElement = null
  ) {
    const elements =
      Array.from(
        document.querySelectorAll(
          '[data-test-id="message-group-subject-text"]'
        )
      ).filter(
        (element) =>
          isVisible(
            element
          ) &&
          !isComposeElement(
            element
          )
      );

    const senderRect =
      senderElement
        ? getRect(
            senderElement
          )
        : null;

    const candidates = [];

    for (
      const element of
      elements
    ) {
      const ariaLabel =
        normalizeText(
          element.getAttribute(
            "aria-label"
          ) ||
          ""
        );

      const direct =
        normalizeText(
          directText(
            element
          ) ||
          ""
        );

      const inner =
        normalizeText(
          element.innerText ||
          element.textContent ||
          ""
        );

      /*
       * The exact Yahoo selector is authoritative.
       * Prefer aria-label, then direct text, then rendered inner text.
       */
      const subject =
        cleanYahooSubject(
          ariaLabel ||
          direct ||
          inner
        );

      if (
        !subject ||
        subject.length < 2
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Multiple message groups may exist in a conversation.
       * Prefer the exact subject element nearest to the detected sender,
       * but DO NOT reject candidates by hard geometry.
       */
      let score = 0;

      if (
        senderRect
      ) {
        score =
          Math.abs(
            senderRect.top -
            rect.bottom
          );
      }

      /*
       * Prefer a full aria-label when Yahoo exposes one.
       */
      if (
        ariaLabel
      ) {
        score -= 500;
      }

      candidates.push({
        element,
        subject,
        score
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    if (
      candidates.length > 0
    ) {
      return {
        subject:
          candidates[0].subject,
        strategy:
          "yahoo_exact_message_group_subject_text_direct",
        element:
          candidates[0].element
      };
    }

    return {
      subject: "",
      strategy:
        "exact_message_group_subject_not_rendered_yet",
      element:
        null
    };
  }

  function findYahooMessageGroupSubject(
    senderElement,
    bodyElement
  ) {
    if (
      !senderElement
    ) {
      return {
        subject: "",
        strategy:
          "no_sender_for_message_group_subject",
        element:
          null
      };
    }

    const senderRect =
      getRect(
        senderElement
      );

    const bodyRect =
      getRect(
        bodyElement
      );

    const selectors = [
      "[data-test-id='message-group-subject-text']",
      "[data-test-id^='message-gro']",
      "[data-test-id*='message-gro']",
      "[data-test-id*='message-group']",
      "h1[aria-label]",
      "h2[aria-label]",
      "h3[aria-label]",
      "[role='heading'][aria-label]"
    ];

    const candidates = [];

    for (
      const element of
      queryAll(
        selectors,
        document
      )
    ) {
      if (
        !isVisible(
          element
        ) ||
        element ===
          senderElement ||
        senderElement.contains(
          element
        ) ||
        bodyElement.contains(
          element
        ) ||
        isComposeElement(
          element
        )
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Diagnostic showed the real subject about 31px above the sender.
       * Keep a slightly wider production window for layout variation.
       */
      if (
        rect.bottom >
        senderRect.top + 16
      ) {
        continue;
      }

      const gap =
        senderRect.top -
        rect.bottom;

      if (
        gap < 0 ||
        gap > 120
      ) {
        continue;
      }

      /*
       * Keep candidate in the central Yahoo message pane.
       */
      if (
        rect.left < 150
      ) {
        continue;
      }

      if (
        rect.right <
          senderRect.left - 120 ||
        rect.left >
          bodyRect.right + 120
      ) {
        continue;
      }

      const ariaLabel =
        normalizeText(
          element.getAttribute(
            "aria-label"
          ) ||
          ""
        );

      const direct =
        directText(
          element
        );

      const inner =
        normalizeText(
          element.innerText ||
          element.textContent ||
          ""
        );

      /*
       * Diagnostic row exposed the full subject through aria-label.
       * Prefer it, then direct text, then rendered inner text.
       */
      let subject =
        cleanYahooSubject(
          ariaLabel ||
          direct ||
          inner
        );

      if (
        !subject ||
        subject.length < 5 ||
        subject.length > 500 ||
        rejectYahooHeaderUi(
          subject
        ) ||
        looksLikeYahooSidebarLabel(
          subject
        ) ||
        looksLikeRecipientLine(
          subject
        ) ||
        looksLikeStandaloneDateTimeLabel(
          subject
        ) ||
        extractEmailAddress(
          subject
        )
      ) {
        continue;
      }

      const wordCount =
        subject.split(
          /\s+/
        ).filter(Boolean).length;

      if (
        wordCount > 30
      ) {
        continue;
      }

      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      const fontWeight =
        Number.parseInt(
          style.fontWeight ||
          "400",
          10
        );

      const dataTestId =
        normalizeText(
          element.getAttribute(
            "data-test-id"
          ) ||
          ""
        ).toLowerCase();

      const tag =
        element.tagName.toLowerCase();

      const isHeading =
        ["h1", "h2", "h3"].includes(
          tag
        ) ||
        element.getAttribute(
          "role"
        ) === "heading";

      /*
       * Production scoring derived from the diagnostic:
       * - message-group data-test-id is strongest
       * - aria-label is very strong
       * - heading element is strong
       * - larger font is preferred
       * - closer to sender is preferred
       */
      let score =
        gap * 0.40;

      if (
        dataTestId ===
        "message-group-subject-text"
      ) {
        score -= 3200;
      } else if (
        dataTestId.startsWith(
          "message-gro"
        ) ||
        dataTestId.includes(
          "message-group"
        )
      ) {
        score -= 1800;
      }

      if (
        ariaLabel
      ) {
        score -= 1400;
      }

      if (
        isHeading
      ) {
        score -= 300;
      }

      if (
        Number.isFinite(
          fontSize
        )
      ) {
        score -=
          fontSize * 50;
      }

      if (
        Number.isFinite(
          fontWeight
        )
      ) {
        score -=
          Math.min(
            fontWeight,
            900
          ) * 0.08;
      }

      candidates.push({
        element,
        text:
          subject,
        score,
        gap,
        fontSize,
        dataTestId,
        ariaLabel
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    if (
      candidates.length > 0
    ) {
      return {
        subject:
          candidates[0].text,
        strategy:
          "yahoo_exact_message_group_subject_selector",
        element:
          candidates[0].element
      };
    }

    return {
      subject:
        "",
      strategy:
        "no_message_group_subject_candidate",
      element:
        null
    };
  }

  function extractSubject(
    bodyElement,
    container,
    senderElement = null
  ) {
    const exactSubject =
      findExactYahooMessageGroupSubject(
        senderElement
      );

    if (
      exactSubject.subject
    ) {
      return exactSubject;
    }

    if (
      senderElement
    ) {
      const messageGroupSubject =
        findYahooMessageGroupSubject(
          senderElement,
          bodyElement
        );

      if (
        messageGroupSubject.subject
      ) {
        return messageGroupSubject;
      }


      const directTextSubject =
        findYahooDirectTextSubject(
          senderElement,
          bodyElement
        );

      if (
        directTextSubject.subject
      ) {
        return directTextSubject;
      }

      const senderDomSubject =
        findSubjectFromSenderDom(
          senderElement,
          bodyElement
        );

      if (
        senderDomSubject.subject
      ) {
        return senderDomSubject;
      }
    }

    const bodyRect =
      getRect(
        bodyElement
      );

    const senderRect =
      senderElement
        ? getRect(
            senderElement
          )
        : null;

    const selectors = [
      "[data-test-id='message-view-subject']",
      "[data-test-id='message-subject']",
      "[data-test-id*='message-view-subject' i]",
      "[data-test-id*='message-subject' i]",
      "[data-test-id*='subject' i]",
      "h1",
      "h2",
      "h3",
      "[role='heading']",
      "div",
      "span"
    ];

    const candidates = [];

    for (
      const root of
      [
        container,
        document
      ].filter(Boolean)
    ) {
      for (
        const element of
        queryAll(
          selectors,
          root
        )
      ) {
        if (
          !isVisible(
            element
          ) ||
          bodyElement.contains(
            element
          ) ||
          element ===
            senderElement
        ) {
          continue;
        }

        /*
         * Avoid large generic container nodes.
         */
        const semanticHeading =
          element.matches(
            "h1, h2, h3, [role='heading']"
          );

        if (
          !semanticHeading &&
          (
            element.tagName === "DIV" ||
            element.tagName === "SPAN"
          ) &&
          element.children.length > 2
        ) {
          continue;
        }

        let subject =
          cleanYahooSubject(
            directText(
              element
            ) ||
            element.innerText ||
            element.textContent ||
            element.getAttribute(
              "title"
            ) ||
            ""
          );

        if (
          !subject ||
          subject.length < 5 ||
          subject.length > 500 ||
          rejectYahooHeaderUi(
            subject
          ) ||
          looksLikeRecipientLine(
            subject
          ) ||
          looksLikeDateTime(
            subject
          ) ||
          extractEmailAddress(
            subject
          )
        ) {
          continue;
        }

        const wordCount =
          subject.split(
            /\s+/
          ).filter(Boolean).length;

        if (
          wordCount > 24
        ) {
          continue;
        }

        const rect =
          getRect(
            element
          );

        /*
         * Candidate must sit above the selected sender when available.
         * This prevents selecting headings inside the email body, such as
         * "Code Camp Registration Confirmation" or "Thank you".
         */
        if (
          senderRect
        ) {
          if (
            rect.bottom >
            senderRect.top + 20
          ) {
            continue;
          }

          const gapToSender =
            senderRect.top -
            rect.bottom;

          if (
            gapToSender < 0 ||
            gapToSender > 520
          ) {
            continue;
          }

          /*
           * Keep the candidate in the sender/message reading-pane column.
           */
          if (
            rect.right <
              senderRect.left - 80 ||
            rect.left >
              bodyRect.right + 100 ||
            rect.left <
              bodyRect.left - 220
          ) {
            continue;
          }
        } else {
          /*
           * Fallback when sender was not found.
           */
          if (
            rect.bottom >
            bodyRect.top + 20
          ) {
            continue;
          }

          const gapToBody =
            bodyRect.top -
            rect.bottom;

          if (
            gapToBody < 0 ||
            gapToBody > 520
          ) {
            continue;
          }
        }

        const style =
          window.getComputedStyle(
            element
          );

        const fontSize =
          Number.parseFloat(
            style.fontSize ||
            "0"
          );

        const testId =
          normalizeText(
            element.getAttribute(
              "data-test-id"
            ) || ""
          ).toLowerCase();

        const explicitSubject =
          testId.includes(
            "message"
          ) &&
          testId.includes(
            "subject"
          );

        /*
         * Generic candidates must be visibly title-like.
         */
        if (
          !explicitSubject &&
          (
            !Number.isFinite(
              fontSize
            ) ||
            fontSize < 20
          )
        ) {
          continue;
        }

        let score = 0;

        if (
          senderRect
        ) {
          const gapToSender =
            senderRect.top -
            rect.bottom;

          /*
           * Prefer the largest title above the known sender.
           * Gap has only a moderate penalty so Yahoo Scout/calendar blocks
           * inserted between subject and sender do not win.
           */
          score +=
            gapToSender *
            0.25;

          score +=
            Math.abs(
              rect.left -
              bodyRect.left
            ) *
            0.04;
        } else {
          score +=
            (
              bodyRect.top -
              rect.bottom
            ) *
            0.35;
        }

        if (
          explicitSubject
        ) {
          score -= 1500;
        }

        if (
          semanticHeading
        ) {
          score -= 120;
        }

        if (
          Number.isFinite(
            fontSize
          )
        ) {
          /*
           * Strongly favor the page-level Yahoo subject, which is visibly
           * larger than inner email headings/cards.
           */
          score -=
            fontSize *
            35;
        }

        candidates.push({
          element,
          text:
            subject,
          score,
          fontSize
        });
      }
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    if (
      candidates.length > 0
    ) {
      return {
        subject:
          candidates[0].text,
        strategy:
          senderElement
            ? "yahoo_largest_heading_above_selected_sender"
            : "yahoo_largest_heading_above_body_fallback",
        element:
          candidates[0].element
      };
    }

    const visibleHeadingFallback =
      findYahooVisibleHeadingAboveSender(
        senderElement,
        bodyElement
      );

    if (
      visibleHeadingFallback.subject
    ) {
      return visibleHeadingFallback;
    }

    const viewportFallback =
      findYahooViewportSubjectFallback(
        senderElement,
        bodyElement
      );

    if (
      viewportFallback.subject
    ) {
      return viewportFallback;
    }

    /*
     * Final targeted fallback for Yahoo-rendered Google / Google Play emails.
     * General Yahoo extraction remains unchanged for all other senders.
     */
    const senderText =
      senderElement
        ? normalizeText(
            senderElement.innerText ||
            senderElement.textContent ||
            ""
          )
        : "";

    if (
      /\bgoogle\b/i.test(
        senderText
      )
    ) {
      const googleFallback =
        findYahooGoogleSubjectFallback(
          senderElement,
          bodyElement
        );

      if (
        googleFallback.subject
      ) {
        return googleFallback;
      }
    }

    return {
      subject:
        "",
      strategy:
        "no_subject_candidate_after_all_fallbacks",
      element:
        null
    };
  }

  function isPunctuationOnlySenderText(
    text
  ) {
    const value =
      normalizeText(
        text
      );

    if (!value) {
      return true;
    }

    /*
     * Yahoo inserts separator elements such as "·" near sender metadata.
     * They must never be accepted as sender names.
     */
    return /^[\s·•|—–\-:;,._]+$/u.test(
      value
    );
  }

  function findConfirmedYahooSenderTextSpan(
    bodyElement
  ) {
    const bodyRect =
      getRect(
        bodyElement
      );

    /*
     * Confirmed through live Yahoo DOM inspection:
     *
     * <span class="A_6EGz fd_N u_e69 i_6LEV C_1GbO8e ix_ZnEKB7">
     *   MariBank PH Alerts
     * </span>
     *
     * Yahoo class names can change, so the exact class combination is used
     * first, while the generic sender heuristics remain as fallbacks.
     */
    const selectors = [
      "span.A_6EGz.fd_N.u_e69.i_6LEV.C_1GbO8e.ix_ZnEKB7",
      "span[class~='A_6EGz'][class~='fd_N'][class~='u_e69'][class~='i_6LEV'][class~='C_1GbO8e'][class~='ix_ZnEKB7']"
    ];

    const candidates = [];

    for (
      const element of
      queryAll(
        selectors,
        document
      )
    ) {
      if (
        !isVisible(
          element
        ) ||
        bodyElement.contains(
          element
        ) ||
        isComposeElement(
          element
        )
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Sender must be in the opened-message header band above the body.
       */
      if (
        rect.bottom >
        bodyRect.top + 20
      ) {
        continue;
      }

      const verticalGap =
        bodyRect.top -
        rect.bottom;

      if (
        verticalGap < 0 ||
        verticalGap > 260
      ) {
        continue;
      }

      if (
        rect.right <
          bodyRect.left - 180 ||
        rect.left >
          bodyRect.right + 100
      ) {
        continue;
      }

      const raw =
        normalizeText(
          directText(
            element
          ) ||
          element.innerText ||
          element.textContent ||
          element.getAttribute(
            "title"
          ) ||
          element.getAttribute(
            "aria-label"
          ) ||
          ""
        );

      if (
        !raw ||
        isPunctuationOnlySenderText(
          raw
        ) ||
        looksLikeYahooSidebarLabel(
          raw
        ) ||
        looksLikeYahooNonMessageUi(
          raw
        ) ||
        looksLikeRecipientLine(
          raw
        ) ||
        looksLikeUiText(
          raw
        ) ||
        raw.length > 180
      ) {
        continue;
      }

      const parsed =
        parseSenderElement(
          element
        );

      const email =
        parsed.sender_email ||
        extractEmailAddress(
          raw
        );

      const name =
        normalizeText(
          (
            parsed.sender_name ||
            likelySenderName(
              raw
            )
          )
            .replace(
              email,
              ""
            )
            .replace(
              /[<>]/g,
              " "
            )
        );

      if (
        !email &&
        (
          !name ||
          isPunctuationOnlySenderText(
            name
          )
        )
      ) {
        continue;
      }

      candidates.push({
        element,
        sender_name:
          name,
        sender_email:
          email,
        score:
          verticalGap +
          Math.abs(
            rect.left -
            bodyRect.left
          ) * 0.05
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    return (
      candidates.length > 0
        ? candidates[0]
        : null
    );
  }

  function parseSenderElement(
    element
  ) {
    const href =
      normalizeText(
        element.getAttribute(
          "href"
        ) || ""
      );

    const values = [
      element.innerText,
      element.textContent,
      element.getAttribute(
        "title"
      ),
      element.getAttribute(
        "aria-label"
      ),
      element.getAttribute(
        "data-email"
      ),
      element.getAttribute(
        "data-email-address"
      ),
      href.startsWith(
        "mailto:"
      )
        ? decodeURIComponent(
            href
              .slice(7)
              .split("?")[0]
          )
        : ""
    ];

    let senderEmail = "";

    for (const value of values) {
      senderEmail =
        extractEmailAddress(
          value
        );

      if (senderEmail) {
        break;
      }
    }

    const visibleText =
      normalizeText(
        element.innerText ||
        element.textContent ||
        ""
      );

    let senderName =
      normalizeText(
        visibleText
          .replace(
            senderEmail,
            ""
          )
          .replace(
            /[<>]/g,
            " "
          )
      );

    if (
      senderName.toLowerCase() ===
      senderEmail.toLowerCase()
    ) {
      senderName = "";
    }

    return {
      sender_name:
        senderName,
      sender_email:
        senderEmail
    };
  }

  function findStrictSenderAboveRecipient(
    bodyElement,
    recipientElement
  ) {
    if (!recipientElement) {
      return null;
    }

    const recipientRect =
      getRect(
        recipientElement
      );

    const bodyRect =
      getRect(
        bodyElement
      );

    const candidates = [];

    for (
      const element of
      queryAll(
        [
          "div",
          "span",
          "button",
          "a"
        ],
        document
      )
    ) {
      if (
        !isVisible(
          element
        ) ||
        bodyElement.contains(
          element
        ) ||
        element ===
          recipientElement ||
        element.children.length >
          2
      ) {
        continue;
      }

      if (
        !isInReadingPaneColumn(
          element,
          bodyRect,
          180
        )
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      /*
       * Yahoo sender name is normally immediately above the "To: me" line.
       */
      const verticalGap =
        recipientRect.top -
        rect.bottom;

      if (
        verticalGap < 0 ||
        verticalGap > 35
      ) {
        continue;
      }

      const horizontalGap =
        Math.abs(
          rect.left -
          recipientRect.left
        );

      if (
        horizontalGap > 120
      ) {
        continue;
      }

      const raw =
        normalizeText(
          directText(
            element
          ) ||
          element.innerText ||
          element.textContent ||
          element.getAttribute(
            "title"
          ) ||
          element.getAttribute(
            "aria-label"
          ) ||
          ""
        );

      if (
        !raw ||
        looksLikeYahooSidebarLabel(
          raw
        ) ||
        looksLikeYahooNonMessageUi(
          raw
        ) ||
        /learn how message summaries work/i.test(
          raw
        ) ||
        /summarized by yahoo scout/i.test(
          raw
        ) ||
        /was this (message )?summary helpful/i.test(
          raw
        ) ||
        looksLikeRecipientLine(
          raw
        ) ||
        looksLikeDateTime(
          raw
        ) ||
        looksLikeUiText(
          raw
        )
      ) {
        continue;
      }

      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      /*
       * Sender display names are not large subject headings.
       */
      if (
        Number.isFinite(
          fontSize
        ) &&
        fontSize > 18
      ) {
        continue;
      }

      const email =
        extractEmailAddress(
          raw
        );

      let name =
        likelySenderName(
          raw
        );

      name =
        normalizeText(
          name
            .replace(
              email,
              ""
            )
            .replace(
              /[<>]/g,
              " "
            )
        );

      if (
        !email &&
        !name
      ) {
        continue;
      }

      let score =
        verticalGap +
        horizontalGap *
          0.05;

      const testId =
        normalizeText(
          element.getAttribute(
            "data-test-id"
          ) || ""
        ).toLowerCase();

      if (
        testId.includes(
          "from"
        ) ||
        testId.includes(
          "sender"
        )
      ) {
        score -= 180;
      }

      if (email) {
        score -= 30;
      }

      candidates.push({
        element,
        sender_name:
          name,
        sender_email:
          email,
        score
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    return (
      candidates.length > 0
        ? candidates[0]
        : null
    );
  }

  function extractSender(
    bodyElement,
    container
  ) {
    const confirmedSender =
      findConfirmedYahooSenderTextSpan(
        bodyElement
      );

    if (
      confirmedSender
    ) {
      return {
        sender_name:
          confirmedSender
            .sender_name,
        sender_email:
          confirmedSender
            .sender_email,
        strategy:
          "yahoo_confirmed_sender_text_span",
        element:
          confirmedSender
            .element
      };
    }

    const bodyRect =
      getRect(
        bodyElement
      );

    const candidates = [];

    for (
      const element of
      getYahooHeaderBandElements(
        bodyElement
      )
    ) {
      const raw =
        yahooHeaderCandidateText(
          element
        );

      if (
        !raw ||
        isPunctuationOnlySenderText(
          raw
        ) ||
        rejectYahooHeaderUi(
          raw
        )
      ) {
        continue;
      }

      const rect =
        getRect(
          element
        );

      const gap =
        bodyRect.top -
        rect.bottom;

      /*
       * Sender is normally the closest non-recipient metadata line
       * immediately above the message body.
       */
      if (
        gap < 0 ||
        gap > 150
      ) {
        continue;
      }

      const style =
        window.getComputedStyle(
          element
        );

      const fontSize =
        Number.parseFloat(
          style.fontSize ||
          "0"
        );

      /*
       * Reject the large subject heading.
       */
      if (
        Number.isFinite(
          fontSize
        ) &&
        fontSize > 19
      ) {
        continue;
      }

      const parsed =
        parseSenderElement(
          element
        );

      const email =
        parsed.sender_email ||
        extractEmailAddress(
          raw
        );

      let name =
        parsed.sender_name ||
        likelySenderName(
          raw
        );

      name =
        normalizeText(
          name
            .replace(
              email,
              ""
            )
            .replace(
              /[<>]/g,
              " "
            )
        );

      /*
       * Sender names should be concise labels, not full sentences.
       */
      const wordCount =
        name.split(
          /\s+/
        ).filter(Boolean).length;

      if (
        !email &&
        (
          !name ||
          isPunctuationOnlySenderText(
            name
          ) ||
          wordCount > 8 ||
          name.length > 140
        )
      ) {
        continue;
      }

      if (
        rejectYahooHeaderUi(
          name
        )
      ) {
        continue;
      }

      const testId =
        normalizeText(
          element.getAttribute(
            "data-test-id"
          ) || ""
        ).toLowerCase();

      let score =
        gap +
        Math.abs(
          rect.left -
          bodyRect.left
        ) *
          0.08;

      if (
        testId.includes(
          "from"
        ) ||
        testId.includes(
          "sender"
        )
      ) {
        score -= 500;
      }

      if (email) {
        score -= 100;
      }

      /*
       * Reward the closest concise label above the body.
       */
      if (
        gap <= 80
      ) {
        score -= 120;
      }

      candidates.push({
        element,
        sender_name:
          name,
        sender_email:
          email,
        score,
        gap
      });
    }

    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    if (
      candidates.length > 0
    ) {
      return {
        sender_name:
          candidates[0]
            .sender_name,
        sender_email:
          candidates[0]
            .sender_email,
        strategy:
          "yahoo_nearest_valid_sender_in_message_header_band",
        element:
          candidates[0]
            .element
      };
    }

    return {
      sender_name:
        "",
      sender_email:
        "",
      strategy:
        "no_sender_candidate",
      element:
        null
    };
  }

  function extractTimestamp(
    bodyElement,
    container
  ) {
    const bodyRect =
      getRect(
        bodyElement
      );

    const selectors = [
      "time",
      "[data-test-id*='date' i]",
      "[data-test-id*='time' i]"
    ];

    const candidates =
      queryAll(
        selectors,
        container ||
        document
      )
        .filter(
          isVisible
        )
        .filter(
          (element) => {
            const rect =
              getRect(
                element
              );

            return (
              rect.bottom <=
                bodyRect.top + 30 &&
              bodyRect.top -
                rect.bottom <=
                450
            );
          }
        )
        .sort(
          (a, b) =>
            spatialScore(
              a,
              bodyRect
            ) -
            spatialScore(
              b,
              bodyRect
            )
        );

    for (const element of candidates) {
      const value =
        normalizeText(
          element.getAttribute(
            "datetime"
          ) ||
          element.getAttribute(
            "title"
          ) ||
          element.innerText ||
          element.textContent ||
          ""
        );

      if (value) {
        return value;
      }
    }

    return "";
  }

  function elementDebug(
    element
  ) {
    if (!element) {
      return null;
    }

    const rect =
      getRect(
        element
      );

    return {
      tag:
        element.tagName,
      text:
        normalizeText(
          element.innerText ||
          element.textContent ||
          ""
        ).slice(
          0,
          250
        ),
      data_test_id:
        normalizeText(
          element.getAttribute(
            "data-test-id"
          ) || ""
        ),
      aria_label:
        normalizeText(
          element.getAttribute(
            "aria-label"
          ) || ""
        ),
      title:
        normalizeText(
          element.getAttribute(
            "title"
          ) || ""
        ),
      rect: {
        left:
          Math.round(
            rect.left
          ),
        top:
          Math.round(
            rect.top
          ),
        width:
          Math.round(
            rect.width
          ),
        height:
          Math.round(
            rect.height
          )
      }
    };
  }

  function extractOpenedEmail() {
    if (
      location.hostname !==
      "mail.yahoo.com"
    ) {
      return {
        extractor_version:
          EXTRACTOR_VERSION,
        status:
          "UNSUPPORTED_HOST",
        provider:
          "yahoo",
        page_url:
          location.href
      };
    }

    const bodies =
      getMessageBodyCandidates();

    if (
      bodies.length === 0
    ) {
      return {
        extractor_version:
          EXTRACTOR_VERSION,
        status:
          "NO_OPEN_EMAIL_DETECTED",
        provider:
          "yahoo",
        page_url:
          location.href
      };
    }

    const bodyElement =
      bodies[
        bodies.length - 1
      ];

    const body =
      normalizeText(
        bodyElement.innerText ||
        bodyElement.textContent ||
        ""
      );

    if (!body) {
      return {
        extractor_version:
          EXTRACTOR_VERSION,
        status:
          "EMPTY_OPEN_EMAIL_BODY",
        provider:
          "yahoo",
        page_url:
          location.href
      };
    }

    const container =
      getMessageContainer(
        bodyElement
      );

    const sender =
      extractSender(
        bodyElement,
        container
      );

    const subject =
      extractSubject(
        bodyElement,
        container,
        sender.element
      );

    const timestamp =
      extractTimestamp(
        bodyElement,
        container
      );


    return {
      extractor_version:
        EXTRACTOR_VERSION,
      status:
        "EMAIL_EXTRACTED",
      provider:
        "yahoo",

      sender_name:
        sender.sender_name,
      sender_email:
        sender.sender_email,
      subject:
        subject.subject,
      body,
      displayed_timestamp:
        timestamp,

      page_url:
        location.href,
      extracted_at:
        new Date().toISOString(),

      diagnostics: {
        body_candidate_count:
          bodies.length,
        body_strategy:
          "highest_scoring_visible_yahoo_message_body",
        sender_strategy:
          sender.strategy,
        subject_strategy:
          subject.strategy,
        body_char_count:
          body.length,
        sender_email_found:
          Boolean(
            sender.sender_email
          ),
        subject_found:
          Boolean(
            subject.subject
          ),
        selected_body:
          elementDebug(
            bodyElement
          ),
        selected_sender:
          elementDebug(
            sender.element
          ),
        selected_subject:
          elementDebug(
            subject.element
          )
      },

      nlp_payload: {
        provider:
          "yahoo",
        sender:
          sender.sender_email ||
          sender.sender_name ||
          null,
        subject:
          subject.subject,
        body
      },

      overall_risk: {
        calculated:
          false,
        level:
          null,
        score:
          null,
        reason:
          "Yahoo Mail extractor provides an independent email-content NLP " +
          "signal only. Overall BantAI risk is calculated separately."
      }
    };
  }

  function fingerprintEmail(
    result
  ) {
    if (
      !result ||
      result.status !==
        "EMAIL_EXTRACTED"
    ) {
      return null;
    }

    const value = [
      result.sender_email,
      result.subject,
      result.body
    ].join(
      "\u241F"
    );

    let hash =
      2166136261;

    for (
      let index = 0;
      index < value.length;
      index += 1
    ) {
      hash ^=
        value.charCodeAt(
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

  async function sendExtractedEmail(
    result
  ) {
    try {
      await chrome.runtime
        .sendMessage({
          type:
            MESSAGE_TYPE,
          payload:
            result
        });
    } catch (error) {
      const message =
        String(
          error?.message ||
          error ||
          ""
        );

      if (
        !message.includes(
          "Extension context invalidated"
        )
      ) {
        console.debug("[BantAI Yahoo] SEND_MESSAGE_FAILED");
      }
    }
  }

  function sleep(
    milliseconds
  ) {
    return new Promise(
      (resolve) =>
        window.setTimeout(
          resolve,
          milliseconds
        )
    );
  }

  async function extractOpenedEmailWithSubjectRetry() {
    let result =
      extractOpenedEmail();

    if (
      result.status !==
        "EMAIL_EXTRACTED" ||
      result.subject
    ) {
      return result;
    }

    /*
     * Yahoo may render the message body/sender before the visible subject
     * element. The diagnostic build proved the exact subject selector appears
     * shortly after the first extraction.
     */
    const retryDelays = [
      250,
      600,
      1200
    ];

    for (
      const delay of
      retryDelays
    ) {
      await sleep(
        delay
      );

      const retryResult =
        extractOpenedEmail();

      if (
        retryResult.status !==
          "EMAIL_EXTRACTED"
      ) {
        continue;
      }

      result =
        retryResult;

      if (
        result.subject
      ) {
        console.info("[BantAI Yahoo] SUBJECT_FOUND_AFTER_RETRY");

        break;
      }
    }

    return result;
  }

  async function scanAndNotify() {
    if (
      scanInProgress
    ) {
      return null;
    }

    scanInProgress =
      true;

    try {
      const result =
        await extractOpenedEmailWithSubjectRetry();

      if (
        result.status !==
        "EMAIL_EXTRACTED"
      ) {
        lastFingerprint =
          null;

        return result;
      }

      const authenticationFingerprint = await globalThis.BantAISenderAuthentication?.attach(result) || "{}";
      const fingerprint = authenticationFingerprint +
        fingerprintEmail(
          result
        );

      if (
        fingerprint &&
        fingerprint ===
          lastFingerprint
      ) {
        return result;
      }

      lastFingerprint =
        fingerprint;

      console.info("[BantAI Yahoo] EMAIL_EXTRACTED");

      await sendExtractedEmail(
        result
      );

      return result;
    } finally {
      scanInProgress =
        false;
    }
  }

  function scheduleScan() {
    window.clearTimeout(
      debounceTimer
    );

    debounceTimer =
      window.setTimeout(
        () => {
          void scanAndNotify();
        },
        DEBOUNCE_MS
      );
  }

  function scheduleScanBurst() {
    window.setTimeout(
      () => {
        void scanAndNotify();
      },
      100
    );

    window.setTimeout(
      () => {
        void scanAndNotify();
      },
      500
    );

    window.setTimeout(
      () => {
        void scanAndNotify();
      },
      1300
    );
  }

  const observer =
    new MutationObserver(
      scheduleScan
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
      lastFingerprint =
        null;
      scheduleScanBurst();
    }
  );

  window.addEventListener(
    "popstate",
    () => {
      lastFingerprint =
        null;
      scheduleScanBurst();
    }
  );

  window.setInterval(
    () => {
      if (
        location.href !==
        lastObservedUrl
      ) {
        lastObservedUrl =
          location.href;

        lastFingerprint =
          null;

        scheduleScanBurst();
      }
    },
    500
  );

  /*
   * Yahoo sometimes updates the opened conversation without a reliable URL
   * or mutation signal. Periodic scan guarantees each newly opened email is
   * eventually detected. Fingerprinting prevents duplicate model calls.
   */
  window.setInterval(
    () => {
      void scanAndNotify();
    },
    PERIODIC_SCAN_MS
  );

  chrome.runtime
    .onMessage
    .addListener(
      (
        message,
        _sender,
        sendResponse
      ) => {
        if (
          message?.type !==
          REQUEST_TYPE
        ) {
          return false;
        }

        void extractOpenedEmailWithSubjectRetry()
          .then(
            (result) => {
              sendResponse(
                result
              );
            }
          )
          .catch(
            (error) => {
              console.error("[BantAI Yahoo] REQUEST_EXTRACTION_FAILED");

              sendResponse(
                extractOpenedEmail()
              );
            }
          );

        return true;
      }
    );

  window.__BANTAI_YAHOO_EXTRACTOR__ =
    Object.freeze({
      version:
        EXTRACTOR_VERSION,
      extractOpenedEmail,
      extractOpenedEmailWithSubjectRetry,
      findExactYahooMessageGroupSubject,
      scanAndNotify
    });

  console.info("[BantAI Yahoo] EXTRACTOR_LOADED");

  scheduleScanBurst();
})();
