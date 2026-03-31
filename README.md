# Cookie Rejecter — Chrome Extension

Automatically rejects cookie consent banners. If no reject option exists, selects the **least permissive** available option (e.g. "Necessary only").

---

## How It Works

### Strategy (in order)

1. **CMP Adapters** — Direct selectors for known consent platforms (OneTrust, Cookiebot, Didomi, Osano, etc.)
2. **Heuristic scoring** — Finds all buttons within detected banner containers and scores them:
   | Score | Examples |
   |-------|---------|
   | 100 | "Reject all", "Decline", "No thanks", "Opt out" |
   | 80 | "Necessary only", "Essential cookies only" |
   | 40 | "Manage preferences", "Customize" |
   | 20 | "Save settings" |
   | -999 | "Accept all", "Agree", "OK", "Continue" ← **never clicked** |
3. **MutationObserver** — Watches for banners that load after the page (SPAs, lazy loaders)

### Fallback behavior

- If **only accept buttons exist**, the extension does **nothing** (avoids granting more permissions than already present)
- If "manage preferences" is the best option, it clicks that — you may need to manually finish in the opened settings panel

---

## Installation

### Load unpacked (dev)

1. Clone / download this folder
2. Generate icons (optional):
   ```sh
   npm install canvas
   node generate-icons.js
   ```
   Or drop your own 16×16, 48×48, and 128×128 PNGs into `icons/`
3. Open Chrome → `chrome://extensions`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** → select this folder

---

## Files

```
cookie-rejecter/
├── manifest.json       # Extension manifest (MV3)
├── content.js          # Main logic — runs on every page
├── background.js       # Service worker — badge counter
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic
├── generate-icons.js   # Dev utility to create placeholder icons
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Supported CMPs (direct selectors)

- OneTrust
- Cookiebot
- Didomi
- Osano
- Borlabs Cookie
- Complianz
- Iubenda
- CookieYes / CookieLaw
- Termly
- Civic Cookie Control
- GDPR Compliance (WP plugin)
- TrustArc / TRUSTe
- Admiral
- Sourcepoint

All other banners are handled by the heuristic fallback.

---

## Popup Features

- **Enable/disable** the extension globally
- **Block a site** — prevents the extension from acting on that domain
- **Page counter** — shows how many banners were handled on the current tab
- **All-time counter** — lifetime total across all tabs

---

## Known Limitations

- Some CMPs use iframes (e.g. IAB TCF v2 implementations) — cross-origin iframes can't be accessed
- "Manage preferences" clicks open a settings panel but don't auto-configure it (no way to know which toggles map to which permissions)
- Very aggressive SPA routers that replace the entire DOM may re-trigger banners — the MutationObserver handles most of these
- Some sites detect and block automated clicks (rare)

---

## Privacy

This extension:
- Makes **no network requests**
- Stores only: `enabled` (bool), `blocklist` (array of hostnames), `totalHandled` (integer)
- Has no analytics, no telemetry
