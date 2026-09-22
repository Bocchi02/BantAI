/*
 * Signalam Outlook Email-Content Extractor V2
 * =========================================
 *
 * Signalam milestone:
 *   v0.7.2 - Outlook sender + subject metadata extraction fix
 *
 * Scope:
 *   https://outlook.live.com/*
 *   https://outlook.office.com/*
 *   https://outlook.office365.com/*
 *   https://outlook.cloud.microsoft/*
 *
 * Main V2 change:
 *   The opened message body remains the primary anchor. Sender and subject
 *   candidates are selected by their visual/spatial proximity to that body
 *   in the reading pane. This reduces the chance of accidentally extracting
 *   the signed-in Outlook account address or text from the message list.
 *
 * IMPORTANT:
 *   - Email content only.
 *   - No overall Signalam risk calculation.
 *   - No threshold changes.
 *   - No arbitrary webpage classification.
 */

(() => {
  "use strict";

  if (
    globalThis.__BANTAI_OUTLOOK_EXTRACTOR_V100_LOADED__
  ) {
    return;
  }

  globalThis.__BANTAI_OUTLOOK_EXTRACTOR_V100_LOADED__ = true;

  const EXTRACTOR_VERSION =
    "BANTAI_OUTLOOK_EMAIL_EXTRACTOR_V6_EMAIL_ONLY";

  const MESSAGE_TYPE =
    "BANTAI_OUTLOOK_EMAIL_EXTRACTED";

  const REQUEST_TYPE =
    "BANTAI_OUTLOOK_GET_OPEN_EMAIL";

  const DEBOUNCE_MS = 900;
  const MIN_BODY_LENGTH = 1;

  const SUPPORTED_HOSTS = new Set([
    "outlook.live.com",
    "outlook.office.com",
    "outlook.office365.com",
    "outlook.cloud.microsoft"
  ]);

  let debounceTimer = null;
  let lastFingerprint = null;

  let lastObservedUrl =
    location.href;

  let scanInProgress =
    false;

  const PERIODIC_SCAN_MS =
    1000;

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

    const pieces = [];

    for (const node of element.childNodes) {
      if (
        node.nodeType === Node.TEXT_NODE
      ) {
        const value = normalizeText(
          node.textContent || ""
        );

        if (value) {
          pieces.push(value);
        }
      }
    }

    return normalizeText(
      pieces.join(" ")
    );
  }

  function isElementVisible(element) {
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

  function uniqueElements(elements) {
    return [
      ...new Set(elements)
    ];
  }

  function queryAll(
    selectors,
    root = document
  ) {
    const results = [];

    for (
      const selector of
      selectors
    ) {
      try {
        results.push(
          ...root.querySelectorAll(
            selector
          )
        );
      } catch {
        // Ignore selector failures.
      }
    }

    return uniqueElements(
      results
    );
  }

  function getAttributeText(
    element,
    attributes
  ) {
    if (!element) {
      return "";
    }

    for (
      const attribute of
      attributes
    ) {
      const value = normalizeText(
        element.getAttribute(
          attribute
        ) || ""
      );

      if (value) {
        return value;
      }
    }

    return "";
  }

  function extractEmailAddress(
    value
  ) {
    const text = String(
      value ?? ""
    );

    const match = text.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );

    return match
      ? match[0]
      : "";
  }

  function isComposeEditor(
    element
  ) {
    if (
      !(element instanceof Element)
    ) {
      return false;
    }

    if (
      element.matches(
        "[contenteditable='true'], textarea, input"
      )
    ) {
      return true;
    }

    return Boolean(
      element.closest(
        "[contenteditable='true'], " +
        "[aria-label*='Compose' i], " +
        "[aria-label*='New message' i]"
      )
    );
  }

  function horizontalOverlapRatio(
    rectA,
    rectB
  ) {
    const overlap = Math.max(
      0,
      Math.min(
        rectA.right,
        rectB.right
      ) -
      Math.max(
        rectA.left,
        rectB.left
      )
    );

    const denominator = Math.max(
      1,
      Math.min(
        rectA.width,
        rectB.width
      )
    );

    return overlap / denominator;
  }

  function centerX(rect) {
    return (
      rect.left +
      rect.width / 2
    );
  }

  function findReadingPaneRoots() {
    const selectors = [
      "[data-app-section='MailReadCompose']",
      "[data-app-section*='MailRead' i]",
      "[aria-label*='Reading pane' i]",
      "[aria-label*='Message pane' i]",
      "[role='main']"
    ];

    return queryAll(
      selectors
    ).filter(
      isElementVisible
    );
  }

  function scoreBodyCandidate(
    element
  ) {
    if (
      !isElementVisible(element) ||
      isComposeEditor(element)
    ) {
      return -Infinity;
    }

    const text = normalizeText(
      element.innerText ||
      element.textContent ||
      ""
    );

    if (
      text.length <
      MIN_BODY_LENGTH
    ) {
      return -Infinity;
    }

    let score =
      Math.min(
        text.length,
        12000
      ) / 100;

    if (
      element.matches(
        "[role='document']"
      )
    ) {
      score += 45;
    }

    const ariaLabel =
      normalizeText(
        element.getAttribute(
          "aria-label"
        ) || ""
      ).toLowerCase();

    if (
      ariaLabel.includes(
        "message body"
      )
    ) {
      score += 60;
    }

    const testId =
      normalizeText(
        element.getAttribute(
          "data-testid"
        ) || ""
      ).toLowerCase();

    if (
      testId.includes(
        "message"
      ) &&
      testId.includes(
        "body"
      )
    ) {
      score += 60;
    }

    if (
      element.closest(
        "[data-app-section='MailReadCompose'], " +
        "[data-app-section*='MailRead' i], " +
        "[aria-label*='Reading pane' i], " +
        "[aria-label*='Message pane' i]"
      )
    ) {
      score += 25;
    }

    const rect =
      element.getBoundingClientRect();

    if (
      rect.width > 250
    ) {
      score += 8;
    }

    if (
      rect.height > 60
    ) {
      score += 8;
    }

    return score;
  }

  function getVisibleMessageBodies() {
    const bodySelectors = [
      "[data-testid='message-body']",
      "[data-testid*='message-body' i]",
      "[data-testid*='messageBody' i]",
      "[aria-label='Message body']",
      "[aria-label*='Message body' i]",
      "[data-app-section='MailReadCompose'] [role='document']",
      "[data-app-section*='MailRead' i] [role='document']",
      "[aria-label*='Reading pane' i] [role='document']",
      "[aria-label*='Message pane' i] [role='document']",
      "div[role='main'] div[role='document']"
    ];

    const candidates =
      queryAll(
        bodySelectors
      )
        .filter(
          (element) =>
            !isComposeEditor(
              element
            )
        )
        .map(
          (element) => ({
            element,
            score:
              scoreBodyCandidate(
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
        );

    return candidates.map(
      (entry) =>
        entry.element
    );
  }

  function findMessageContainer(
    bodyElement
  ) {
    if (!bodyElement) {
      return null;
    }

    const containerSelectors = [
      "[data-app-section='MailReadCompose']",
      "[data-app-section*='MailRead' i]",
      "[aria-label*='Reading pane' i]",
      "[aria-label*='Message pane' i]",
      "[role='main']"
    ];

    for (
      const selector of
      containerSelectors
    ) {
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

  function candidateIsNearBody(
    element,
    bodyRect,
    options = {}
  ) {
    if (
      !isElementVisible(element)
    ) {
      return false;
    }

    const rect =
      element.getBoundingClientRect();

    const maxAbove =
      options.maxAbove ??
      500;

    const allowedBelow =
      options.allowedBelow ??
      40;

    if (
      rect.top >
      bodyRect.top +
      allowedBelow
    ) {
      return false;
    }

    const verticalGap =
      Math.max(
        0,
        bodyRect.top -
        rect.bottom
      );

    if (
      verticalGap >
      maxAbove
    ) {
      return false;
    }

    const overlap =
      horizontalOverlapRatio(
        rect,
        bodyRect
      );

    const x =
      centerX(rect);

    const horizontallyRelevant =
      overlap >= 0.08 ||
      (
        x >=
          bodyRect.left - 120 &&
        x <=
          bodyRect.right + 120
      );

    return horizontallyRelevant;
  }

  function spatialScore(
    element,
    bodyRect,
    options = {}
  ) {
    const rect =
      element.getBoundingClientRect();

    const verticalGap =
      Math.max(
        0,
        bodyRect.top -
        rect.bottom
      );

    const overlap =
      horizontalOverlapRatio(
        rect,
        bodyRect
      );

    const xDistance =
      Math.abs(
        centerX(rect) -
        centerX(bodyRect)
      );

    let score =
      verticalGap +
      xDistance * 0.08 -
      overlap * 80;

    if (
      options.preferLeftEdge
    ) {
      score +=
        Math.abs(
          rect.left -
          bodyRect.left
        ) * 0.03;
    }

    return score;
  }

  function headingLooksLikeUi(
    text
  ) {
    const value =
      normalizeText(
        text
      ).toLowerCase();

    if (!value) {
      return true;
    }

    const exactBlocked =
      new Set([
        "outlook",
        "mail",
        "inbox",
        "focused",
        "other",
        "favorites",
        "folders",
        "filter",
        "settings",
        "calendar",
        "people",
        "home",
        "view",
        "file",
        "new mail",
        "delete",
        "archive",
        "report",
        "move to",
        "reply all",
        "read / unread",
        "flag / unflag",
        "discover groups",
        "undo",
        "sent items",
        "junk email",
        "drafts",
        "deleted items",
        "conversation history",
        "notes",
        "go to groups"
      ]);

    if (
      exactBlocked.has(
        value
      )
    ) {
      return true;
    }

    if (
      /^(to|from|cc|bcc|sent|received)\s*:/i
        .test(value)
    ) {
      return true;
    }

    if (
      extractEmailAddress(
        value
      )
    ) {
      return true;
    }

    return false;
  }

  function looksLikeDateTime(text) {
    const value = normalizeText(text);

    if (!value) {
      return false;
    }

    return (
      /^(mon|tue|wed|thu|fri|sat|sun)\b/i.test(value) ||
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(value) ||
      /\b\d{1,2}:\d{2}\s*(am|pm)\b/i.test(value)
    );
  }

  function getLeafLikeVisibleElements() {
    return queryAll(
      ["div", "span", "button", "a"],
      document
    ).filter(
      (element) => {
        if (!isElementVisible(element)) {
          return false;
        }

        if (isComposeEditor(element)) {
          return false;
        }

        return element.children.length <= 2;
      }
    );
  }

  function elementTextWithAttributes(element) {
    const values = [
      directText(element),
      element.innerText,
      element.textContent,
      element.getAttribute("title"),
      element.getAttribute("aria-label"),
      element.getAttribute("data-email-address"),
      element.getAttribute("data-email")
    ];

    return normalizeText(
      values.filter(Boolean).join(" ")
    );
  }

  function extractSenderCandidateText(
    candidate
  ) {
    const href = normalizeText(
      candidate.getAttribute(
        "href"
      ) || ""
    );

    const rawValues = [
      candidate.getAttribute(
        "data-email-address"
      ),
      candidate.getAttribute(
        "data-email"
      ),
      candidate.getAttribute(
        "title"
      ),
      candidate.getAttribute(
        "aria-label"
      ),
      href.startsWith(
        "mailto:"
      )
        ? decodeURIComponent(
            href.slice(7).split(
              "?"
            )[0]
          )
        : "",
      directText(
        candidate
      ),
      candidate.innerText,
      candidate.textContent
    ];

    let senderEmail = "";

    for (
      const raw of
      rawValues
    ) {
      senderEmail =
        extractEmailAddress(
          raw
        );

      if (senderEmail) {
        break;
      }
    }

    if (!senderEmail) {
      return null;
    }

    const visibleText =
      normalizeText(
        candidate.innerText ||
        candidate.textContent ||
        ""
      );

    let senderName = "";

    if (
      visibleText &&
      visibleText.toLowerCase() !==
        senderEmail.toLowerCase()
    ) {
      senderName =
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
    }

    return {
      sender_name:
        senderName,
      sender_email:
        senderEmail
    };
  }

  function findSpatialSender(
    bodyElement
  ) {
    const bodyRect =
      bodyElement.getBoundingClientRect();

    const headerBandCandidates =
      getLeafLikeVisibleElements()
        .filter(
          (candidate) => {
            if (
              bodyElement.contains(
                candidate
              )
            ) {
              return false;
            }

            const rect =
              candidate.getBoundingClientRect();

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
              gap > 260
            ) {
              return false;
            }

            const overlap =
              horizontalOverlapRatio(
                rect,
                bodyRect
              );

            const x =
              centerX(
                rect
              );

            return (
              overlap >= 0.05 ||
              (
                x >=
                  bodyRect.left - 80 &&
                x <=
                  bodyRect.right + 80
              )
            );
          }
        )
        .map(
          (candidate) => {
            const combinedText =
              elementTextWithAttributes(
                candidate
              );

            const senderEmail =
              extractEmailAddress(
                combinedText
              );

            if (!senderEmail) {
              return null;
            }

            const rect =
              candidate.getBoundingClientRect();

            const verticalGap =
              Math.max(
                0,
                bodyRect.top -
                rect.bottom
              );

            const overlap =
              horizontalOverlapRatio(
                rect,
                bodyRect
              );

            const xDistance =
              Math.abs(
                rect.left -
                bodyRect.left
              );

            let score =
              verticalGap +
              xDistance * 0.05 -
              overlap * 120;

            const visibleText =
              normalizeText(
                candidate.innerText ||
                candidate.textContent ||
                ""
              );

            if (
              visibleText &&
              visibleText.includes(
                senderEmail
              )
            ) {
              score -= 80;
            }

            if (
              /<[^>]+@[^>]+>/.test(
                visibleText
              )
            ) {
              score -= 120;
            }

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
              element:
                candidate,
              parsed: {
                sender_name:
                  senderName,
                sender_email:
                  senderEmail
              },
              score
            };
          }
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.score - b.score
        );

    if (
      headerBandCandidates.length > 0
    ) {
      const best =
        headerBandCandidates[0];

      return {
        ...best.parsed,
        strategy:
          "visible_header_band_email_nearest_message_body",
        element:
          best.element
      };
    }

    const selectors = [
      "a[href^='mailto:']",
      "[data-email-address]",
      "[data-email]",
      "[title*='@']",
      "[aria-label*='@']"
    ];

    const candidates =
      queryAll(
        selectors,
        document
      )
        .filter(
          (candidate) =>
            !bodyElement.contains(
              candidate
            )
        )
        .filter(
          (candidate) =>
            candidateIsNearBody(
              candidate,
              bodyRect,
              {
                maxAbove: 260,
                allowedBelow: 0
              }
            )
        )
        .map(
          (candidate) => {
            const parsed =
              extractSenderCandidateText(
                candidate
              );

            if (!parsed) {
              return null;
            }

            return {
              element:
                candidate,
              parsed,
              score:
                spatialScore(
                  candidate,
                  bodyRect,
                  {
                    preferLeftEdge:
                      true
                  }
                )
            };
          }
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.score - b.score
        );

    if (
      candidates.length === 0
    ) {
      return {
        sender_name: "",
        sender_email: "",
        strategy:
          "no_header_sender_candidate",
        element: null
      };
    }

    const best =
      candidates[0];

    return {
      ...best.parsed,
      strategy:
        "fallback_attribute_email_above_message_body",
      element:
        best.element
    };
  }

  function findStrongSubjectCandidates(
    bodyElement
  ) {
    const bodyRect =
      bodyElement
        .getBoundingClientRect();

    const selectors = [
      "[data-testid*='subject' i]",
      "[aria-label*='subject' i]",
      "[data-subject]",
      "h1",
      "h2",
      "h3",
      "[role='heading']"
    ];

    return queryAll(
      selectors,
      document
    )
      .filter(
        (candidate) =>
          !bodyElement.contains(
            candidate
          )
      )
      .filter(
        (candidate) =>
          candidateIsNearBody(
            candidate,
            bodyRect,
            {
              maxAbove: 500,
              allowedBelow: 20
            }
          )
      )
      .map(
        (candidate) => {
          const rendered =
            normalizeText(
              candidate.innerText ||
              candidate.textContent ||
              ""
            );

          const attribute =
            getAttributeText(
              candidate,
              [
                "data-subject",
                "title",
                "aria-label"
              ]
            );

          const text =
            normalizeText(
              rendered ||
              attribute
            )
              .replace(
                /^subject\s*:\s*/i,
                ""
              )
              .trim();

          return {
            element:
              candidate,
            text,
            score:
              spatialScore(
                candidate,
                bodyRect
              ) - 100
          };
        }
      )
      .filter(
        (entry) =>
          entry.text &&
          entry.text.length <= 500 &&
          !headingLooksLikeUi(
            entry.text
          ) &&
          !looksLikeDateTime(
            entry.text
          )
      );
  }

  function findGenericSubjectCandidates(
    bodyElement
  ) {
    const bodyRect =
      bodyElement
        .getBoundingClientRect();

    /*
     * Outlook frequently renders the subject as an ordinary div/span
     * rather than a semantic heading. Only direct/leaf-like text is used
     * here to avoid selecting a large container containing the entire pane.
     */
    const candidates =
      queryAll(
        [
          "div",
          "span"
        ],
        document
      );

    const results = [];

    for (
      const candidate of
      candidates
    ) {
      if (
        bodyElement.contains(
          candidate
        ) ||
        !candidateIsNearBody(
          candidate,
          bodyRect,
          {
            maxAbove: 430,
            allowedBelow: 10
          }
        )
      ) {
        continue;
      }

      let text =
        directText(
          candidate
        );

      if (!text) {
        const childElementCount =
          candidate.children.length;

        if (
          childElementCount <= 1
        ) {
          text =
            normalizeText(
              candidate.innerText ||
              candidate.textContent ||
              ""
            );
        }
      }

      text =
        normalizeText(
          text
        )
          .replace(
            /^subject\s*:\s*/i,
            ""
          )
          .trim();

      if (
        !text ||
        text.length < 3 ||
        text.length > 500 ||
        headingLooksLikeUi(
          text
        ) ||
        looksLikeDateTime(
          text
        )
      ) {
        continue;
      }

      const rect =
        candidate
          .getBoundingClientRect();

      /*
       * Exclude tiny toolbar labels and large containers.
       */
      if (
        rect.width < 40 ||
        rect.height > 120
      ) {
        continue;
      }

      results.push({
        element:
          candidate,
        text,
        score:
          spatialScore(
            candidate,
            bodyRect
          )
      });
    }

    return results;
  }

  function extractSubject(
    bodyElement,
    senderElement = null
  ) {
    const bodyRect =
      bodyElement
        .getBoundingClientRect();

    const strong =
      findStrongSubjectCandidates(
        bodyElement
      );

    const generic =
      findGenericSubjectCandidates(
        bodyElement
      );

    const candidates = [
      ...strong,
      ...generic
    ];

    if (
      senderElement
    ) {
      const senderRect =
        senderElement
          .getBoundingClientRect();

      for (
        const candidate of
        candidates
      ) {
        const rect =
          candidate.element
            .getBoundingClientRect();

        const computedStyle =
          window.getComputedStyle(
            candidate.element
          );

        const fontSize =
          Number.parseFloat(
            computedStyle.fontSize ||
            "0"
          );

        if (
          rect.bottom <=
          senderRect.top + 20
        ) {
          candidate.score -= 100;
        }

        if (
          Number.isFinite(
            fontSize
          ) &&
          fontSize >= 16
        ) {
          candidate.score -= 70;
        }

        if (
          Number.isFinite(
            fontSize
          ) &&
          fontSize >= 18
        ) {
          candidate.score -= 50;
        }

        if (
          extractEmailAddress(
            candidate.text
          )
        ) {
          candidate.score += 700;
        }

        if (
          looksLikeDateTime(
            candidate.text
          )
        ) {
          candidate.score += 1000;
        }
      }
    }

    /*
     * Prefer candidates that sit close above the message body and horizontally
     * overlap the reading pane. Subject candidates far left in the message list
     * are naturally penalized by spatialScore.
     */
    candidates.sort(
      (a, b) =>
        a.score -
        b.score
    );

    for (
      const candidate of
      candidates
    ) {
      if (
        looksLikeDateTime(
          candidate.text
        )
      ) {
        continue;
      }

      const rect =
        candidate.element
          .getBoundingClientRect();

      const verticalGap =
        Math.max(
          0,
          bodyRect.top -
          rect.bottom
        );

      if (
        verticalGap <= 500
      ) {
        return {
          subject:
            candidate.text,
          strategy:
            strong.includes(
              candidate
            )
              ? "strong_subject_selector_plus_spatial_proximity"
              : "leaf_text_plus_spatial_proximity",
          element:
            candidate.element
        };
      }
    }

    return {
      subject: "",
      strategy:
        "no_subject_candidate",
      element: null
    };
  }

  function extractTimestamp(
    bodyElement
  ) {
    const bodyRect =
      bodyElement
        .getBoundingClientRect();

    const selectors = [
      "time[datetime]",
      "time",
      "[data-testid*='date' i]",
      "[data-testid*='time' i]",
      "[title*='202']"
    ];

    const candidates =
      queryAll(
        selectors,
        document
      )
        .filter(
          (candidate) =>
            candidateIsNearBody(
              candidate,
              bodyRect,
              {
                maxAbove: 400,
                allowedBelow: 40
              }
            )
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

    for (
      const candidate of
      candidates
    ) {
      const text =
        normalizeText(
          getAttributeText(
            candidate,
            [
              "datetime",
              "title",
              "aria-label"
            ]
          ) ||
          candidate.innerText ||
          candidate.textContent ||
          ""
        );

      if (text) {
        return text;
      }
    }

    return "";
  }

  function elementDebugSummary(
    element
  ) {
    if (!element) {
      return null;
    }

    const rect =
      element.getBoundingClientRect();

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
      direct_text:
        directText(
          element
        ).slice(
          0,
          250
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
      data_testid:
        normalizeText(
          element.getAttribute(
            "data-testid"
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
        right:
          Math.round(
            rect.right
          ),
        bottom:
          Math.round(
            rect.bottom
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

  function debugMetadataCandidates() {
    const visibleBodies =
      getVisibleMessageBodies();

    if (
      visibleBodies.length === 0
    ) {
      return {
        status:
          "NO_OPEN_EMAIL_DETECTED"
      };
    }

    const bodyElement =
      visibleBodies[
        visibleBodies.length - 1
      ];

    const sender =
      findSpatialSender(
        bodyElement
      );

    const subject =
      extractSubject(
        bodyElement,
        sender.element
      );

    return {
      status:
        "DEBUG_METADATA",
      extractor_version:
        EXTRACTOR_VERSION,
      selected_body:
        elementDebugSummary(
          bodyElement
        ),
      sender: {
        sender_name:
          sender.sender_name,
        sender_email:
          sender.sender_email,
        strategy:
          sender.strategy,
        selected_element:
          elementDebugSummary(
            sender.element
          )
      },
      subject: {
        subject:
          subject.subject,
        strategy:
          subject.strategy,
        selected_element:
          elementDebugSummary(
            subject.element
          )
      }
    };
  }

  function extractOpenedEmail() {
    if (
      !SUPPORTED_HOSTS.has(
        location.hostname
      )
    ) {
      return {
        extractor_version:
          EXTRACTOR_VERSION,
        status:
          "UNSUPPORTED_HOST",
        provider:
          "outlook",
        page_url:
          location.href
      };
    }

    const visibleBodies =
      getVisibleMessageBodies();

    if (
      visibleBodies.length === 0
    ) {
      return {
        extractor_version:
          EXTRACTOR_VERSION,
        status:
          "NO_OPEN_EMAIL_DETECTED",
        provider:
          "outlook",
        page_url:
          location.href
      };
    }

    const selectedBody =
      visibleBodies[
        visibleBodies.length - 1
      ];

    const container =
      findMessageContainer(
        selectedBody
      );

    const sender =
      findSpatialSender(
        selectedBody
      );

    const subjectResult =
      extractSubject(
        selectedBody,
        sender.element
      );

    const timestamp =
      extractTimestamp(
        selectedBody
      );

    const bodyText =
      normalizeText(
        selectedBody.innerText ||
        selectedBody.textContent ||
        ""
      );

    if (!bodyText) {
      return {
        extractor_version:
          EXTRACTOR_VERSION,
        status:
          "EMPTY_OPEN_EMAIL_BODY",
        provider:
          "outlook",
        page_url:
          location.href,
        subject:
          subjectResult.subject ||
          null
      };
    }


    return {
      extractor_version:
        EXTRACTOR_VERSION,
      status:
        "EMAIL_EXTRACTED",
      provider:
        "outlook",

      subject:
        subjectResult.subject,
      body:
        bodyText,

      sender_name:
        sender.sender_name,
      sender_email:
        sender.sender_email,
      displayed_timestamp:
        timestamp,

      page_url:
        location.href,
      extracted_at:
        new Date().toISOString(),

      diagnostics: {
        visible_body_candidate_count:
          visibleBodies.length,
        selected_message_strategy:
          "highest_scoring_visible_reading_pane_body",
        metadata_strategy:
          "spatial_proximity_to_selected_message_body",
        sender_strategy:
          sender.strategy,
        subject_strategy:
          subjectResult.strategy,
        body_char_count:
          bodyText.length,
        subject_char_count:
          subjectResult.subject.length,
        sender_email_found:
          Boolean(
            sender.sender_email
          ),
        host:
          location.hostname,
        message_container_found:
          Boolean(
            container
          )
      },

      nlp_payload: {
        provider:
          "outlook",
        sender:
          sender.sender_email ||
          sender.sender_name ||
          null,
        subject:
          subjectResult.subject,
        body:
          bodyText
      },

      overall_risk: {
        calculated:
          false,
        level:
          null,
        score:
          null,
        reason:
          "Outlook Email-Content Extractor V2 extracts email content and " +
          "metadata only. Classification is handled separately by the frozen " +
          "Signalam XLM-RoBERTa Email NLP Analyzer V1."
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
      result.subject,
      result.sender_email,
      result.body
    ].join(
      "\u241F"
    );

    let hash = 2166136261;

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
    if (
      typeof chrome ===
        "undefined" ||
      !chrome.runtime ||
      !chrome.runtime
        .sendMessage
    ) {
      return;
    }

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
        console.debug("[Signalam Outlook] SEND_MESSAGE_FAILED");
      }
    }
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
        extractOpenedEmail();

      if (
        result.status !==
        "EMAIL_EXTRACTED"
      ) {
        /*
         * Returning to the inbox/no-message state resets deduplication so
         * reopening the same email triggers a new analysis.
         */
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

      console.info("[Signalam Outlook] EMAIL_EXTRACTED");

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
      80
    );

    window.setTimeout(
      () => {
        void scanAndNotify();
      },
      350
    );

    window.setTimeout(
      () => {
        void scanAndNotify();
      },
      900
    );
  }

  const observer =
    new MutationObserver(
      () => {
        scheduleScan();
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

  window.setInterval(
    () => {
      void scanAndNotify();
    },
    PERIODIC_SCAN_MS
  );

  if (
    typeof chrome !==
      "undefined" &&
    chrome.runtime &&
    chrome.runtime
      .onMessage
  ) {
    chrome.runtime
      .onMessage
      .addListener(
        (
          message,
          _sender,
          sendResponse
        ) => {
          if (
            !message ||
            message.type !==
              REQUEST_TYPE
          ) {
            return false;
          }

          const result =
            extractOpenedEmail();

          sendResponse(
            result
          );

          return false;
        }
      );
  }

  /*
   * Development helpers.
   *
   * In the Outlook tab DevTools, select the Signalam extension content-script
   * execution context when necessary, then run:
   *
   * window.__BANTAI_OUTLOOK_EXTRACTOR__.extractOpenedEmail()
   *
   * Metadata-only diagnostic:
   *
   * window.__BANTAI_OUTLOOK_EXTRACTOR__.debugMetadataCandidates()
   */
  window.__BANTAI_OUTLOOK_EXTRACTOR__ =
    Object.freeze({
      version:
        EXTRACTOR_VERSION,
      extractOpenedEmail,
      scanAndNotify,
      debugMetadataCandidates
    });

  console.info("[Signalam Outlook] EXTRACTOR_LOADED");

  scheduleScanBurst();
})();
