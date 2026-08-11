# Cauldron Radar

Live analytics dashboard for the Bitcoin Cash CashToken DeFi ecosystem, built on the
official [Cauldron protocol indexer](https://docs.riftenlabs.com/cauldron/API/cauldron/)
from Riften Labs. Part of the [BCH Lab](https://cashcompass-bch.vercel.app) family:

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
| Trade entry point | Deep-links to `app.cauldron.quest`'s per-token trade route couldn't be confirmed from the docs, so the "Trade on Cauldron" button opens the general token list there rather than guessing a URL that might 404. |
| Tx verification | `https://bchexplorer.cash/tx/<txid>` (was `explorer.bitcoinunlimited.info`, now offline) |

## TVL methodology

TVL is the combined value of **both sides** of every pool: BCH-side reserves plus the
token-side reserves converted to a BCH-equivalent using that token's own market price
(`price_now` from `/tokens/list_cached`). See `tokenTvlBreakdown()`, `poolTvlSats()` and
`computeGlobalTvlSats()` in `app.js`.

**Bug fix history:** an earlier version summed `tokenTvlBreakdown()` across all ~1000
tracked tokens directly. That computation converts each token's raw pooled amount to a
whole-token count via `10 ** decimals` — and for any token with no public BCMR
registration (common), `decimals` silently defaulted to `0`. That treated raw base-unit
counts as whole-token counts, inflating the token side by up to 10^decimals for those
tokens and pushing the ecosystem-wide total to ~51,000,000 BCH instead of the real
~3,290–3,300 BCH. Two fixes now guard against this:
1. The token-side calculation only runs when BCMR-confirmed decimals exist; otherwise it
   falls back to treating the pool as balanced (token side ≈ BCH side) rather than
   guessing `decimals = 0`.
2. A sanity clamp caps any single token's computed token-side value to roughly 20× its
   BCH side — a correctly-scaled AMM pool's two sides sit in the same rough order of
   magnitude, since that's how the price itself is derived.
3. The **global** dashboard figure no longer sums per-token values directly at all — it
   anchors to the indexer's own authoritative BCH-side-only `/valuelocked` call (a single
   clean number) and scales it by a token-side ratio sampled from the 60 largest tokens by
   TVL, so even an imperfect per-token estimate can't distort the ecosystem-wide total.

## New in this update

- **Multi-period volume** — 24h/7d/30d volume cards on the Dashboard and Token Detail
  pages (`/volume` and `/volume/<token>` called with explicit `start`). The Explorer's
  Volume column has a 24h/7d/30d selector too; since there's no bulk multi-period volume
  endpoint, switching away from 24h only fetches `/volume/<token>` for the ~25 rows on
  the current page (cached per token+period), not the whole table.
- **Trade on Cauldron** — still can't confirm a per-token deep-link route for
  `app.cauldron.quest` from the docs, so the button copies the token ID to the clipboard,
  shows a toast, and opens the app's token list for pasting — real UX, no guessed/dead URL.
- **APY leaderboard** — `/pool/aggregated_apy?token=<id>` has no bulk "all tokens" mode,
  so this is computed per-token across the top 25 by TVL (a Dashboard mini-panel + a full
  "Highest APY" tab in the Pool Explorer).
- **Recently launched tokens** — enriches the existing local seen/unseen token diff
  (`SeenTokens`) with `/token/<id>/first_pool` for a real creation date, bounded to just
  the handful of tokens actually flagged new since your last visit.
- **Whale LPs / liquidity concentration** — a "Whale LPs" tab in the Pool Explorer ranks
  pool owners by total BCH locked (derived from already-fetched pool data, no extra
  calls); token detail pages show the top LP's share of that token's pooled BCH, and
  individual pool rows flag owners holding ≥20% of a token's liquidity.
- **Historical TVL chart** — Dashboard and Token Detail pages chart `/valuelocked` (global
  and per-token) sampled at 8 points over the last 30 days. Explicitly labeled as a
  **BCH-side reference series**, not a re-derivation of the corrected combined TVL at each
  past moment (that would mean re-pricing every token as of that timestamp — too
  expensive client-side).
- **7d liquidity Δ** on token pages, comparing current BCH-side lock to
  `/valuelocked/<token>?time=<7d ago>`.
- **"Hot" / unusual-volume flag** — a token is flagged 🔥 when its 24h volume is ≥50% of
  its TVL (a turnover ratio computed from data already on hand). This is explicitly a
  same-day activity signal, not a claim about a historical baseline the API doesn't expose.

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
