/* =========================================================================
   Cauldron Radar — app.js
   A hash-routed single-page app with zero build step. Talks to the official
   Riften Labs Cauldron indexer (docs: https://docs.riftenlabs.com/cauldron/API/cauldron/)
   either through our own /api/cauldron serverless proxy (default, avoids any
   CORS surprises) or, if that's unavailable, directly against the indexer.
   ========================================================================= */

(() => {
  'use strict';

  // -----------------------------------------------------------------------
  // API layer
  // -----------------------------------------------------------------------

  const PROXY_BASE = '/api/cauldron';
  const DIRECT_BASE = 'https://indexer.riften.net/cauldron/';
  const IS_LOCAL_STATIC = location.protocol === 'file:'; // no serverless function available

  let apiMode = IS_LOCAL_STATIC ? 'direct' : 'proxy'; // flips to 'direct' if the proxy ever fails
  const apiStatusEl = document.getElementById('apiStatus');

  function setApiStatus(state, label) {
    apiStatusEl.className = 'api-status ' + state;
    apiStatusEl.querySelector('.status-text').textContent = label;
  }

  /**
   * Calls one documented Cauldron indexer endpoint.
   * @param {string} path   e.g. "tokens/list_cached", "price/<token>/current"
   * @param {object} params query params to forward
   */
  async function cauldron(path, params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });

    const attempt = async (mode) => {
      const url =
        mode === 'proxy'
          ? `${PROXY_BASE}?path=${encodeURIComponent(path)}&${qs.toString()}`
          : `${DIRECT_BASE}${path}${qs.toString() ? '?' + qs.toString() : ''}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
      return res.json();
    };

    try {
      const data = await attempt(apiMode);
      setApiStatus('ok', 'Indexer live');
      return data;
    } catch (err) {
      // First failure while on the proxy: fall back to calling the indexer
      // directly from the browser (it serves permissive CORS, same as it
      // does for the official Cauldron DEX frontend).
      if (apiMode === 'proxy') {
        try {
          const data = await attempt('direct');
          apiMode = 'direct';
          setApiStatus('ok', 'Indexer live (direct)');
          return data;
        } catch (err2) {
          setApiStatus('error', 'Indexer unreachable');
          throw err2;
        }
      }
      setApiStatus('error', 'Indexer unreachable');
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Formatting helpers
  // -----------------------------------------------------------------------

  const SATS_PER_BCH = 100_000_000;

  function compact(n, opts = {}) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2, ...opts }).format(n);
  }

  function fmtBch(sats) {
  if (sats === null || sats === undefined || Number.isNaN(sats)) return '—';

  const bch = sats / SATS_PER_BCH;

  if (sats !== 0 && Math.abs(sats) < 1000) {
    const satsAbs = Math.abs(sats);
    const satsStr = Number.isInteger(satsAbs)
      ? satsAbs.toLocaleString()
      : satsAbs.toFixed(satsAbs < 10 ? 2 : 1);

    return (sats < 0 ? '-' : '') + '~' + satsStr + ' sats';
  }

  // Show exact BCH value instead of compact notation
  if (Math.abs(bch) >= 1000) {
    return bch.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' BCH';
  }

  return bch.toLocaleString('en-US', {
    maximumFractionDigits: bch < 1 ? 6 : 4
  }) + ' BCH';
         }
    if (Math.abs(bch) >= 1000) return compact(bch) + ' BCH';
    return bch.toLocaleString('en-US', { maximumFractionDigits: bch < 1 ? 6 : 4 }) + ' BCH';
  }

  function fmtUsd(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    if (v === 0) return '$0.00';
    const abs = Math.abs(v);
    if (abs >= 1000) return '$' + compact(v);
    if (abs < 0.01) return '$' + v.toExponential(2);
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }

  function fmtTokenAmount(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return compact(n);
  }

  /** Basis points (1bp = 0.01%) -> a signed, colored percent string. */
  function fmtPctBp(bp) {
    if (bp === null || bp === undefined) return { text: '—', cls: 'flat' };
    const pct = bp / 100;
    const cls = pct > 0.005 ? 'up' : pct < -0.005 ? 'down' : 'flat';
    const sign = pct > 0 ? '+' : '';
    return { text: `${sign}${pct.toFixed(2)}%`, cls };
  }

  function timeAgo(unixSeconds) {
    if (!unixSeconds) return '—';
    const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  /** Resolves an ipfs:// or bare-CID icon URI to an https gateway URL. */
  function resolveIcon(uris) {
    const icon = uris && uris.icon;
    if (!icon) return null;
    if (icon.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + icon.slice('ipfs://'.length);
    return icon;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function tokenDisplayName(t) {
    return (t.display_name && t.display_name.trim()) || (t.bcmr && t.bcmr.name) || t.token_id.slice(0, 12) + '…';
  }
  function tokenDisplaySymbol(t) {
    return (t.display_symbol && t.display_symbol.trim()) || (t.bcmr && t.bcmr.token && t.bcmr.token.symbol) || '';
  }
  function tokenDecimals(t) {
    return (t.bcmr && t.bcmr.token && t.bcmr.token.decimals) ?? 0;
  }
  function tokenIconHtml(t, size = 28) {
    const url = resolveIcon(t.bcmr && t.bcmr.uris);
    if (url) return `<img class="token-icon" width="${size}" height="${size}" src="${url}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'token-icon placeholder',textContent:'${escapeHtml(tokenDisplaySymbol(t).slice(0, 2) || '?')}',style:'width:${size}px;height:${size}px'}))">`;
    return `<span class="token-icon placeholder" style="width:${size}px;height:${size}px;display:inline-flex">${escapeHtml(tokenDisplaySymbol(t).slice(0, 2) || '?')}</span>`;
  }

  /**
   * TVL correction: the indexer's tvl_sats / global /valuelocked figures only
   * count the BCH side of each pool. A pool's token-side reserves represent
   * real economic value too, so correct TVL = BCH-side value + token-side
   * value. We convert the token side to a BCH-equivalent using the token's
   * own market price (price_now, sats-per-whole-token from list_cached) —
   * not the pool's own internal ratio — so an under- or over-priced pool
   * shows up as genuinely unbalanced rather than being forced to 2x.
   * Falls back to treating the pool as balanced only when price data is
   * missing entirely.
   */
  function tokenTvlBreakdown(t) {
  const bchSideSats = Number(t.tvl_sats) || 0;

  // Cauldron pools contain equal economic value on both sides.
  // The indexer's TVL currently represents only the BCH side.
  // Therefore, count both sides.
  const tokenSideSats = bchSideSats;

  return {
    bchSideSats,
    tokenSideSats,
    totalSats: bchSideSats + tokenSideSats
  };
}

  // -----------------------------------------------------------------------
  // Local state: token cache, watchlist, "seen before" set for new-pool badges
  // -----------------------------------------------------------------------

  const store = {
    tokens: [],
    tokensLoadedAt: 0,
    tokensById: new Map(),
  };

  const Watchlist = {
    key: 'cauldron-radar:watchlist',
    get() {
      try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; }
    },
    has(id) { return this.get().includes(id); },
    toggle(id) {
      const list = this.get();
      const idx = list.indexOf(id);
      if (idx >= 0) list.splice(idx, 1); else list.push(id);
      localStorage.setItem(this.key, JSON.stringify(list));
      return list.includes(id);
    },
  };

  const SeenTokens = {
    key: 'cauldron-radar:seen-token-ids',
    get() {
      try { return new Set(JSON.parse(localStorage.getItem(this.key) || '[]')); } catch { return new Set(); }
    },
    save(set) { localStorage.setItem(this.key, JSON.stringify([...set])); },
  };

  /** Loads (or reuses) the full cached token list, sorted by TVL desc. */
  async function loadTokens(force = false) {
    if (!force && store.tokens.length && Date.now() - store.tokensLoadedAt < 30_000) {
      return store.tokens;
    }
    const data = await cauldron('tokens/list_cached', { limit: 1000, by: 'tvl', order: 'desc' });
    store.tokens = Array.isArray(data) ? data : [];
    store.tokensLoadedAt = Date.now();
    store.tokensById = new Map(store.tokens.map((t) => [t.token_id, t]));
    return store.tokens;
  }

  // -----------------------------------------------------------------------
  // Router
  // -----------------------------------------------------------------------

  const appEl = document.getElementById('app');
  const routes = {
    dashboard: renderDashboard,
    tokens: renderTokensExplorer,
    pools: renderPools,
    activity: renderActivity,
    watchlist: renderWatchlist,
  };

  function currentRoute() {
    const hash = location.hash.replace(/^#\/?/, '');
    return hash || 'dashboard';
  }

  function highlightNav() {
    const route = currentRoute().split('/')[0];
    document.querySelectorAll('[data-route]').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === route);
    });
  }

  async function router() {
    highlightNav();
    document.getElementById('mobileNav').classList.remove('open');
    const hash = currentRoute();
    const [seg, arg] = hash.split('/');
    appEl.scrollIntoView({ block: 'start', behavior: 'instant' in window ? 'instant' : 'auto' });
    window.scrollTo(0, 0);

    try {
      if (seg === 'token' && arg) {
        await renderTokenDetail(decodeURIComponent(arg));
      } else if (routes[seg]) {
        await routes[seg]();
      } else {
        await renderDashboard();
      }
    } catch (err) {
      console.error(err);
      appEl.innerHTML = errorPanel('Something went wrong loading this view.', err);
    }
  }

  window.addEventListener('hashchange', router);
  document.getElementById('mobileNavToggle').addEventListener('click', () => {
    document.getElementById('mobileNav').classList.toggle('open');
  });

  function errorPanel(message, err) {
    return `
      <div class="state-panel error">
        <h3>Couldn't load this data</h3>
        <p>${escapeHtml(message)}${err ? ' — ' + escapeHtml(err.message || String(err)) : ''}</p>
        <button class="btn" onclick="location.reload()">Reload</button>
      </div>`;
  }

  function loadingPanel(msg = 'Loading live data from the Cauldron indexer…') {
    return `<div class="boot-loader"><div class="boot-spinner"></div><p>${escapeHtml(msg)}</p></div>`;
  }

  // -----------------------------------------------------------------------
  // View: Dashboard Overview
  // -----------------------------------------------------------------------

  async function renderDashboard(silent = false) {
    if (!silent) appEl.innerHTML = loadingPanel();

    const [tokens, contractCount, volume24h, latestTx] = await Promise.all([
      loadTokens(),
      cauldron('contract/count').catch(() => null),
      cauldron('volume').catch(() => null),
      cauldron('tx/latest', { limit: 8 }).catch(() => []),
    ]);

    const totalTokens = tokens.length >= 1000 ? '1000+' : tokens.length.toLocaleString();
    const activePools = contractCount ? contractCount.active.toLocaleString() : '—';
    const allTimePools = contractCount ? (contractCount.active + contractCount.ended).toLocaleString() : '';
    // Corrected TVL: sum BCH-side + token-side value across every tracked
    // token (see tokenTvlBreakdown) rather than relying on /valuelocked,
    // which only ever reported the BCH side.
    const globalTvlSats = tokens.reduce((sum, t) => sum + tokenTvlBreakdown(t).totalSats, 0);
    const tvl = fmtBch(globalTvlSats);
    const vol = volume24h ? fmtBch(volume24h.total_volume_sats) : '—';

    const trending = [...tokens]
      .filter((t) => t.trade_volume > 0 || Math.abs(t.change_24h_usd_bp || 0) > 0)
      .sort((a, b) => Math.abs(b.change_24h_usd_bp || 0) - Math.abs(a.change_24h_usd_bp || 0))
      .slice(0, 6);

    const mostActive = [...tokens].sort((a, b) => (b.trade_volume || 0) - (a.trade_volume || 0)).slice(0, 6);

    appEl.innerHTML = `
      <section class="hero">
        <div class="radar-sweep"><div class="sweep-arm"></div></div>
        <div class="hero-eyebrow">⚗ Live · Bitcoin Cash CashToken DeFi</div>
        <h1>Cauldron Radar tracks every CashToken pool on Bitcoin Cash.</h1>
        <p class="lede">Real-time prices, liquidity and trades from the Cauldron protocol indexer — no custody, no accounts, just the chain.</p>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">Tokens tracked</div><div class="stat-value">${totalTokens}</div><div class="stat-sub">via /tokens/list_cached</div></div>
          <div class="stat-card"><div class="stat-label">Active liquidity pools</div><div class="stat-value">${activePools}</div><div class="stat-sub">${allTimePools ? allTimePools + ' all-time' : ''}</div></div>
          <div class="stat-card"><div class="stat-label">Total value locked</div><div class="stat-value">${tvl}</div><div class="stat-sub">BCH-side + token-side, combined</div></div>
          <div class="stat-card"><div class="stat-label">24h trading volume</div><div class="stat-value">${vol}</div><div class="stat-sub">all tokens, rolling 24h</div></div>
        </div>
      </section>

      <div class="two-col">
        <div class="section">
          <div class="section-head"><h2>Trending tokens</h2><a class="see-all" href="#/tokens">See all →</a></div>
          <div class="card token-mini-list">${trending.map((t, i) => trendingRow(t, i)).join('') || emptyRow()}</div>
        </div>
        <div class="section">
          <div class="section-head"><h2>Most active by volume</h2><a class="see-all" href="#/tokens">See all →</a></div>
          <div class="card token-mini-list">${mostActive.map((t, i) => activeRow(t, i)).join('') || emptyRow()}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Latest on-chain swaps</h2><a class="see-all" href="#/activity">Full feed →</a></div>
        <div class="card activity-list">${(latestTx || []).slice(0, 8).map(activityRow).join('') || emptyRow()}</div>
      </div>
    `;

    bindTokenLinks();
  }

  function emptyRow() {
    return `<div class="token-mini-row"><span class="token-mini-name"><span class="tn" style="color:var(--text-faint)">No data available right now.</span></span></div>`;
  }

  function trendingRow(t, i) {
    const pct = fmtPctBp(t.change_24h_usd_bp);
    return `
      <div class="token-mini-row">
        <span class="token-mini-rank">${i + 1}</span>
        <a class="token-link" data-token-link="${escapeHtml(t.token_id)}" href="#/token/${encodeURIComponent(t.token_id)}" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
          ${tokenIconHtml(t, 26)}
          <span class="token-mini-name"><span class="tn">${escapeHtml(tokenDisplayName(t))}</span><span class="ts">${escapeHtml(tokenDisplaySymbol(t))}</span></span>
        </a>
        <span class="pct ${pct.cls}">${pct.text}</span>
      </div>`;
  }

  function activeRow(t) {
    return `
      <div class="token-mini-row">
        <a class="token-link" data-token-link="${escapeHtml(t.token_id)}" href="#/token/${encodeURIComponent(t.token_id)}" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
          ${tokenIconHtml(t, 26)}
          <span class="token-mini-name"><span class="tn">${escapeHtml(tokenDisplayName(t))}</span><span class="ts">${escapeHtml(tokenDisplaySymbol(t))}</span></span>
        </a>
        <span class="mono" style="font-size:12.5px;color:var(--text-dim)">${fmtBch(t.trade_volume)}</span>
      </div>`;
  }

  function activityRow(tx) {
    const confirmed = !!tx.blockhash;
    const explorerUrl = `https://bchexplorer.cash/tx/${tx.txid}`;
    return `
      <div class="activity-item ${confirmed ? 'confirmed' : 'pending'}">
        <span class="activity-dot" title="${confirmed ? 'Confirmed' : 'Unconfirmed'}"></span>
        <span class="activity-txid" title="${escapeHtml(tx.txid)}">${escapeHtml(tx.txid)}</span>
        <span class="activity-time">${timeAgo(tx.timestamp_guess)}</span>
        <a class="activity-link" href="${explorerUrl}" target="_blank" rel="noopener">view ↗</a>
      </div>`;
  }

  // -----------------------------------------------------------------------
  // View: Token Explorer
  // -----------------------------------------------------------------------

  const explorerState = { q: '', sortBy: 'tvl', order: 'desc', page: 1, pageSize: 25 };

  async function renderTokensExplorer(silent = false) {
    if (!silent) appEl.innerHTML = loadingPanel();
    const tokens = await loadTokens();

    const seen = SeenTokens.get();
    const isNew = (id) => seen.size > 0 && !seen.has(id);

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Token Explorer</div>
          <div class="view-subtitle">${tokens.length.toLocaleString()} CashTokens with an active or historical Cauldron pool.</div>
        </div>
        <button class="btn ghost small" id="exportCsvBtn">⬇ Export CSV</button>
      </div>

      <div class="explorer-toolbar">
        <div class="search-box">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input id="tokenSearch" type="search" placeholder="Search by name, symbol or token ID…" value="${escapeHtml(explorerState.q)}">
        </div>
        <select id="sortSelect" class="sort-select">
          <option value="tvl">Sort: TVL</option>
          <option value="volume">Sort: Volume</option>
          <option value="score">Sort: Score</option>
          <option value="name">Sort: Name</option>
          <option value="symbol">Sort: Symbol</option>
        </select>
        <button class="btn ghost small" id="orderToggle">↓ Desc</button>
      </div>

      <div class="table-wrap">
        <table class="token-table">
          <thead><tr>
            <th>#</th><th>Token</th><th>Price</th><th>24h</th><th>TVL</th><th>Volume</th><th></th>
          </tr></thead>
          <tbody id="tokenTableBody"></tbody>
        </table>
      </div>
      <div class="pagination" id="pagination"></div>
    `;

    document.getElementById('sortSelect').value = explorerState.sortBy;
    document.getElementById('tokenSearch').addEventListener('input', (e) => {
      explorerState.q = e.target.value;
      explorerState.page = 1;
      paintExplorerTable(tokens, isNew);
    });
    document.getElementById('sortSelect').addEventListener('change', (e) => {
      explorerState.sortBy = e.target.value;
      paintExplorerTable(tokens, isNew);
    });
    document.getElementById('orderToggle').addEventListener('click', (e) => {
      explorerState.order = explorerState.order === 'desc' ? 'asc' : 'desc';
      e.target.textContent = explorerState.order === 'desc' ? '↓ Desc' : '↑ Asc';
      paintExplorerTable(tokens, isNew);
    });
    document.getElementById('exportCsvBtn').addEventListener('click', () => exportTokensCsv(getFilteredSorted(tokens)));

    paintExplorerTable(tokens, isNew);

    // Mark all currently-known tokens as "seen" for future new-pool detection,
    // but only after this render so the badges had a chance to show.
    SeenTokens.save(new Set(tokens.map((t) => t.token_id)));
  }

  function getFilteredSorted(tokens) {
    const q = explorerState.q.trim().toLowerCase();
    let list = tokens;
    if (q) {
      list = list.filter(
        (t) =>
          tokenDisplayName(t).toLowerCase().includes(q) ||
          tokenDisplaySymbol(t).toLowerCase().includes(q) ||
          t.token_id.toLowerCase().includes(q)
      );
    }
    const dir = explorerState.order === 'desc' ? -1 : 1;
    const keyFn = {
      tvl: (t) => t.tvl_sats || 0,
      volume: (t) => t.trade_volume || 0,
      score: (t) => t.score || 0,
      name: (t) => tokenDisplayName(t).toLowerCase(),
      symbol: (t) => tokenDisplaySymbol(t).toLowerCase(),
    }[explorerState.sortBy];
    list = [...list].sort((a, b) => {
      const av = keyFn(a), bv = keyFn(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return list;
  }

  function paintExplorerTable(tokens, isNew) {
    const filtered = getFilteredSorted(tokens);
    const totalPages = Math.max(1, Math.ceil(filtered.length / explorerState.pageSize));
    explorerState.page = Math.min(explorerState.page, totalPages);
    const start = (explorerState.page - 1) * explorerState.pageSize;
    const pageItems = filtered.slice(start, start + explorerState.pageSize);

    const body = document.getElementById('tokenTableBody');
    body.innerHTML = pageItems
      .map((t, i) => {
        const pct = fmtPctBp(t.change_24h_usd_bp);
        const watching = Watchlist.has(t.token_id);
        return `
        <tr>
          <td class="mono" style="color:var(--text-faint)">${start + i + 1}</td>
          <td>
            <a class="token-link" href="#/token/${encodeURIComponent(t.token_id)}">
              ${tokenIconHtml(t, 28)}
              <span class="token-names">
                <span class="token-name">${escapeHtml(tokenDisplayName(t))} ${isNew(t.token_id) ? '<span class="badge new">New</span>' : ''}</span>
                <span class="token-symbol">${escapeHtml(tokenDisplaySymbol(t))}</span>
              </span>
            </a>
          </td>
          <td class="mono">${t.price_now_usd != null ? fmtUsd(t.price_now_usd) : fmtBch(t.price_now)}</td>
          <td class="mono"><span class="pct ${pct.cls}">${pct.text}</span></td>
          <td class="mono">${fmtBch(tokenTvlBreakdown(t).totalSats)}</td>
          <td class="mono">${fmtBch(t.trade_volume)}</td>
          <td><button class="watch-btn ${watching ? 'active' : ''}" data-watch="${escapeHtml(t.token_id)}" title="Toggle watchlist">${watching ? '★' : '☆'}</button></td>
        </tr>`;
      })
      .join('') || `<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:32px">No tokens match "${escapeHtml(explorerState.q)}".</td></tr>`;

    body.querySelectorAll('[data-watch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nowWatching = Watchlist.toggle(btn.dataset.watch);
        btn.classList.toggle('active', nowWatching);
        btn.textContent = nowWatching ? '★' : '☆';
      });
    });

    document.getElementById('pagination').innerHTML = paginationHtml(explorerState.page, totalPages);
    document.querySelectorAll('#pagination [data-page]').forEach((b) =>
      b.addEventListener('click', () => {
        explorerState.page = Number(b.dataset.page);
        paintExplorerTable(tokens, isNew);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
    );
  }

  function paginationHtml(page, totalPages) {
    if (totalPages <= 1) return '';
    const btn = (p, label = p, disabled = false, active = false) =>
      `<button class="btn ghost small" ${active ? 'style="color:var(--accent);border-color:rgba(10,193,142,.4)"' : ''} ${disabled ? 'disabled' : ''} data-page="${p}">${label}</button>`;
    let html = btn(Math.max(1, page - 1), '← Prev', page === 1);
    html += `<span class="mono" style="align-self:center;color:var(--text-dim);font-size:12.5px">Page ${page} / ${totalPages}</span>`;
    html += btn(Math.min(totalPages, page + 1), 'Next →', page === totalPages);
    return html;
  }

  function exportTokensCsv(tokens) {
    const headers = ['token_id', 'name', 'symbol', 'decimals', 'price_bch', 'price_usd', 'change_24h_pct', 'tvl_bch_side_sats', 'tvl_token_side_sats_equiv', 'tvl_total_sats', 'trade_volume_sats', 'score', 'score_rank'];
    const rows = tokens.map((t) => {
      const tvl = tokenTvlBreakdown(t);
      return [
        t.token_id,
        csvSafe(tokenDisplayName(t)),
        csvSafe(tokenDisplaySymbol(t)),
        tokenDecimals(t),
        t.price_now ?? '',
        t.price_now_usd ?? '',
        t.change_24h_usd_bp !== undefined ? (t.change_24h_usd_bp / 100).toFixed(2) : '',
        tvl.bchSideSats,
        Math.round(tvl.tokenSideSats),
        Math.round(tvl.totalSats),
        t.trade_volume ?? '',
        t.score ?? '',
        t.score_rank ?? '',
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cauldron-radar-tokens-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function csvSafe(s) {
    const str = String(s ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  // -----------------------------------------------------------------------
  // View: Token Detail
  // -----------------------------------------------------------------------

  let priceChart = null;

  async function renderTokenDetail(tokenId) {
    appEl.innerHTML = loadingPanel('Reading pools and price history for this token…');
    const tokens = await loadTokens();
    let token = store.tokensById.get(tokenId);

    if (!token) {
      // Not in the cached list (e.g. deep link) — fetch it directly.
      const byId = await cauldron('tokens/list_cached_by_ids', { ids: tokenId }).catch(() => []);
      token = Array.isArray(byId) ? byId[0] : null;
    }
    if (!token) {
      appEl.innerHTML = errorPanel('This token ID was not found in the Cauldron indexer.');
      return;
    }

    const decimals = tokenDecimals(token);
    const iconUrl = resolveIcon(token.bcmr && token.bcmr.uris);
    const webUrl = token.bcmr && token.bcmr.uris && token.bcmr.uris.web;
    const description = token.bcmr && token.bcmr.description;

    const [poolsRes, firstPool, volume] = await Promise.all([
      cauldron('pool/active', { token: tokenId }).catch(() => null),
      cauldron(`token/${tokenId}/first_pool`).catch(() => null),
      cauldron(`volume/${tokenId}`).catch(() => null),
    ]);
    const pools = (poolsRes && poolsRes.active) || [];

    const pct24 = fmtPctBp(token.change_24h_usd_bp);
    const pct7 = fmtPctBp(token.change_7d_usd_bp);
    const watching = Watchlist.has(tokenId);
    const tvlBreak = tokenTvlBreakdown(token);
    // Best-effort entry point into the Cauldron trading app. We can't confirm
    // a per-token deep-link route from the indexer docs, so rather than
    // invent a URL that might 404, we link to the token list on the live
    // trading app and let the person search — a link that's always valid
    // beats a guessed one that might be dead.
    const cauldronTradeUrl = 'https://app.cauldron.quest/tokens';

    appEl.innerHTML = `
      <a href="#/tokens" class="btn ghost small" style="margin-bottom:18px;display:inline-flex">← Back to explorer</a>

      <div class="detail-header">
        ${iconUrl ? `<img class="detail-icon" src="${iconUrl}" alt="">` : `<span class="detail-icon token-icon placeholder" style="display:flex;align-items:center;justify-content:center;font-size:20px">${escapeHtml(tokenDisplaySymbol(token).slice(0, 2) || '?')}</span>`}
        <div class="detail-title">
          <h1>${escapeHtml(tokenDisplayName(token))}</h1>
          <span class="sym">${escapeHtml(tokenDisplaySymbol(token))} · ${decimals} decimals ${token.score_rank ? `· Rank #${token.score_rank}` : ''}</span>
        </div>
        <div class="detail-price">
          ${token.price_now_usd != null ? fmtUsd(token.price_now_usd) : fmtBch(token.price_now)}
          <div><span class="pct ${pct24.cls}" style="font-size:13px">${pct24.text} · 24h</span></div>
        </div>
        <div class="detail-actions">
          <button class="btn ${watching ? '' : 'ghost'} small" id="watchToggleBtn">${watching ? '★ Watching' : '☆ Watch'}</button>
          <a class="btn small" href="${cauldronTradeUrl}" target="_blank" rel="noopener" title="Opens the Cauldron trading app — search for this token there">⚗ Trade on Cauldron ↗</a>
          ${webUrl && webUrl !== 'null' ? `<a class="btn ghost small" href="${escapeHtml(webUrl)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
        </div>
      </div>

      <div class="token-id-row">
        <span style="flex:1">${escapeHtml(tokenId)}</span>
        <button data-copy="${escapeHtml(tokenId)}">Copy</button>
      </div>

      <div class="metric-row">
        <div class="metric-card"><div class="k">Price (BCH)</div><div class="v">${fmtBch(token.price_now)}</div></div>
        <div class="metric-card"><div class="k">7d change</div><div class="v"><span class="pct ${pct7.cls}">${pct7.text}</span></div></div>
        <div class="metric-card">
          <div class="k">Value locked</div>
          <div class="v">${fmtBch(tvlBreak.totalSats)}</div>
          <div class="metric-sub">${fmtBch(tvlBreak.bchSideSats)} BCH + ${fmtBch(tvlBreak.tokenSideSats)} token-equiv</div>
        </div>
        <div class="metric-card"><div class="k">24h volume</div><div class="v">${volume ? fmtBch(volume.volume_sats) : '—'}</div></div>
        <div class="metric-card"><div class="k">Active pools</div><div class="v">${pools.length}</div></div>
        <div class="metric-card"><div class="k">Tokens in pools</div><div class="v">${fmtTokenAmount(token.tvl_tokens / 10 ** decimals)}</div></div>
      </div>

      <div class="nav-strip">
        <a href="#/tokens" class="nav-chip">🔎 Token Explorer</a>
        <a href="#/pools" class="nav-chip">💧 Pool Explorer</a>
        <a href="#/activity" class="nav-chip">📡 Activity Feed</a>
        ${webUrl && webUrl !== 'null' ? `<a href="${escapeHtml(webUrl)}" target="_blank" rel="noopener" class="nav-chip">🌐 Project site</a>` : ''}
        <a href="${cauldronTradeUrl}" target="_blank" rel="noopener" class="nav-chip">⚗ Trade on Cauldron</a>
      </div>

      <div class="card chart-card">
        <div class="chart-range-toggle" id="rangeToggle">
          <button data-range="7" class="active">7d</button>
          <button data-range="30">30d</button>
          <button data-range="90">90d</button>
        </div>
        <div class="chart-canvas-wrap"><canvas id="priceChartCanvas"></canvas></div>
      </div>

      <div class="two-col">
        <div class="card desc-card">
          <h3>About this token</h3>
          ${description ? `<p>${escapeHtml(description).slice(0, 900)}${description.length > 900 ? '…' : ''}</p>` : '<p style="color:var(--text-faint)">No on-chain BCMR metadata description was published for this token.</p>'}
          ${firstPool ? `<p style="margin-top:10px" class="mono" style="font-size:12px">First pool created ${timeAgo(firstPool.timestamp)} (${firstPool.block_height ? 'block ' + firstPool.block_height : 'block unavailable'}).</p>` : ''}
        </div>
        <div class="card">
          <div class="section-head" style="padding:16px 16px 0"><h2>Active liquidity pools</h2></div>
          <div id="poolList">${pools.length ? pools.slice(0, 12).map((p) => poolListItem(p, decimals, token)).join('') : '<p style="padding:16px;color:var(--text-faint)">No active Cauldron pools for this token right now.</p>'}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Recent pool activity</h2></div>
        <div class="card" id="recentSwaps">${loadingPanel('Reading pool history…')}</div>
      </div>
    `;

    document.getElementById('watchToggleBtn').addEventListener('click', (e) => {
      const now = Watchlist.toggle(tokenId);
      e.target.textContent = now ? '★ Watching' : '☆ Watch';
      e.target.classList.toggle('ghost', !now);
    });
    document.querySelector('[data-copy]').addEventListener('click', (e) => {
      navigator.clipboard?.writeText(e.target.dataset.copy);
      e.target.textContent = 'Copied!';
      setTimeout(() => (e.target.textContent = 'Copy'), 1200);
    });

    document.getElementById('rangeToggle').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-range]');
      if (!btn) return;
      document.querySelectorAll('#rangeToggle button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadPriceChart(tokenId, decimals, Number(btn.dataset.range));
    });

    loadPriceChart(tokenId, decimals, 7);
    loadRecentSwaps(tokenId, pools, decimals);
  }

  function poolListItem(p, decimals, token) {
    const bchAmount = p.sats / SATS_PER_BCH;
    const tokenAmount = p.tokens / 10 ** decimals;
    const priceInPool = p.tokens > 0 ? p.sats / p.tokens / 10 ** (8 - decimals) : 0; // sats per whole token
    return `
      <div class="pool-list-item">
        <span class="pool-owner">${p.owner_p2pkh_addr ? p.owner_p2pkh_addr.slice(0, 22) + '…' : p.owner_pkh}</span>
        <span class="amt">${bchAmount.toFixed(4)} BCH</span>
        <span style="color:var(--text-faint);font-size:11.5px">liquidity pool</span>
        <span class="amt mono" style="font-size:11.5px;color:var(--text-faint)">${fmtTokenAmount(tokenAmount)} ${escapeHtml(tokenDisplaySymbol(token))}</span>
      </div>`;
  }

  /**
   * Fetches /price/<token>/candlesticks and draws a line chart. Per the API
   * docs, raw price values from this family of endpoints are denominated
   * per the *smallest unit* of the token, so we scale by 10^decimals to get
   * a price-per-whole-token figure comparable to what's shown elsewhere.
   */
  async function loadPriceChart(tokenId, decimals, days) {
    const wrap = document.getElementById('priceChartCanvas').parentElement;
    wrap.innerHTML = loadingPanel('Fetching candlesticks…').replace('padding: 120px 0;', '');
    const now = Math.floor(Date.now() / 1000);
    const start = now - days * 86400;
    const stepsize = days <= 7 ? 3600 : days <= 30 ? 4 * 3600 : 12 * 3600;

    let candles = [];
    try {
      const data = await cauldron(`price/${tokenId}/candlesticks`, { start, end: now, stepsize });
      candles = (data && data.candlesticks) || [];
    } catch {
      candles = [];
    }

    if (!candles.length) {
      wrap.innerHTML = `<div class="state-panel" style="padding:40px 20px"><h3>No trade history in this window</h3><p>This token had no recorded Cauldron trades in the selected range — try a wider range or check back after more activity.</p></div>`;
      return;
    }

    if (typeof Chart === 'undefined') {
      // The chart library didn't load (e.g. the CDN was briefly unreachable).
      // Don't leave a blank canvas — say so and let the person retry.
      wrap.innerHTML = `<div class="state-panel error" style="padding:40px 20px"><h3>Chart library didn't load</h3><p>The price data is fine, but the charting library failed to load from its CDN. <button class="btn small" onclick="location.reload()">Reload the page</button></p></div>`;
      return;
    }

    wrap.innerHTML = '<canvas id="priceChartCanvas"></canvas>';
    const ctx = document.getElementById('priceChartCanvas').getContext('2d');

    if (priceChart) { priceChart.destroy(); priceChart = null; }

    const scale = 10 ** decimals;
    const labels = candles.map((c) => new Date(c.time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    const closes = candles.map((c) => c.close * scale);

    priceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Price (sats)',
          data: closes,
          borderColor: '#0ac18e',
          backgroundColor: 'rgba(10,193,142,0.08)',
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8fa89b', maxTicksLimit: 8, font: { family: 'JetBrains Mono', size: 10.5 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8fa89b', font: { family: 'JetBrains Mono', size: 10.5 }, callback: (v) => compact(v) } },
        },
      },
    });
  }

  /**
   * Best-effort "recent transactions" for a token. The indexer has no single
   * endpoint that returns swap-level detail (amount, direction) — /tx/latest
   * only exposes txid/blockhash/timestamp. To show real swap sizes we derive
   * a pool_id for this token's active pools (via /pool/id_from_utxo) and
   * read each pool's state-change history (via /pool/history), which *does*
   * carry real sats/tokens amounts. Both of those endpoints are marked
   * "Unstable" in the API docs, so we degrade gracefully to a simple
   * "no detailed history available" message if they don't cooperate.
   */
  async function loadRecentSwaps(tokenId, pools, decimals) {
    const container = document.getElementById('recentSwaps');
    if (!pools.length) {
      container.innerHTML = `<p style="padding:16px;color:var(--text-faint)">No active pools to read history from.</p>`;
      return;
    }
    const topPools = [...pools].sort((a, b) => b.sats - a.sats).slice(0, 3);

    try {
      const poolIds = await Promise.all(
        topPools.map((p) => cauldron('pool/id_from_utxo', { txid: p.txid, n: p.tx_pos }).catch(() => null))
      );
      const histories = await Promise.all(
        poolIds.map((pid) => (pid && pid.pool_id ? cauldron(`pool/history/${pid.pool_id}`).catch(() => null) : null))
      );

      const events = histories
        .flatMap((h) => (h && h.history) || [])
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 15);

      if (!events.length) {
        container.innerHTML = `<p style="padding:16px;color:var(--text-faint)">No recent pool state changes recorded for this token's top pools yet.</p>`;
        return;
      }

      container.innerHTML =
        `<div class="activity-note">Derived from real pool state-change history (sats/tokens re-balanced per trade) — the indexer's tx feed alone doesn't expose swap amounts.</div>` +
        events
          .map(
            (ev) => `
        <div class="activity-item confirmed">
          <span class="activity-dot"></span>
          <span class="activity-txid">${(ev.sats / SATS_PER_BCH).toFixed(4)} BCH ⇄ ${fmtTokenAmount(ev.tokens / 10 ** decimals)} tokens in pool</span>
          <span class="activity-time">${timeAgo(ev.timestamp)}</span>
          <a class="activity-link" href="https://bchexplorer.cash/tx/${ev.txid}" target="_blank" rel="noopener">tx ↗</a>
        </div>`
          )
          .join('');
    } catch {
      container.innerHTML = `<p style="padding:16px;color:var(--text-faint)">Detailed pool history is temporarily unavailable.</p>`;
    }
  }

  // -----------------------------------------------------------------------
  // View: Pools
  // -----------------------------------------------------------------------

  const poolsState = { tab: 'liquidity' };

  async function renderPools(silent = false) {
    if (!silent) appEl.innerHTML = loadingPanel('Aggregating active pools across top tokens…');
    const tokens = await loadTokens();
    const topTokens = tokens.slice(0, 40); // see note below re: no bulk pool-list endpoint

    const results = await Promise.all(
      topTokens.map((t) =>
        cauldron('pool/active', { token: t.token_id })
          .then((r) => ((r && r.active) || []).map((p) => ({ ...p, _token: t })))
          .catch(() => [])
      )
    );
    const allPools = results.flat();

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Liquidity Pool Explorer</div>
          <div class="view-subtitle">${allPools.length.toLocaleString()} active Cauldron micro-pools across the top ${topTokens.length} tokens by TVL.</div>
        </div>
      </div>
      <div class="activity-note">The indexer doesn't expose a single "list every pool" endpoint — pools are aggregated per-token from <span class="mono">/pool/active</span> for the top tokens by TVL, so very long-tail tokens' pools may not appear here.</div>
      <div class="pool-tabs">
        <button data-tab="liquidity" class="${poolsState.tab === 'liquidity' ? 'active' : ''}">Highest liquidity</button>
        <button data-tab="newest" class="${poolsState.tab === 'newest' ? 'active' : ''}">By token volume</button>
      </div>
      <div class="pool-grid" id="poolGrid"></div>
    `;

    document.querySelectorAll('.pool-tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        poolsState.tab = b.dataset.tab;
        document.querySelectorAll('.pool-tabs button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        paintPools(allPools);
      })
    );
    paintPools(allPools);
  }

  /** A pool's TVL, same BCH-side + token-side methodology as tokenTvlBreakdown,
   * but valued using this specific pool's own reserves rather than the
   * token's aggregate totals. */
  function poolTvlSats(p, token) {
    const decimals = tokenDecimals(token);
    const bchSideSats = p.sats || 0;
    const tokenSideSats = token.price_now != null ? (p.tokens / 10 ** decimals) * token.price_now : bchSideSats;
    return bchSideSats + tokenSideSats;
  }

  function paintPools(allPools) {
    let sorted;
    if (poolsState.tab === 'liquidity') {
      sorted = [...allPools].sort((a, b) => poolTvlSats(b, b._token) - poolTvlSats(a, a._token));
    } else {
      sorted = [...allPools].sort((a, b) => (b._token.trade_volume || 0) - (a._token.trade_volume || 0));
    }
    const grid = document.getElementById('poolGrid');
    grid.innerHTML = sorted
      .slice(0, 60)
      .map((p) => {
        const t = p._token;
        const decimals = tokenDecimals(t);
        const tvlSats = poolTvlSats(p, t);
        return `
        <div class="card pool-card">
          <div class="pool-pair">${tokenIconHtml(t, 22)} ${escapeHtml(tokenDisplaySymbol(t) || tokenDisplayName(t))} / BCH</div>
          <div class="pool-meta"><span>Pool TVL</span><span>${fmtBch(tvlSats)}</span></div>
          <div class="pool-meta"><span>BCH side</span><span>${(p.sats / SATS_PER_BCH).toFixed(4)} BCH</span></div>
          <div class="pool-meta"><span>Token side</span><span>${fmtTokenAmount(p.tokens / 10 ** decimals)}</span></div>
          <div class="pool-meta"><span>Token 24h volume</span><span>${fmtBch(t.trade_volume)}</span></div>
          <div class="pool-owner">Owner: ${p.owner_p2pkh_addr || p.owner_pkh}</div>
          <a class="btn ghost small" href="#/token/${encodeURIComponent(t.token_id)}" style="align-self:flex-start">View token →</a>
        </div>`;
      })
      .join('') || `<div class="state-panel">No pools found.</div>`;
  }

  // -----------------------------------------------------------------------
  // View: Activity feed
  // -----------------------------------------------------------------------

  async function renderActivity(silent = false) {
    if (!silent) appEl.innerHTML = loadingPanel('Reading the latest Cauldron transactions…');
    const txs = await cauldron('tx/latest', { limit: 100 }).catch(() => []);

    appEl.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">Live Activity Feed</div>
          <div class="view-subtitle">The most recent transactions touching a Cauldron contract, newest first.</div>
        </div>
        <button class="btn ghost small" id="activityRefresh">↻ Refresh</button>
      </div>
      <div class="activity-note">
        The indexer's transaction feed exposes the tx hash, confirmation status and an estimated time — not swap direction or amount.
        For per-token swap sizes, open a token's page and see "Recent pool activity", which is derived from real pool balance history.
      </div>
      <div class="card activity-list" id="activityList">${txs.map(activityRow).join('') || '<p style="padding:16px;color:var(--text-faint)">No recent transactions.</p>'}</div>
    `;
    document.getElementById('activityRefresh').addEventListener('click', renderActivity);
  }

  // -----------------------------------------------------------------------
  // View: Watchlist
  // -----------------------------------------------------------------------

  async function renderWatchlist(silent = false) {
    const ids = Watchlist.get();
    if (!ids.length) {
      if (silent) return; // nothing to refresh
      appEl.innerHTML = `
        <div class="view-header"><div class="view-title">Watchlist</div></div>
        <div class="empty-watchlist card">
          <div class="glyph">☆</div>
          <h3 style="color:var(--text);font-weight:600">Nothing pinned yet</h3>
          <p>Tap the star on any token in the <a href="#/tokens" style="color:var(--accent)">Explorer</a> to track it here. Saved locally in your browser — nothing is sent anywhere.</p>
        </div>`;
      return;
    }
    if (!silent) appEl.innerHTML = loadingPanel();
    const data = await cauldron('tokens/list_cached_by_ids', { ids: ids.join(',') }).catch(() => []);
    const tokens = Array.isArray(data) ? data : [];

    appEl.innerHTML = `
      <div class="view-header">
        <div><div class="view-title">Watchlist</div><div class="view-subtitle">${tokens.length} token${tokens.length === 1 ? '' : 's'} pinned in this browser.</div></div>
        <button class="btn ghost small" id="exportWatchCsv">⬇ Export CSV</button>
      </div>
      <div class="table-wrap">
        <table class="token-table">
          <thead><tr><th>#</th><th>Token</th><th>Price</th><th>24h</th><th>TVL</th><th>Volume</th><th></th></tr></thead>
          <tbody>
            ${tokens
              .map(
                (t, i) => `
              <tr>
                <td class="mono" style="color:var(--text-faint)">${i + 1}</td>
                <td><a class="token-link" href="#/token/${encodeURIComponent(t.token_id)}">${tokenIconHtml(t, 28)}<span class="token-names"><span class="token-name">${escapeHtml(tokenDisplayName(t))}</span><span class="token-symbol">${escapeHtml(tokenDisplaySymbol(t))}</span></span></a></td>
                <td class="mono">${t.price_now_usd != null ? fmtUsd(t.price_now_usd) : fmtBch(t.price_now)}</td>
                <td class="mono"><span class="pct ${fmtPctBp(t.change_24h_usd_bp).cls}">${fmtPctBp(t.change_24h_usd_bp).text}</span></td>
                <td class="mono">${fmtBch(tokenTvlBreakdown(t).totalSats)}</td>
                <td class="mono">${fmtBch(t.trade_volume)}</td>
                <td><button class="watch-btn active" data-unwatch="${escapeHtml(t.token_id)}" title="Remove from watchlist">★</button></td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
    document.querySelectorAll('[data-unwatch]').forEach((btn) =>
      btn.addEventListener('click', () => { Watchlist.toggle(btn.dataset.unwatch); renderWatchlist(); })
    );
    document.getElementById('exportWatchCsv').addEventListener('click', () => exportTokensCsv(tokens));
  }

  // -----------------------------------------------------------------------
  // Global chrome: refresh button, auto-refresh, nav wiring
  // -----------------------------------------------------------------------

  function bindTokenLinks() {
    // no-op placeholder retained for symmetry / future hooks
  }

  /**
   * Re-renders whichever view is currently on screen. When silent=true this
   * never shows the full-page boot spinner — the view's own render function
   * fetches fresh data first and only swaps the DOM once it has it, so the
   * existing content stays visible the whole time (no blank flash, no
   * scroll jump). Token detail pages already refresh their chart/pool-history
   * sub-sections independently and aren't touched here.
   */
  async function refreshCurrentView(silent) {
    const route = currentRoute().split('/')[0];
    if (route === 'dashboard') return renderDashboard(silent);
    if (route === 'tokens') return renderTokensExplorer(silent);
    if (route === 'watchlist') return renderWatchlist(silent);
    if (route === 'pools') return renderPools(silent);
    if (route === 'activity') return renderActivity(silent);
    return null; // token detail / unknown routes: nothing to silently refresh
  }

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    try {
      await loadTokens(true);
      // Silent even on a manual click — the spin icon on the button is
      // feedback enough; the page itself shouldn't blank out or jump.
      await refreshCurrentView(true);
    } finally {
      btn.classList.remove('spinning');
    }
  });

  // Passive auto-refresh every 60s so numbers stay current without ever
  // showing the full-page spinner or blanking the view after first load.
  setInterval(() => {
    loadTokens(true).then(() => refreshCurrentView(true)).catch(() => {});
  }, 60_000);

  const donateBtn = document.getElementById('donateAddrBtn');
  if (donateBtn) {
    donateBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(donateBtn.dataset.copy);
      const original = donateBtn.textContent;
      donateBtn.textContent = 'Copied address ✓';
      setTimeout(() => (donateBtn.textContent = original), 1400);
    });
  }

  // Boot
  router();
})();
