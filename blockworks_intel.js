// ============================================================================
// FIBCRYPTO ORACLE × BLOCKWORKS — HYBRID INTELLIGENCE ENGINE (PHASE 1 - 3)
// Implements:
//  - Phase 1: Multi-Asset Live Grid, Persistent Watchlist, News Sidebar, Sentiment Badge
//  - Phase 2: Token Unlocks (90d), Mindshare & Sentiment 7d Canvas Chart, Onchain Panel,
//             Multi-Strategy Dynamic Backtesting Equity Curve
//  - Phase 3: DD-Score (Token Transparency), AI Signal Explainer, Custom Alert Builder,
//             MCP Server Client & Multi-Asset Side-by-Side Comparator
// ============================================================================

(function () {
    'use strict';

    const state = {
        currentAsset: 'BTCUSDT',
        newsFilter: 'all',
        newsItems: [],
        topAssets: [],
        watchlist: [],
        customAlerts: [],
        mindshareSeries: [],
        mindshareCurrent: null,
        unlocksData: null,
        onchainData: null,
        aiExplanation: null,
        showUnlocksOnChart: true,
        gridExpanded: false,
        watchlistExpanded: false,
        alertBuilderConditions: [
            { type: 'fib_level', operator: 'crosses_below', value: 0.618 },
            { type: 'sentiment', operator: 'gt', value: 0.30 }
        ],
        alertCombineWith: 'AND',
        alertChannels: ['push', 'telegram']
    };

    const STORAGE_WATCHLIST_KEY = 'fibcrypto_bw_watchlist_v2';
    const STORAGE_ALERTS_KEY = 'fibcrypto_bw_custom_alerts_v2';

    // Helper: Currency formatting via main app if available
    function fmtMoney(usdVal) {
        if (window.FibAppCurrency && typeof window.FibAppCurrency.formatMoney === 'function') {
            return window.FibAppCurrency.formatMoney(usdVal);
        }
        const n = parseFloat(usdVal) || 0;
        if (n >= 1000) return '$' + n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (n >= 1) return '$' + n.toFixed(2);
        return '$' + n.toFixed(4);
    }

    function cleanShort(sym) {
        const s = (sym || 'BTCUSDT').toUpperCase().trim();
        if (s.endsWith('.DE') || ['AAPL', 'MSFT', 'NVDA', 'TSLA'].includes(s)) return s;
        return s.replace(/USDT$/, '').replace(/-USDT$/, '');
    }

    function toFullSymbol(shortOrFull) {
        const s = (shortOrFull || 'BTC').toUpperCase().trim();
        if (s.endsWith('.DE') || ['AAPL', 'MSFT', 'NVDA', 'TSLA'].includes(s)) return s;
        if (s.endsWith('USDT')) return s;
        return s + 'USDT';
    }

    function relativeTime(isoStr) {
        if (!isoStr) return 'gerade eben';
        const diff = Date.now() - new Date(isoStr).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'gerade eben';
        if (m < 60) return `vor ${m}m`;
        const h = Math.floor(m / 60);
        if (h < 24) return `vor ${h}h`;
        return `vor ${Math.floor(h / 24)}d`;
    }

    // ------------------------------------------------------------------------
    // Initialization & Storage
    // ------------------------------------------------------------------------
    function loadPersistedState() {
        try {
            const rawWl = localStorage.getItem(STORAGE_WATCHLIST_KEY);
            if (rawWl) {
                state.watchlist = JSON.parse(rawWl);
            } else {
                state.watchlist = [
                    { symbol: 'BTCUSDT', shortSymbol: 'BTC', price: 84190, change24h: 0.69 },
                    { symbol: 'ETHUSDT', shortSymbol: 'ETH', price: 2240, change24h: 1.42 },
                    { symbol: 'SOLUSDT', shortSymbol: 'SOL', price: 158.4, change24h: 3.15 },
                    { symbol: 'INJUSDT', shortSymbol: 'INJ', price: 24.8, change24h: 4.10 }
                ];
                saveWatchlist();
            }
        } catch (e) {
            state.watchlist = [];
        }

        try {
            const rawAlerts = localStorage.getItem(STORAGE_ALERTS_KEY);
            if (rawAlerts) {
                state.customAlerts = JSON.parse(rawAlerts);
            } else {
                state.customAlerts = [
                    {
                        id: 'al-default-1',
                        name: 'Golden Pocket + Bullish Sentiment',
                        asset: 'BTC',
                        conditions: [
                            { type: 'fib_level', operator: 'crosses_below', value: 0.618 },
                            { type: 'sentiment', operator: 'gt', value: 0.3 }
                        ],
                        combineWith: 'AND',
                        channels: ['push', 'telegram'],
                        active: true,
                        createdAt: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                    }
                ];
                saveAlerts();
            }
        } catch (e) {
            state.customAlerts = [];
        }
    }

    function saveWatchlist() {
        try {
            localStorage.setItem(STORAGE_WATCHLIST_KEY, JSON.stringify(state.watchlist));
        } catch (e) {}
    }

    function saveAlerts() {
        try {
            localStorage.setItem(STORAGE_ALERTS_KEY, JSON.stringify(state.customAlerts));
        } catch (e) {}
    }

    // ------------------------------------------------------------------------
    // 1. Multi-Asset Top 16 Grid & Watchlist Refresh
    // ------------------------------------------------------------------------
    async function fetchTopAssets() {
        try {
            const resp = await fetch('/api/market/top-assets?limit=16');
            if (!resp.ok) return;
            const data = await resp.json();
            if (data && Array.isArray(data.assets)) {
                state.topAssets = data.assets;
                renderAssetGrid();
                syncWatchlistFromTopAssets();
            }
        } catch (e) {
            console.warn('[BlockworksIntel] Top assets fetch warn:', e);
        }
    }

    function syncWatchlistFromTopAssets() {
        if (!state.watchlist || state.watchlist.length === 0) return;
        const map = {};
        state.topAssets.forEach(a => {
            map[a.symbol] = a;
            map[a.shortSymbol] = a;
        });

        state.watchlist = state.watchlist.map(item => {
            const match = map[item.symbol] || map[item.shortSymbol];
            if (match) {
                return {
                    ...item,
                    price: match.price,
                    change24h: match.change24h,
                    fibSignal: match.fibSignal
                };
            }
            return item;
        });
        saveWatchlist();
        renderWatchlist();
    }

    function renderAssetGrid() {
        const container = document.getElementById('bwAssetGridContainer');
        if (!container) return;

        if (!state.topAssets || state.topAssets.length === 0) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 1rem; color: var(--text-faint);">Lade Multi-Asset Live-Matrix...</div>';
            return;
        }

        container.innerHTML = state.topAssets.map(a => {
            const isSelected = a.symbol === state.currentAsset || a.shortSymbol === cleanShort(state.currentAsset);
            const isPos = a.change24h >= 0;
            const changeSign = isPos ? '+' : '';
            const arrow = isPos ? '▲' : '▼';
            const changeClass = isPos ? 'bw-pos' : 'bw-neg';

            let sigBadge = '';
            if (a.fibSignal === 'BUY') {
                sigBadge = `<div class="bw-grid-sig bw-sig-buy">⚡ KAUF-Signal (${a.confidence}%)</div>`;
            } else if (a.fibSignal === 'SELL') {
                sigBadge = `<div class="bw-grid-sig bw-sig-sell">⚠️ VERKAUF-Zone (${a.confidence}%)</div>`;
            } else {
                sigBadge = `<div class="bw-grid-sig bw-sig-hold">● HOLD • ${a.fibLevel}</div>`;
            }

            return `
                <button type="button" class="bw-asset-card ${isSelected ? 'active' : ''}" data-symbol="${a.symbol}">
                    <div class="bw-asset-card-top">
                        <span class="bw-asset-sym">${a.shortSymbol}</span>
                        <span class="bw-asset-tag" style="background:${a.color}22; color:${a.color}; border:1px solid ${a.color}55;">
                            ${a.shortSymbol.slice(0, 3)}
                        </span>
                    </div>
                    <div class="bw-asset-name">${a.name}</div>
                    <div class="bw-asset-price">${fmtMoney(a.price)}</div>
                    <div class="bw-asset-change ${changeClass}">
                        <span>${arrow} ${changeSign}${a.change24h.toFixed(2)}%</span>
                    </div>
                    ${sigBadge}
                </button>
            `;
        }).join('');

        container.querySelectorAll('.bw-asset-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const sym = btn.getAttribute('data-symbol');
                if (sym && window.selectOracleAsset) {
                    window.selectOracleAsset(sym);
                }
            });
        });
    }

    function renderWatchlist() {
        const listEl = document.getElementById('bwWatchlistItems');
        const countEl = document.getElementById('bwWatchlistCount');
        const headerCountEl = document.getElementById('bwWatchlistBtnCount');

        if (countEl) countEl.textContent = `${state.watchlist.length} Assets`;
        if (headerCountEl) headerCountEl.textContent = state.watchlist.length;
        if (!listEl) return;

        if (state.watchlist.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; color:var(--text-faint); font-size:0.78rem; padding:1rem;">Noch keine Assets in der Watchlist. Fügen Sie oben z.B. SOL, BTC oder SAP.DE hinzu.</div>`;
            return;
        }

        listEl.innerHTML = state.watchlist.map(a => {
            const isPos = (a.change24h || 0) >= 0;
            const sign = isPos ? '+' : '';
            const changeClass = isPos ? 'bw-pos' : 'bw-neg';
            return `
                <div class="bw-watchlist-row" data-symbol="${a.symbol}">
                    <div class="bw-wl-left">
                        <span class="bw-wl-star">★</span>
                        <span class="bw-wl-sym">${a.shortSymbol || cleanShort(a.symbol)}</span>
                        ${a.fibSignal === 'BUY' ? '<span class="bw-wl-buy-dot" title="Kaufsignal aktiv">⚡ BUY</span>' : ''}
                    </div>
                    <div class="bw-wl-right">
                        <span class="bw-wl-price">${a.price ? fmtMoney(a.price) : 'Lädt...'}</span>
                        <span class="bw-wl-chg ${changeClass}">${sign}${(a.change24h || 0).toFixed(2)}%</span>
                        <button type="button" class="bw-wl-remove" data-remove="${a.symbol}" title="Aus Watchlist entfernen">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.bw-watchlist-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.classList.contains('bw-wl-remove')) return;
                const sym = row.getAttribute('data-symbol');
                if (sym && window.selectOracleAsset) {
                    window.selectOracleAsset(sym);
                }
            });
        });

        listEl.querySelectorAll('.bw-wl-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sym = btn.getAttribute('data-remove');
                state.watchlist = state.watchlist.filter(item => item.symbol !== sym);
                saveWatchlist();
                renderWatchlist();
            });
        });
    }

    async function addWatchlistSymbol(rawInput) {
        const clean = (rawInput || '').toUpperCase().trim();
        if (!clean) return;
        const fullSym = toFullSymbol(clean);
        const shortSym = cleanShort(fullSym);

        if (state.watchlist.some(a => a.symbol === fullSym || a.shortSymbol === shortSym)) {
            return;
        }

        const newEntry = { symbol: fullSym, shortSymbol: shortSym, price: 0, change24h: 0, fibSignal: 'HOLD' };
        state.watchlist.push(newEntry);
        saveWatchlist();
        renderWatchlist();

        try {
            const resp = await fetch(`/api/ticker?symbol=${encodeURIComponent(fullSym)}`);
            if (resp.ok) {
                const t = await resp.json();
                newEntry.price = parseFloat(t.lastPrice) || 0;
                newEntry.change24h = parseFloat(String(t.priceChangePercent || '0').replace('+', '')) || 0;
                saveWatchlist();
                renderWatchlist();
            }
        } catch (e) {}
    }

    // ------------------------------------------------------------------------
    // 2. Asset-Specific Intelligence Fetch (Unlocks, Onchain, Mindshare, News, AI)
    // ------------------------------------------------------------------------
    async function loadAssetIntelligence(symbol) {
        state.currentAsset = symbol || state.currentAsset;
        const symParam = encodeURIComponent(state.currentAsset);
        const shortSym = cleanShort(state.currentAsset);

        // Update active labels
        document.querySelectorAll('.bw-active-asset-label').forEach(el => {
            el.textContent = shortSym;
        });

        renderAssetGrid();

        try {
            const [onchainResp, unlocksResp, mindshareResp, newsResp] = await Promise.all([
                fetch(`/api/onchain/metrics?asset=${symParam}`).catch(() => null),
                fetch(`/api/unlocks/upcoming?asset=${symParam}&days=90`).catch(() => null),
                fetch(`/api/social/mindshare?asset=${symParam}&timespan=7d`).catch(() => null),
                fetch(`/api/news?asset=${symParam}&limit=12`).catch(() => null)
            ]);

            if (onchainResp && onchainResp.ok) {
                state.onchainData = await onchainResp.json();
                renderOnchainPanel();
                renderDdScorePanel();
            }

            if (unlocksResp && unlocksResp.ok) {
                state.unlocksData = await unlocksResp.json();
                renderUnlocksPanel();
            }

            if (mindshareResp && mindshareResp.ok) {
                const msJson = await mindshareResp.json();
                state.mindshareCurrent = msJson.current;
                state.mindshareSeries = msJson.data || [];
                renderMindsharePanel();
                renderSentimentBadgeInOracle();
            }

            if (newsResp && newsResp.ok) {
                const newsJson = await newsResp.json();
                state.newsItems = newsJson.items || [];
                renderNewsSidebar();
            }

            // Trigger AI Signal Explanation automatically
            await fetchAiExplanation();

        } catch (err) {
            console.warn('[BlockworksIntel] Intelligence load warn:', err);
        }
    }

    // ------------------------------------------------------------------------
    // 3. Renderers for Sentiment Badge, DD-Score, Onchain, Unlocks, Mindshare, News
    // ------------------------------------------------------------------------
    function renderSentimentBadgeInOracle() {
        const c = state.mindshareCurrent;
        if (!c) return;

        const labelEl = document.getElementById('bwOracleSentLabel');
        const scoreEl = document.getElementById('bwOracleSentScore');
        const mentionsEl = document.getElementById('bwOracleSentMentions');
        const barBullEl = document.getElementById('bwOracleSentBullBar');
        const boxEl = document.getElementById('bwSentimentBadgeCard');

        if (labelEl) {
            const icon = c.sentiment > 0.25 ? '▲ ' : (c.sentiment < -0.25 ? '▼ ' : '● ');
            labelEl.textContent = `${icon}${c.label} (${c.bullishPct}% Bullish)`;
            labelEl.style.color = c.sentiment > 0.25 ? 'var(--accent-green)' : (c.sentiment < -0.25 ? 'var(--accent-red)' : 'var(--accent-amber)');
        }
        if (scoreEl) {
            scoreEl.textContent = `${c.sentiment > 0 ? '+' : ''}${c.sentiment.toFixed(2)}`;
            scoreEl.style.color = c.sentiment > 0.25 ? 'var(--accent-green)' : (c.sentiment < -0.25 ? 'var(--accent-red)' : 'var(--accent-amber)');
        }
        if (mentionsEl) {
            mentionsEl.textContent = `${c.mentions.toLocaleString('de-DE')} Mentions (24h) • Mindshare ${c.mindshare}%`;
        }
        if (barBullEl) {
            barBullEl.style.width = `${c.bullishPct}%`;
        }
        if (boxEl) {
            boxEl.style.borderColor = c.sentiment > 0.25 ? 'rgba(122, 240, 158, 0.35)' : (c.sentiment < -0.25 ? 'rgba(255, 85, 85, 0.35)' : 'rgba(255, 184, 0, 0.35)');
        }
    }

    function renderDdScorePanel() {
        const dd = state.onchainData && state.onchainData.ddScore;
        if (!dd) return;

        // Top Oracle Quick Badge
        const oracleDdVal = document.getElementById('bwOracleDdVal');
        const oracleDdSub = document.getElementById('bwOracleDdSub');
        if (oracleDdVal) {
            oracleDdVal.textContent = `${dd.rating} ${dd.score}/100 (${dd.label})`;
            oracleDdVal.style.color = dd.score >= 80 ? 'var(--accent-green)' : (dd.score >= 65 ? 'var(--accent-amber)' : 'var(--accent-red)');
        }
        if (oracleDdSub) {
            oracleDdSub.textContent = `Disclosure: ${String(dd.disclosureCoverage).toUpperCase()} • Blockworks Standard`;
        }

        // Full DD-Score Card in Bereich 6
        const scoreBig = document.getElementById('bwDdScoreBig');
        const labelBig = document.getElementById('bwDdLabelBig');
        const breakdownEl = document.getElementById('bwDdBreakdownBars');

        if (scoreBig) scoreBig.textContent = `${dd.rating} ${dd.score}/100`;
        if (labelBig) {
            labelBig.textContent = `${dd.label} Transparency`;
            labelBig.className = 'status-badge ' + (dd.score >= 75 ? 'badge-support' : (dd.score >= 55 ? 'badge-testing' : 'badge-resistance'));
        }

        if (breakdownEl && dd.breakdown) {
            const b = dd.breakdown;
            const rows = [
                { name: 'Disclosure Coverage (25%)', val: b.coverageScore },
                { name: 'Daten-Aktualität / Freshness (15%)', val: b.freshnessScore },
                { name: 'Token-Unlock Sicherheit (20%)', val: b.unlockScore },
                { name: 'Governance Aktivität (15%)', val: b.govScore },
                { name: 'Mindshare Momentum (10%)', val: b.mindshareScore },
                { name: 'News & Social Sentiment (15%)', val: b.sentimentScore }
            ];
            breakdownEl.innerHTML = rows.map(r => {
                const col = r.val >= 75 ? 'var(--accent-green)' : (r.val >= 50 ? 'var(--accent-amber)' : 'var(--accent-red)');
                return `
                    <div class="bw-dd-row">
                        <div class="bw-dd-row-head">
                            <span>${r.name}</span>
                            <span style="font-family:'JetBrains Mono',monospace; font-weight:700; color:${col};">${r.val}/100</span>
                        </div>
                        <div class="bw-dd-bar-bg">
                            <div class="bw-dd-bar-fill" style="width:${r.val}%; background:${col};"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function renderOnchainPanel() {
        const m = state.onchainData;
        if (!m) return;

        const elAddr = document.getElementById('bwOcActiveAddr');
        const elAddrChg = document.getElementById('bwOcActiveAddrChg');
        const elNetFlow = document.getElementById('bwOcNetFlow');
        const elNetFlowBadge = document.getElementById('bwOcNetFlowBadge');
        const elWhales = document.getElementById('bwOcWhales');
        const elDexRatio = document.getElementById('bwOcDexRatio');
        const elTvl = document.getElementById('bwOcTvl');
        const elTvlChg = document.getElementById('bwOcTvlChg');

        if (elAddr) elAddr.textContent = m.activeAddresses24h.toLocaleString('de-DE');
        if (elAddrChg) {
            const isUp = m.activeAddressesChange >= 0;
            elAddrChg.textContent = `${isUp ? '↗ +' : '↘ '}${m.activeAddressesChange.toFixed(2)}% (24h)`;
            elAddrChg.style.color = isUp ? 'var(--accent-green)' : 'var(--accent-red)';
        }

        if (elNetFlow) {
            const sign = m.netFlow > 0 ? '+' : '';
            elNetFlow.textContent = `${sign}${m.netFlow.toLocaleString('de-DE')} ${m.netFlowUnit}`;
            // Inverted color: negative netFlow = outflow from exchanges = bullish accumulation
            elNetFlow.style.color = m.netFlow < 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        }
        if (elNetFlowBadge) {
            if (m.netFlow < 0) {
                elNetFlowBadge.textContent = '↗ AKKUMULATION (ABFLUSS)';
                elNetFlowBadge.style.color = 'var(--accent-green)';
            } else {
                elNetFlowBadge.textContent = '↘ VERKAUFSDRUCK (ZUFLUSS)';
                elNetFlowBadge.style.color = 'var(--accent-red)';
            }
        }

        if (elWhales) elWhales.textContent = `${m.whaleTransactions.toLocaleString('de-DE')} Tx`;
        if (elDexRatio) elDexRatio.textContent = `${(m.dexCexRatio * 100).toFixed(1)}%`;

        if (elTvl) {
            const tvlBillions = m.tvl / 1e9;
            elTvl.textContent = `$${tvlBillions.toFixed(2)}B`;
        }
        if (elTvlChg) {
            const isUp = m.tvlChange7d >= 0;
            elTvlChg.textContent = `${isUp ? '+' : ''}${m.tvlChange7d.toFixed(2)}% (7d)`;
            elTvlChg.style.color = isUp ? 'var(--accent-green)' : 'var(--accent-red)';
        }
    }

    function renderUnlocksPanel() {
        const u = state.unlocksData;
        if (!u) return;

        const majorBox = document.getElementById('bwUnlockMajorAlert');
        const listEl = document.getElementById('bwUnlocksList');

        if (majorBox) {
            if (u.nextMajor) {
                const nm = u.nextMajor;
                const isHigh = nm.severity === 'high';
                majorBox.style.display = 'flex';
                majorBox.style.borderColor = isHigh ? 'rgba(255, 85, 85, 0.5)' : 'rgba(255, 184, 0, 0.45)';
                majorBox.style.background = isHigh ? 'rgba(255, 85, 85, 0.1)' : 'rgba(255, 184, 0, 0.08)';
                majorBox.innerHTML = `
                    <div style="font-size:1.2rem;">⚠️</div>
                    <div>
                        <div style="font-weight:700; color:${isHigh ? 'var(--accent-red)' : 'var(--accent-amber)'}; font-size:0.84rem;">
                            Nächster ${nm.type.toUpperCase()}-Event: ${nm.date} (in ${nm.daysUntil} Tagen)
                        </div>
                        <div style="font-size:0.76rem; color:var(--text-muted); margin-top:2px;">
                            <strong>${nm.amount.toLocaleString('de-DE')} ${nm.asset}</strong> (${nm.pctOfSupply.toFixed(2)}% Supply • ca. ${fmtMoney(nm.usdValue)}) — <em>${nm.recipient}</em>
                        </div>
                    </div>
                `;
            } else {
                majorBox.style.display = 'none';
            }
        }

        if (listEl) {
            if (!u.events || u.events.length === 0) {
                listEl.innerHTML = '<div style="text-align:center; padding:1rem; color:var(--text-faint);">Keine Token-Unlocks in den nächsten 90 Tagen.</div>';
                return;
            }
            listEl.innerHTML = u.events.map(ev => {
                const sevClass = ev.severity === 'high' ? 'bw-sev-high' : (ev.severity === 'medium' ? 'bw-sev-med' : 'bw-sev-low');
                const pctColor = ev.pctOfSupply > 2.0 ? 'var(--accent-red)' : (ev.pctOfSupply > 0.8 ? 'var(--accent-amber)' : 'var(--accent-green)');
                return `
                    <div class="bw-unlock-row ${sevClass}">
                        <div>
                            <div class="bw-unlock-date">${ev.date} <span style="color:var(--text-faint); font-size:0.7rem;">(in ${ev.daysUntil}d)</span></div>
                            <div class="bw-unlock-type">${ev.type.toUpperCase()} • ${ev.recipient}</div>
                        </div>
                        <div style="text-align:right;">
                            <div class="bw-unlock-usd">${fmtMoney(ev.usdValue)}</div>
                            <div style="font-size:0.73rem; font-family:'JetBrains Mono',monospace; color:${pctColor}; font-weight:700;">
                                ${ev.pctOfSupply.toFixed(2)}% Supply
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function renderMindsharePanel() {
        const c = state.mindshareCurrent;
        if (!c) return;

        const deltaEl = document.getElementById('bwMsDeltaBadge');
        const valEl = document.getElementById('bwMsCurrentVal');
        const sentEl = document.getElementById('bwMsSentimentVal');
        const mentEl = document.getElementById('bwMsMentionsVal');

        if (deltaEl) {
            const isUp = c.delta24h >= 0;
            deltaEl.textContent = `${isUp ? '↑ +' : '↓ '}${c.delta24h.toFixed(2)}% (24h)`;
            deltaEl.style.color = isUp ? 'var(--accent-green)' : 'var(--accent-red)';
        }
        if (valEl) valEl.textContent = `${c.mindshare.toFixed(1)}%`;
        if (sentEl) {
            sentEl.textContent = `${c.sentiment > 0 ? '+' : ''}${c.sentiment.toFixed(2)} (${c.label})`;
            sentEl.style.color = c.sentiment >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        }
        if (mentEl) mentEl.textContent = c.mentions.toLocaleString('de-DE');

        drawMindshareChart();
    }

    function drawMindshareChart() {
        const canvas = document.getElementById('bwMindshareCanvas');
        if (!canvas || !state.mindshareSeries || state.mindshareSeries.length < 2) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width || 360;
        const h = rect.height || 135;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const pts = state.mindshareSeries;
        const vals = pts.map(p => p.mindshare);
        const minV = Math.min(...vals) * 0.95;
        const maxV = Math.max(...vals) * 1.05 || 1;
        const span = maxV - minV || 1;

        const padL = 8, padR = 8, padT = 14, padB = 22;
        const plotW = w - padL - padR;
        const plotH = h - padT - padB;

        // Subtle grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let g = 0; g <= 2; g++) {
            const y = padT + (plotH / 2) * g;
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(w - padR, y);
            ctx.stroke();
        }

        // Gradient area under curve
        const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        grad.addColorStop(0, 'rgba(234, 179, 8, 0.38)');
        grad.addColorStop(1, 'rgba(234, 179, 8, 0.01)');

        ctx.beginPath();
        pts.forEach((p, idx) => {
            const x = padL + (idx / (pts.length - 1)) * plotW;
            const y = padT + plotH - ((p.mindshare - minV) / span) * plotH;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Fill area
        ctx.lineTo(padL + plotW, padT + plotH);
        ctx.lineTo(padL, padT + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Labels
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(pts[0].date.split(' ')[0], padL + 2, h - 6);
        ctx.fillText(pts[Math.floor(pts.length / 2)].date.split(' ')[0], w / 2 - 16, h - 6);
        ctx.fillText('Heute', w - padR - 34, h - 6);
    }

    function renderNewsSidebar() {
        const listEl = document.getElementById('bwNewsList');
        if (!listEl) return;

        const filtered = state.newsItems.filter(n => state.newsFilter === 'all' || n.sentiment === state.newsFilter);
        if (filtered.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:1.2rem; color:var(--text-faint); font-size:0.8rem;">Keine Nachrichten für diesen Sentiment-Filter.</div>';
            return;
        }

        listEl.innerHTML = filtered.map(n => {
            let sentBadge = '<span class="bw-news-sent bw-sent-neutral">● NEUTRAL</span>';
            if (n.sentiment === 'bullish') sentBadge = '<span class="bw-news-sent bw-sent-bull">▲ BULLISH</span>';
            if (n.sentiment === 'bearish') sentBadge = '<span class="bw-news-sent bw-sent-bear">▼ BEARISH</span>';

            const tagsHtml = (n.assets || []).map(tag => `<span class="bw-news-tag">#${tag}</span>`).join('');
            return `
                <a href="${n.url}" target="_blank" rel="noopener noreferrer" class="bw-news-item">
                    <div class="bw-news-meta">
                        ${sentBadge}
                        <span class="bw-news-src">${n.source}</span>
                        <span class="bw-news-time">${relativeTime(n.publishedAt)}</span>
                    </div>
                    <div class="bw-news-title">${n.title}</div>
                    ${n.summary ? `<div class="bw-news-sum">${n.summary}</div>` : ''}
                    <div class="bw-news-tags">${tagsHtml}</div>
                </a>
            `;
        }).join('');
    }

    // ------------------------------------------------------------------------
    // 4. Phase 3.2: AI Signal Explanation (Fibonacci × Onchain × Unlocks)
    // ------------------------------------------------------------------------
    async function fetchAiExplanation() {
        const outEl = document.getElementById('bwAiExplanationContent');
        const statusEl = document.getElementById('bwAiExplainStatus');
        if (!outEl) return;

        if (statusEl) statusEl.textContent = 'Analysiere Onchain & News...';

        const sigText = (document.getElementById('oracleSignalText') || {}).textContent || 'KAUFSIGNAL';
        const confText = ((document.getElementById('confidenceVal') || {}).textContent || '82').replace('%', '');
        const entryText = (document.getElementById('tradeEntryVal') || {}).textContent || '';
        const tp1Text = (document.getElementById('tradeTp1Val') || {}).textContent || '';
        const slText = (document.getElementById('tradeStopLossVal') || {}).textContent || '';

        try {
            const resp = await fetch('/api/ai/explain-signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset: state.currentAsset,
                    signal: {
                        action: sigText,
                        confidence: confText,
                        entry: entryText,
                        tp1: tp1Text,
                        sl: slText,
                        fibLevel: '61.8%'
                    }
                })
            });

            if (resp.ok) {
                const data = await resp.json();
                state.aiExplanation = data;
                renderAiExplanation(data);
                if (statusEl) statusEl.textContent = 'Blockworks AI Co-Pilot • Aktiv';
            }
        } catch (e) {
            if (statusEl) statusEl.textContent = 'Offline-Synthese';
        }
    }

    function renderAiExplanation(data) {
        const outEl = document.getElementById('bwAiExplanationContent');
        if (!outEl || !data || !data.structured) return;

        const s = data.structured;
        const src = data.sources || {};
        outEl.innerHTML = `
            <div class="bw-ai-grid">
                <div class="bw-ai-point">
                    <div class="bw-ai-point-title" style="color:var(--accent-green);">1. Warum macht dieses Signal jetzt Sinn?</div>
                    <div class="bw-ai-point-body">${s.why}</div>
                </div>
                <div class="bw-ai-point">
                    <div class="bw-ai-point-title" style="color:var(--accent-amber);">2. Größtes Risiko (Token Unlocks & Flow)</div>
                    <div class="bw-ai-point-body">${s.risk}</div>
                </div>
                <div class="bw-ai-point">
                    <div class="bw-ai-point-title" style="color:var(--accent-cyan, #00f0ff);">3. Zu beobachtende Bestätigung</div>
                    <div class="bw-ai-point-body">${s.confirmation}</div>
                </div>
            </div>
            <div class="bw-ai-sources-bar">
                <span class="bw-ai-src-pill">Onchain Flow: <strong>${src.onchain ? src.onchain.netFlow : 'Aktiv'}</strong></span>
                <span class="bw-ai-src-pill">Whale Tx (24h): <strong>${src.onchain ? src.onchain.whaleTransactions : '--'}</strong></span>
                <span class="bw-ai-src-pill">DD-Score: <strong>${src.ddScore ? src.ddScore.score + '/100 ' + src.ddScore.rating : '--'}</strong></span>
                <span class="bw-ai-src-pill">Sentiment: <strong>${src.sentiment ? (src.sentiment.sentiment > 0 ? '+' : '') + src.sentiment.sentiment : '--'}</strong></span>
            </div>
        `;
    }

    // ------------------------------------------------------------------------
    // 5. Phase 3.3: Custom Multi-Condition Alert Builder
    // ------------------------------------------------------------------------
    function getNaturalLanguageAlertPreview() {
        const assetSel = document.getElementById('bwAlertAssetSelect');
        const asset = assetSel ? assetSel.value : cleanShort(state.currentAsset);

        const typeLabels = {
            fib_level: 'Fib-Level',
            price_above: 'Preis über',
            price_below: 'Preis unter',
            mindshare: 'Mindshare (%)',
            sentiment: 'Sentiment-Score',
            unlock_event: 'Token-Unlock (Tage)'
        };
        const opLabels = {
            crosses_below: 'kreuzt unter',
            crosses_above: 'kreuzt über',
            gt: '>',
            lt: '<',
            eq: '='
        };

        if (state.alertBuilderConditions.length === 0) {
            return `${asset}: Bitte mindestens eine Bedingung hinzufügen`;
        }

        const parts = state.alertBuilderConditions.map(c => {
            return `${typeLabels[c.type] || c.type} ${opLabels[c.operator] || c.operator} ${c.value}`;
        });
        return `${asset}: ${parts.join(` ${state.alertCombineWith} `)}`;
    }

    function renderAlertBuilder() {
        const condContainer = document.getElementById('bwAlertConditionsList');
        const previewEl = document.getElementById('bwAlertNaturalPreview');
        const savedListEl = document.getElementById('bwSavedCustomAlertsList');

        if (previewEl) {
            previewEl.textContent = '📝 ' + getNaturalLanguageAlertPreview();
        }

        if (condContainer) {
            condContainer.innerHTML = state.alertBuilderConditions.map((c, idx) => `
                <div class="bw-alert-cond-row">
                    <select class="bw-cond-type" data-idx="${idx}">
                        <option value="fib_level" ${c.type === 'fib_level' ? 'selected' : ''}>Fib-Level</option>
                        <option value="price_above" ${c.type === 'price_above' ? 'selected' : ''}>Preis über ($)</option>
                        <option value="price_below" ${c.type === 'price_below' ? 'selected' : ''}>Preis unter ($)</option>
                        <option value="mindshare" ${c.type === 'mindshare' ? 'selected' : ''}>Mindshare %</option>
                        <option value="sentiment" ${c.type === 'sentiment' ? 'selected' : ''}>Sentiment Score</option>
                        <option value="unlock_event" ${c.type === 'unlock_event' ? 'selected' : ''}>Token-Unlock (&lt; Tage)</option>
                    </select>
                    <select class="bw-cond-op" data-idx="${idx}">
                        <option value="crosses_below" ${c.operator === 'crosses_below' ? 'selected' : ''}>kreuzt unter</option>
                        <option value="crosses_above" ${c.operator === 'crosses_above' ? 'selected' : ''}>kreuzt über</option>
                        <option value="gt" ${c.operator === 'gt' ? 'selected' : ''}>&gt; (größer)</option>
                        <option value="lt" ${c.operator === 'lt' ? 'selected' : ''}>&lt; (kleiner)</option>
                    </select>
                    <input type="number" step="0.01" class="bw-cond-val" data-idx="${idx}" value="${c.value}">
                    <button type="button" class="bw-cond-del" data-idx="${idx}" title="Bedingung löschen">✕</button>
                </div>
            `).join('');

            condContainer.querySelectorAll('.bw-cond-type').forEach(sel => {
                sel.addEventListener('change', () => {
                    const i = parseInt(sel.getAttribute('data-idx'));
                    state.alertBuilderConditions[i].type = sel.value;
                    if (sel.value === 'fib_level') state.alertBuilderConditions[i].value = 0.618;
                    if (sel.value === 'sentiment') state.alertBuilderConditions[i].value = 0.35;
                    if (sel.value === 'mindshare') state.alertBuilderConditions[i].value = 5.0;
                    if (sel.value === 'unlock_event') state.alertBuilderConditions[i].value = 14;
                    renderAlertBuilder();
                });
            });

            condContainer.querySelectorAll('.bw-cond-op').forEach(sel => {
                sel.addEventListener('change', () => {
                    const i = parseInt(sel.getAttribute('data-idx'));
                    state.alertBuilderConditions[i].operator = sel.value;
                    renderAlertBuilder();
                });
            });

            condContainer.querySelectorAll('.bw-cond-val').forEach(inp => {
                inp.addEventListener('input', () => {
                    const i = parseInt(inp.getAttribute('data-idx'));
                    state.alertBuilderConditions[i].value = parseFloat(inp.value) || 0;
                    if (previewEl) previewEl.textContent = '📝 ' + getNaturalLanguageAlertPreview();
                });
            });

            condContainer.querySelectorAll('.bw-cond-del').forEach(btn => {
                btn.addEventListener('click', () => {
                    const i = parseInt(btn.getAttribute('data-idx'));
                    state.alertBuilderConditions.splice(i, 1);
                    renderAlertBuilder();
                });
            });
        }

        if (savedListEl) {
            if (state.customAlerts.length === 0) {
                savedListEl.innerHTML = '<div style="font-size:0.75rem; color:var(--text-faint);">Keine benutzerdefinierten Alerts gespeichert.</div>';
            } else {
                savedListEl.innerHTML = state.customAlerts.map(al => `
                    <div class="bw-saved-alert-item">
                        <div>
                            <div style="font-weight:700; color:#fff; font-size:0.8rem;">🔔 ${al.name} <span class="bw-news-tag">${al.asset}</span></div>
                            <div style="font-size:0.72rem; color:var(--accent-amber); font-family:'JetBrains Mono',monospace; margin-top:2px;">
                                ${al.preview || ''}
                            </div>
                            <div style="font-size:0.68rem; color:var(--text-faint); margin-top:2px;">
                                Kanäle: ${(al.channels || ['push']).join(', ').toUpperCase()} • Aktiv seit ${al.createdAt}
                            </div>
                        </div>
                        <button type="button" class="bw-wl-remove" data-del-alert="${al.id}" title="Alert löschen">✕</button>
                    </div>
                `).join('');

                savedListEl.querySelectorAll('[data-del-alert]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-del-alert');
                        state.customAlerts = state.customAlerts.filter(a => a.id !== id);
                        saveAlerts();
                        renderAlertBuilder();
                    });
                });
            }
        }
    }

    // ------------------------------------------------------------------------
    // 6. Phase 2.4: Dynamic Multi-Strategy Backtesting Equity Curve
    // ------------------------------------------------------------------------
    function drawBacktestEquityCurve(equityArray) {
        const canvas = document.getElementById('btEquityCanvas');
        if (!canvas) return;

        const pts = (equityArray && equityArray.length > 1)
            ? equityArray
            : [100, 102.4, 101.1, 106.8, 105.2, 112.5, 118.9, 116.4, 124.2, 131.8];

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width || 320;
        const h = rect.height || 90;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const minV = Math.min(...pts) * 0.98;
        const maxV = Math.max(...pts) * 1.02 || 1;
        const span = maxV - minV || 1;
        const pad = 8;
        const plotW = w - pad * 2;
        const plotH = h - pad * 2;

        const isProfit = pts[pts.length - 1] >= pts[0];
        const strokeCol = isProfit ? '#7af09e' : '#ff5555';

        const grad = ctx.createLinearGradient(0, pad, 0, pad + plotH);
        grad.addColorStop(0, isProfit ? 'rgba(122, 240, 158, 0.32)' : 'rgba(255, 85, 85, 0.32)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

        ctx.beginPath();
        pts.forEach((v, i) => {
            const x = pad + (i / (pts.length - 1)) * plotW;
            const y = pad + plotH - ((v - minV) / span) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.lineTo(pad + plotW, pad + plotH);
        ctx.lineTo(pad, pad + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
    }

    // ------------------------------------------------------------------------
    // 7. Phase 3.1: MCP Server Interactive Runner (/api/mcp)
    // ------------------------------------------------------------------------
    async function runMcpTool(toolName) {
        const outputEl = document.getElementById('bwMcpOutputBox');
        const tableWrapEl = document.getElementById('bwMcpCompareTableWrap');
        if (!outputEl) return;

        outputEl.textContent = `// Führe MCP-Tool "${toolName}" auf /api/mcp aus...`;

        try {
            const shortSym = cleanShort(state.currentAsset);
            const url = `/api/mcp?tool=${encodeURIComponent(toolName)}&asset=${encodeURIComponent(shortSym)}&assets=BTC,ETH,SOL,INJ,SUI,LINK&query=${encodeURIComponent(shortSym)}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();

            outputEl.textContent = JSON.stringify(data, null, 2);

            if (toolName === 'fib_compare_assets' && tableWrapEl && Array.isArray(data.result)) {
                tableWrapEl.style.display = 'block';
                tableWrapEl.innerHTML = `
                    <table class="fib-table" style="min-width:100%; font-size:0.74rem; margin-bottom:10px;">
                        <thead>
                            <tr>
                                <th>Asset</th>
                                <th>Kurs</th>
                                <th>24h</th>
                                <th>Fib-Signal</th>
                                <th>Sentiment</th>
                                <th>DD-Score</th>
                                <th>Next Unlock</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.result.map(r => `
                                <tr>
                                    <td style="font-weight:700; color:#fff;">${r.asset}</td>
                                    <td>${fmtMoney(r.price)}</td>
                                    <td style="color:${r.change24hPct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
                                        ${r.change24hPct >= 0 ? '+' : ''}${r.change24hPct}%
                                    </td>
                                    <td><span class="status-badge ${r.fibSignal === 'BUY' ? 'badge-support' : (r.fibSignal === 'SELL' ? 'badge-resistance' : '')}">${r.fibSignal} (${r.confidencePct}%)</span></td>
                                    <td style="color:${r.sentimentScore >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${r.sentimentScore > 0 ? '+' : ''}${r.sentimentScore}</td>
                                    <td>${r.ddScore}/100 ${r.ddRating.split(' ')[0]}</td>
                                    <td>${r.nextUnlockPct}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            } else if (tableWrapEl) {
                tableWrapEl.style.display = 'none';
            }
        } catch (err) {
            outputEl.textContent = `{"error": "MCP Request fehlgeschlagen: ${err.message}"}`;
        }
    }

    // ------------------------------------------------------------------------
    // DOM Event Wiring
    // ------------------------------------------------------------------------
    function bindEvents() {
        // Toggle Multi-Asset Grid
        const btnToggleGrid = document.getElementById('btnToggleBwAssetGrid');
        const gridWrap = document.getElementById('bwAssetGridWrapper');
        if (btnToggleGrid && gridWrap) {
            btnToggleGrid.addEventListener('click', () => {
                state.gridExpanded = !state.gridExpanded;
                gridWrap.style.display = state.gridExpanded ? 'block' : 'none';
                btnToggleGrid.classList.toggle('active', state.gridExpanded);
                if (state.gridExpanded) renderAssetGrid();
            });
        }

        // Toggle Watchlist Drawer
        const btnToggleWl = document.getElementById('btnToggleBwWatchlist');
        const wlWrap = document.getElementById('bwWatchlistWrapper');
        if (btnToggleWl && wlWrap) {
            btnToggleWl.addEventListener('click', () => {
                state.watchlistExpanded = !state.watchlistExpanded;
                wlWrap.style.display = state.watchlistExpanded ? 'block' : 'none';
                btnToggleWl.classList.toggle('active', state.watchlistExpanded);
                if (state.watchlistExpanded) renderWatchlist();
            });
        }

        // Add Watchlist Asset
        const btnAddWl = document.getElementById('btnBwWatchlistAdd');
        const inpAddWl = document.getElementById('inpBwWatchlistSymbol');
        if (btnAddWl && inpAddWl) {
            btnAddWl.addEventListener('click', () => {
                addWatchlistSymbol(inpAddWl.value);
                inpAddWl.value = '';
            });
            inpAddWl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addWatchlistSymbol(inpAddWl.value);
                    inpAddWl.value = '';
                }
            });
        }

        // News Sentiment Filter Buttons
        document.querySelectorAll('.bw-news-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.bw-news-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.newsFilter = btn.getAttribute('data-filter') || 'all';
                renderNewsSidebar();
            });
        });

        // AI Explain Refresh Button
        const btnAiExplain = document.getElementById('btnRunAiExplain');
        if (btnAiExplain) {
            btnAiExplain.addEventListener('click', () => {
                fetchAiExplanation();
            });
        }

        // Custom Alert Builder Controls
        const btnAddCond = document.getElementById('btnBwAddAlertCond');
        if (btnAddCond) {
            btnAddCond.addEventListener('click', () => {
                state.alertBuilderConditions.push({ type: 'price_above', operator: 'gt', value: 85000 });
                renderAlertBuilder();
            });
        }

        const selCombine = document.getElementById('bwAlertCombineSelect');
        if (selCombine) {
            selCombine.addEventListener('change', () => {
                state.alertCombineWith = selCombine.value;
                renderAlertBuilder();
            });
        }

        const selAlertAsset = document.getElementById('bwAlertAssetSelect');
        if (selAlertAsset) {
            selAlertAsset.addEventListener('change', () => {
                renderAlertBuilder();
            });
        }

        const btnSaveAlert = document.getElementById('btnBwSaveCustomAlert');
        if (btnSaveAlert) {
            btnSaveAlert.addEventListener('click', () => {
                const nameInp = document.getElementById('bwAlertNameInput');
                const assetSel = document.getElementById('bwAlertAssetSelect');
                const name = (nameInp && nameInp.value.trim()) ? nameInp.value.trim() : `Custom ${cleanShort(state.currentAsset)} Alert`;
                const asset = assetSel ? assetSel.value : cleanShort(state.currentAsset);

                if (state.alertBuilderConditions.length === 0) return;

                const newRule = {
                    id: 'al-' + Date.now(),
                    name,
                    asset,
                    conditions: JSON.parse(JSON.stringify(state.alertBuilderConditions)),
                    combineWith: state.alertCombineWith,
                    channels: ['push', 'telegram'],
                    preview: getNaturalLanguageAlertPreview(),
                    active: true,
                    createdAt: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                };
                state.customAlerts.unshift(newRule);
                saveAlerts();
                if (nameInp) nameInp.value = '';
                renderAlertBuilder();
            });
        }

        // MCP Tool Buttons
        document.querySelectorAll('.bw-mcp-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.bw-mcp-tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tool = btn.getAttribute('data-mcp-tool');
                if (tool) runMcpTool(tool);
            });
        });

        // Resize redraw for Mindshare & Equity canvas
        window.addEventListener('resize', () => {
            drawMindshareChart();
            drawBacktestEquityCurve();
        });
    }

    function init() {
        loadPersistedState();
        bindEvents();
        renderWatchlist();
        renderAlertBuilder();
        drawBacktestEquityCurve();

        fetchTopAssets();
        loadAssetIntelligence(state.currentAsset);

        // Auto-refresh top assets & watchlist every 30s
        setInterval(fetchTopAssets, 30000);
        // Auto-refresh active asset intelligence every 60s
        setInterval(() => loadAssetIntelligence(state.currentAsset), 60000);

        // Run initial MCP comparison table
        setTimeout(() => runMcpTool('fib_compare_assets'), 800);
    }

    window.BlockworksIntel = {
        init,
        onAssetChanged: function (newSymbol) {
            const alertAssetSel = document.getElementById('bwAlertAssetSelect');
            const shortSym = cleanShort(newSymbol);
            if (alertAssetSel) {
                for (let i = 0; i < alertAssetSel.options.length; i++) {
                    if (alertAssetSel.options[i].value === shortSym) {
                        alertAssetSel.value = shortSym;
                        break;
                    }
                }
            }
            loadAssetIntelligence(newSymbol);
            renderAlertBuilder();
        },
        onCurrencyChanged: function () {
            renderAssetGrid();
            renderWatchlist();
            renderUnlocksPanel();
            if (state.aiExplanation) fetchAiExplanation();
        },
        drawBacktestEquityCurve,
        getUnlocksForChart: function () {
            if (!state.showUnlocksOnChart || !state.unlocksData) return [];
            return state.unlocksData.events || [];
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
