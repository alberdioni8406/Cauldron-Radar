# Cauldron Radar

Live analytics dashboard for the Bitcoin Cash CashToken DeFi ecosystem, built on the
official [Cauldron protocol indexer](https://docs.riftenlabs.com/cauldron/API/cauldron/)
from Riften Labs. Part of the [BCH Lab](https://cashcompass.space) family:

```
BCH Lab
└── DeFi Explorer
    └── Cauldron Radar
```

No backend, no database, no build step. Static HTML/CSS/JS + one tiny Vercel
serverless function that proxies the indexer.

## What's real here

Every number on screen comes from a live call to `https://indexer.riften.net/cauldron/`
(documented at the link above). There is no mock or seeded data anywhere in the app —
empty/error states are shown explicitly when the indexer has nothing to return.

| Feature | Endpoint(s) used |
|---|---|
| Tokens tracked, dashboard stats | `/tokens/list_cached`, `/contract/count`, `/valuelocked`, `/volume` |
| Token Explorer (search/sort/paginate) | `/tokens/list_cached` |
| Token Detail — price, chart, pools | `/price/<token>/candlesticks`, `/pool/active`, `/valuelocked/<token>`, `/volume/<token>`, `/token/<token>/first_pool` |
| Token Detail — recent pool activity | `/pool/id_from_utxo` + `/pool/history/<pool_id>` |
| Pool Explorer | `/pool/active` (aggregated per-token, see limitation below) |
| Activity feed | `/tx/latest` |
| Watchlist | `/tokens/list_cached_by_ids` + browser `localStorage` |

## Known API limitations (read this before extending the app)

1. **No single "list every pool" endpoint.** `/pool/active` requires a `token` or `pkh`
   parameter — there's no ecosystem-wide pool list. The Pool Explorer works around this
   by aggregating `/pool/active` across the top ~40 tokens by TVL. Very long-tail tokens'
   pools may not surface there. This is called out in the UI itself.
2. **`/tx/latest` has no swap detail.** It returns only `txid`, `blockhash` and
   `timestamp_guess` — no token, direction, or amount. A literal "Wallet swapped X for Y"
   feed isn't possible from this endpoint alone. The global Activity view is honest about
   this and links out to a block explorer per transaction. For actual swap sizes, the
   Token Detail page derives real amounts from `/pool/id_from_utxo` + `/pool/history`
   (both marked "Unstable" in the docs — code degrades gracefully if they 404 or change shape).
3. **Low-level price endpoints are denominated per smallest unit**, not per whole token —
   the docs note you must multiply by `10 ** decimals`. `app.js` does this for the
   candlestick chart. The cached list endpoint (`/tokens/list_cached`) already returns
   whole-token prices (`price_now`, `price_now_usd`), so those are used as-is elsewhere.
4. **`bcmr` metadata (name, symbol, icon) is optional** — plenty of tokens on-chain have
   no BCMR registration. The app falls back to a truncated token ID and a placeholder
   icon rather than guessing a name.
5. Everything is unauthenticated and public (no API key), per the docs — but also
   unrated for abuse; the serverless proxy applies a short edge cache
   (`s-maxage=15`) to avoid hammering the indexer on every page view.

## Architecture

```
index.html   — app shell: header/nav/footer + view containers, one <template>
style.css    — dark "lab console" theme (see design notes in the file header)
app.js       — hash router + all view renderers + the API client
api/
  cauldron.js — Vercel serverless function: GET /api/cauldron?path=<endpoint>&...
vercel.json   — cleanUrls only, no special routing needed
```

The frontend calls `/api/cauldron` first. If that fails (e.g. running the static
files directly with no serverless runtime), it automatically falls back to calling
`https://indexer.riften.net/cauldron/` directly from the browser — the indexer already
serves permissive CORS since it's used client-side by the official Cauldron DEX
(`app.cauldron.quest`) from a different origin.

## Running locally

Any static file server works, since the app calls the indexer directly when there's
no serverless function to talk to:

```bash
npx serve .
# or
python3 -m http.server 8080
```

To test the proxy locally too, use the Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

## Deploying to Vercel

1. Push this folder to a GitHub repo.
2. Import it in Vercel — no build command, no output directory override needed
   (it's a static site with one `/api` function, which Vercel detects automatically).
3. Done. No environment variables required — the indexer is public and keyless.

## Extending it

- **Real "new pool" alerts**: the app currently tracks "tokens not seen on your last
  visit" in `localStorage` as a lightweight, honest proxy for "new" (see `SeenTokens` in
  `app.js`). A true creation-time feed would need `/token/<id>/first_pool` called across
  every token, which is expensive at scale — worth a small server-side cron/cache if you
  want this ecosystem-wide instead of per-browser.
- **WalletConnect / live trading**: out of scope for this read-only dashboard, but
  Riften Labs documents wallet integration at
  [docs.riftenlabs.com/cauldron/wallets](https://docs.riftenlabs.com/cauldron/wallets/)
  if you want to add a "swap" action later.
