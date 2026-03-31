/**
 * Crumb Crusher - Content Script
 *
 * Strategy:
 * 1. Try known CMP (Consent Management Platform) adapters first (OneTrust, Cookiebot, etc.)
 * 2. Fall back to heuristic button scoring on any visible banner-like element
 * 3. If no reject button found, click the "least permissions" option
 * 4. Use MutationObserver to catch late-loading banners (SPAs, lazy loads)
 */

(() => {
  "use strict";

  // ─── Constants ────────────────────────────────────────────────────────────

  const LOG_PREFIX = "[Crumb Crusher]";
  const MAX_ATTEMPTS = 5;
  const RETRY_DELAY_MS = 800;
  const OBSERVER_TIMEOUT_MS = 15000;

  /**
   * Button text patterns, ordered by preference (index 0 = most preferred).
   * Each tier represents a different level of cookie permission granted.
   */
  const BUTTON_PRIORITY = [
    // Tier 0 — explicit rejection (best)
    {
      score: 100,
      patterns: [
        /\breject\s*(all)?\b/i,
        /\bdecline\s*(all)?\b/i,
        /\brefuse\s*(all)?\b/i,
        /\bno[,]?\s*thanks?\b/i,
        /\bopt[\s-]?out\b/i,
        /\bdisable\s*(all)?\b/i,
        /\bdo\s+not\s+(accept|allow|consent)\b/i,
      ],
    },
    // Tier 1 — necessary/essential only (nearly as good)
    {
      score: 80,
      patterns: [
        /\b(only\s+)?(necessary|essential|required|mandatory|functional)\s*(cookies?)?\b/i,
        /\buse\s+(only\s+)?(necessary|essential)\b/i,
        /\bminimal\b/i,
        /\blimited\b/i,
      ],
    },
    // Tier 2 — manage/customize (opens settings, not ideal but better than accept)
    {
      score: 40,
      patterns: [
        /\b(manage|customize|customise|preferences?|settings?|options?)\b/i,
        /\bconfigure\b/i,
      ],
    },
    // Tier 3 — save current settings (neutral — may still reject if defaults are low)
    {
      score: 20,
      patterns: [
        /\bsave\s+(my\s+)?(settings?|preferences?|choices?)\b/i,
        /\bconfirm\s+(my\s+)?(choices?|selection)\b/i,
      ],
    },
    // Tier -1 — acceptance patterns (avoid these)
    {
      score: -999,
      patterns: [
        /\baccept\s*(all|cookies?|everything)?\b/i,
        /\bagree\b/i,
        /\ballow\s*(all|cookies?)?\b/i,
        /\bconsent\b/i,
        /\bok\b/i,
        /\bgot\s*it\b/i,
        /\bunderstood\b/i,
        /\bcontinue\b/i,
        /\bproceed\b/i,
      ],
    },
  ];

  /**
   * Known CMP-specific selectors. These are checked before generic heuristics.
   * Format: { selector: string, type: 'reject' | 'necessary' | 'manage' }
   */
  const CMP_ADAPTERS = [
    // OneTrust
    { selector: "#onetrust-reject-all-handler", type: "reject" },
    { selector: ".onetrust-reject-all-handler", type: "reject" },
    { selector: "#onetrust-accept-btn-handler", type: "accept" }, // known, avoid
    // Cookiebot
    { selector: "#CybotCookiebotDialogBodyButtonDecline", type: "reject" },
    { selector: "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll", type: "reject" },
    // TrustArc / TRUSTe
    { selector: ".trustarc-agree-btn", type: "accept" }, // avoid
    { selector: ".trustarc-decline-btn", type: "reject" },
    // Quantcast / Didomi
    { selector: "#didomi-notice-disagree-button", type: "reject" },
    { selector: ".didomi-components-button--disagree", type: "reject" },
    // Osano
    { selector: ".osano-cm-denyAll", type: "reject" },
    { selector: ".osano-cm-decline", type: "reject" },
    // GDPR Compliance (WP plugin)
    { selector: ".gdpr-cookie-notice-reject", type: "reject" },
    // Civic Cookie Control
    { selector: "#ccc-reject-settings", type: "reject" },
    // Borlabs Cookie
    { selector: "#BorlabsCookieDeny", type: "reject" },
    // Complianz
    { selector: ".cmplz-deny", type: "reject" },
    { selector: ".cmplz-btn.cmplz-deny", type: "reject" },
    // Iubenda
    { selector: ".iubenda-cs-reject-btn", type: "reject" },
    // CookieYes / CookieLaw
    { selector: ".cky-btn-reject", type: "reject" },
    { selector: "[data-cky-tag='reject-button']", type: "reject" },
    // Termly
    { selector: "#declineButton", type: "reject" },
    // Admiral
    { selector: ".adm-deny-all", type: "reject" },
    // Consent Manager (Sourcepoint)
    { selector: "[title='Reject All']", type: "reject" },
    { selector: "button[aria-label*='reject' i]", type: "reject" },
    { selector: "button[aria-label*='decline' i]", type: "reject" },
  ];

  /**
   * Selectors that commonly wrap cookie banners/dialogs.
   * Used to scope button searches and avoid false positives elsewhere on page.
   */
  const BANNER_SELECTORS = [
    // IDs
    "#cookie-banner",
    "#cookie-consent",
    "#cookie-notice",
    "#cookie-dialog",
    "#cookie-popup",
    "#cookie-bar",
    "#cookiebanner",
    "#cookieconsent",
    "#cookieConsent",
    "#cookieNotice",
    "#gdpr-banner",
    "#gdpr-consent",
    "#gdpr-popup",
    "#consent-banner",
    "#consent-popup",
    "#consent-dialog",
    "#onetrust-banner-sdk",
    "#onetrust-consent-sdk",
    "#CybotCookiebotDialog",
    "#didomi-host",
    "#didomi-notice",
    "#cc-window",
    "#CookieConsent",
    "#cookiebar",
    // Classes
    ".cookie-banner",
    ".cookie-consent",
    ".cookie-notice",
    ".cookie-popup",
    ".cookie-dialog",
    ".cookie-bar",
    ".cookiebanner",
    ".cookieconsent",
    ".gdpr-banner",
    ".gdpr-consent",
    ".gdpr-popup",
    ".consent-banner",
    ".consent-popup",
    ".cc-window",
    ".cc-banner",
    ".cc-dialog",
    // ARIA roles
    "[role='dialog'][aria-label*='cookie' i]",
    "[role='dialog'][aria-label*='consent' i]",
    "[role='dialog'][aria-label*='privacy' i]",
    "[role='alertdialog'][aria-label*='cookie' i]",
    // data attributes
    "[data-cookiebanner]",
    "[data-cookie-consent]",
    "[data-consent-manager]",
  ];

  // ─── State ────────────────────────────────────────────────────────────────

  let handled = false;
  let observerTimer = null;
  let mutationObserver = null;

  // ─── Utilities ────────────────────────────────────────────────────────────

  function log(...args) {
    console.debug(LOG_PREFIX, ...args);
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      (rect.width > 0 || rect.height > 0)
    );
  }

  function isClickable(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return (
      tag === "button" ||
      tag === "a" ||
      el.getAttribute("role") === "button" ||
      el.getAttribute("tabindex") !== null ||
      el.onclick !== null
    );
  }

  function getButtonText(el) {
    return (el.innerText || el.textContent || el.getAttribute("aria-label") || el.value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function scoreButton(text) {
    let score = 0;
    for (const tier of BUTTON_PRIORITY) {
      for (const pattern of tier.patterns) {
        if (pattern.test(text)) {
          score = Math.max(score, tier.score); // take highest matching score
          break;
        }
      }
    }
    return score;
  }

  function clickElement(el, reason) {
    log(`Clicking "${getButtonText(el)}" — reason: ${reason}`);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    // Some CMPs listen to both click and pointerdown
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    if (typeof el.click === "function") el.click();

    // Update badge via background
    chrome.runtime.sendMessage({ type: "COOKIE_HANDLED", url: window.location.hostname });
  }

  // ─── CMP Adapters ─────────────────────────────────────────────────────────

  function tryCMPAdapters() {
    for (const adapter of CMP_ADAPTERS) {
      if (adapter.type === "accept") continue; // skip accept buttons
      const el = document.querySelector(adapter.selector);
      if (el && isVisible(el)) {
        clickElement(el, `CMP adapter: ${adapter.selector}`);
        return true;
      }
    }
    return false;
  }

  // ─── Heuristic Banner Detection ───────────────────────────────────────────

  function findBannerContainers() {
    const containers = [];

    // 1. Try known banner selectors
    for (const sel of BANNER_SELECTORS) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (isVisible(el) && !containers.includes(el)) {
            containers.push(el);
          }
        }
      } catch (_) {
        // invalid selector, skip
      }
    }

    // 2. Heuristic: look for fixed/sticky positioned elements with cookie-like text
    if (containers.length === 0) {
      const allDivs = document.querySelectorAll(
        "div, section, aside, footer, header, nav, form"
      );
      for (const el of allDivs) {
        if (!isVisible(el)) continue;
        const style = window.getComputedStyle(el);
        const isOverlay =
          style.position === "fixed" ||
          style.position === "sticky" ||
          parseInt(style.zIndex) > 100;

        if (!isOverlay) continue;

        const text = el.innerText?.toLowerCase() || "";
        const hasCookieText =
          text.includes("cookie") ||
          text.includes("consent") ||
          text.includes("privacy") ||
          text.includes("gdpr") ||
          text.includes("tracking");

        if (hasCookieText && !containers.includes(el)) {
          containers.push(el);
        }
      }
    }

    return containers;
  }

  function findBestButton(containers) {
    // Collect all candidate buttons within detected banners
    const candidates = [];

    for (const container of containers) {
      const buttons = container.querySelectorAll(
        "button, a[href], [role='button'], input[type='button'], input[type='submit']"
      );
      for (const btn of buttons) {
        if (!isVisible(btn)) continue;
        const text = getButtonText(btn);
        if (!text) continue;
        const score = scoreButton(text);
        candidates.push({ el: btn, text, score });
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    log("Scored candidates:", candidates.map((c) => `"${c.text}" → ${c.score}`));

    const best = candidates[0];

    // Only click if score > 0 (never click pure-accept buttons)
    if (best.score <= 0) {
      log("No suitable non-accept button found. Skipping to avoid accepting cookies.");
      return null;
    }

    return best;
  }

  // ─── Main Handler ─────────────────────────────────────────────────────────

  function handleCookieBanner() {
    if (handled) return;

    // Step 1: Try known CMP adapters
    if (tryCMPAdapters()) {
      handled = true;
      cleanup();
      return;
    }

    // Step 2: Heuristic detection
    const containers = findBannerContainers();
    if (containers.length === 0) return;

    const best = findBestButton(containers);
    if (!best) return;

    clickElement(best.el, `heuristic score=${best.score}, text="${best.text}"`);
    handled = true;
    cleanup();
  }

  function cleanup() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (observerTimer) {
      clearTimeout(observerTimer);
      observerTimer = null;
    }
  }

  // ─── Retry + MutationObserver ─────────────────────────────────────────────

  function startObserver() {
    let attempts = 0;

    // Initial attempt with retries (handles most static pages)
    const retry = setInterval(() => {
      if (handled || attempts >= MAX_ATTEMPTS) {
        clearInterval(retry);
        return;
      }
      attempts++;
      handleCookieBanner();
    }, RETRY_DELAY_MS);

    // MutationObserver for SPAs and lazy-loaded banners
    mutationObserver = new MutationObserver((mutations) => {
      if (handled) {
        cleanup();
        return;
      }

      const hasRelevantMutation = mutations.some((m) => {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const text = node.innerText?.toLowerCase() || "";
          if (
            text.includes("cookie") ||
            text.includes("consent") ||
            text.includes("gdpr")
          ) {
            return true;
          }
        }
        return false;
      });

      if (hasRelevantMutation) {
        handleCookieBanner();
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Stop observing after timeout to avoid memory leaks
    observerTimer = setTimeout(() => {
      cleanup();
      log("Observer stopped after timeout.");
    }, OBSERVER_TIMEOUT_MS);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    // Check if extension is enabled for this site
    chrome.storage.sync.get(["enabled", "blocklist"], (data) => {
      const enabled = data.enabled !== false; // default on
      const blocklist = data.blocklist || [];
      const hostname = window.location.hostname;

      if (!enabled || blocklist.includes(hostname)) {
        log("Disabled for this site:", hostname);
        return;
      }

      // Run immediately, then set up observer for late-loading banners
      handleCookieBanner();
      startObserver();
    });
  }

  // Wait for body to exist
  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
