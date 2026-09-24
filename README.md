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

## Card scanning and prices

`pos.html` has three photo tools, all on the Stock and Deal tabs:

- **Scan to add**: photo of one card or a whole binder page. Each card comes back with
  its TCGdex image, market price, sticker price and case/binder zone. Fix anything,
  set condition and cost (or enter one price for the whole lot and it gets split by
  market value), then add them all at once.
- **Price check**: same scan, nothing saved. Shows if you already have it in stock.
- **Snap the deal**: photo of the table during a sale or trade fills in the deal.

How it fits together: the photo goes to a Cloudflare Worker called `tcg-scanner`
(`https://tcg-scanner.austin-m-townsend.workers.dev`). The Worker holds the Gemini API
key as a secret, asks Gemini to read the cards, and only accepts requests from this
site. Its source is in `worker/scanner.js` (no secrets in it). If Google's main model
is busy it falls back to a lighter one automatically.

Prices come from [TCGdex](https://tcgdex.dev) (free, no key), which reports TCGplayer
market prices by printing. pokemontcg.io moved behind the paid Scrydex service, so it
is no longer used. Graded slabs, sealed product and non-English cards still show the
raw English price, so check those by hand.

To change the Worker: edit `worker/scanner.js`, then paste it into the Worker in the
Cloudflare dashboard (or ask Claude to deploy it). Opening the Worker URL in a browser
shows `{"ok":true,"keySet":true,...}` when it's healthy.

## Backing up the register

`pos.html`'s data lives only in the browser that opens it — clearing site data
or switching devices loses it. Use the download icon's **"Download full backup"**
weekly; it includes cost basis, so keep it private.
