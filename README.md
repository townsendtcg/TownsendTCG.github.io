# TownsendTCG.github.io

Three things live in this one repo now:

- **`index.html`** — the public show page (unchanged, just gained a "Shop" link).
- **`shop.html`** — the public storefront. Lists whatever's in `catalog.json`, lets a
  visitor request to buy a card, and emails (and optionally texts) Austin.
- **`pos.html`** — the private register: inventory, deals, cash, stats. PIN-gated,
  data lives only in the browser (IndexedDB) that opens it. Nothing here ever
  touches this repo on its own.

No build step. Every page is a single static HTML file — edit and push, same as
before. `pos.html` loads React straight from a CDN in the browser, so it doesn't
need Vite, npm, or a bundler.

## Get the shop's request form working

`shop.html` posts buy requests to a form backend — GitHub Pages can't run its own
server, so it needs a free third-party one:

1. Make a free account at [formspree.io](https://formspree.io) and create a form.
2. In that form's settings, add your notification email, and — if you want a text
   too — add a second notification address using your carrier's email-to-SMS
   gateway (e.g. `1234567890@vtext.com` for Verizon, `1234567890@txt.att.net` for
   AT&T, `1234567890@tmomail.net` for T-Mobile). Formspree emails every address you
   add for a new submission.
3. Copy the form's endpoint (`https://formspree.io/f/xxxxxxx`) into the
   `FORM_ENDPOINT` constant near the bottom of `shop.html` and push.

Nothing sensitive (your phone number, carrier, etc.) needs to live in this public
repo — it's all configured on Formspree's side.

## Publishing the catalog

`catalog.json` is what `shop.html` reads. It never includes cost or profit —
just name, set, condition, price and quantity. To refresh it:

1. Open `pos.html`, tap the download icon top right, and choose
   **"Download catalog.json for the shop."**
2. Replace `catalog.json` in this repo with the downloaded file (upload from your
   phone same as always, or ask Claude to push it for you if it's connected to
   this repo).

## The PIN on `pos.html`

It's a screen-door, not real security — the PIN is sitting in the page's own
source, so anyone who reads the file can read it. It just keeps a stumbled-upon
link from being poked at. Change `PIN_CODE` near the top of `pos.html` any time.

## Photo-based card reading ("Snap the deal")

Works when `pos.html` is opened inside a Claude artifact (it calls the model
directly there). On this GitHub-hosted version there's no backend to proxy that
call, so the button shows a manual-entry fallback instead. Wiring up a small
serverless function (Vercel, Cloudflare Workers) to restore it is a good next
step once this is worth the extra moving part — `api/vision.js` in this repo's
history has a working example to start from.

## Backing up the register

`pos.html`'s data lives only in the browser that opens it — clearing site data
or switching devices loses it. Use the download icon's **"Download full backup"**
weekly; it includes cost basis, so keep it private.
