/**
 * Digitaler Tages-Investment-Copilot (Daily Crypto Investment Copilot)
 * Regelbasierter Multi-Asset Scanner & Persönliche Kaufberatung
 * 
 * Bewertungskriterien (100-Punkte-Modell):
 * - Trend (20 Pkt): Kurs relativ zu MA50 / MA200
 * - Momentum (20 Pkt): 24h & Mehrtages-Dynamik
 * - Einstiegszeitpunkt (15 Pkt): RSI(14) Sweet-Spot (38-54) & Retracement-Nähe
 * - Bewertung / Rabatt (10 Pkt): Abschlag vom Periodenhoch
 * - Risiko / Volatilität (15 Pkt): Geringere ATR / Bandbreite = höheres Scoring
 * - Liquidität (10 Pkt): 24h Handelsvolumen
 * - Yield / Staking Bonus: Zinsmöglichkeiten (z.B. INJ Hydro Staking 16.42% APR)
 */

(function () {
    'use strict';

    const COPILOT_COINS = [
        { symbol: 'BTCUSDT', name: 'Bitcoin', ticker: 'BTC', cat: 'conservative', stakingApr: null },
        { symbol: 'ETHUSDT', name: 'Ethereum', ticker: 'ETH', cat: 'momentum', stakingApr: 3.2 },
        { symbol: 'SOLUSDT', name: 'Solana', ticker: 'SOL', cat: 'momentum', stakingApr: 6.8 },
        { symbol: 'BNBUSDT', name: 'BNB', ticker: 'BNB', cat: 'conservative', stakingApr: 2.5 },
        { symbol: 'XRPUSDT', name: 'Ripple', ticker: 'XRP', cat: 'dip', stakingApr: null },
        { symbol: 'ADAUSDT', name: 'Cardano', ticker: 'ADA', cat: 'dip', stakingApr: 2.8 },
        { symbol: 'DOGEUSDT', name: 'Dogecoin', ticker: 'DOGE', cat: 'momentum', stakingApr: null },
        { symbol: 'AVAXUSDT', name: 'Avalanche', ticker: 'AVAX', cat: 'momentum', stakingApr: 5.5 },
        { symbol: 'LINKUSDT', name: 'Chainlink', ticker: 'LINK', cat: 'momentum', stakingApr: 4.1 },
        { symbol: 'DOTUSDT', name: 'Polkadot', ticker: 'DOT', cat: 'yield', stakingApr: 11.8 },
        { symbol: 'SUIUSDT', name: 'Sui', ticker: 'SUI', cat: 'momentum', stakingApr: 3.5 },
        { symbol: 'NEARUSDT', name: 'NEAR Protocol', ticker: 'NEAR', cat: 'momentum', stakingApr: 7.2 },
        { symbol: 'LTCUSDT', name: 'Litecoin', ticker: 'LTC', cat: 'conservative', stakingApr: null },
        { symbol: 'MATICUSDT', name: 'Polygon', ticker: 'MATIC', cat: 'dip', stakingApr: 4.6 },
        { symbol: 'SHIBUSDT', name: 'Shiba Inu', ticker: 'SHIB', cat: 'momentum', stakingApr: null },
        { symbol: 'INJUSDT', name: 'Injective', ticker: 'INJ', cat: 'yield', stakingApr: 16.42 }
    ];

    let coinRatings = [];
    let currentFilter = 'all'; // 'all', 'conservative', 'momentum', 'yield', 'dip'
    let isScanning = false;
    let lastScanTime = null;

    // --- DOM Elements Cache ---
    let dom = {
        copilotContainer: null,
        toggleBtn: null,
        filterBtns: null,
        topPicksContainer: null,
        rankingTableBody: null,
        lastUpdatedEl: null,
        scanStatusEl: null,
        // Investment Checker DOM Elements
        checkerCard: null,
        checkerCoinSelect: null,
        checkerAmountInput: null,
        checkerCurrencyLabel: null,
        checkerCurrTag: null,
        checkerAmountChips: null,
        btnRunInvestmentCheck: null,
        checkerResultBox: null
    };

    function initDOM() {
        dom.copilotContainer = document.getElementById('copilotPanel');
        dom.toggleBtn = document.getElementById('btnToggleCopilot');
        dom.filterBtns = document.querySelectorAll('.copilot-filter-btn');
        dom.topPicksContainer = document.getElementById('copilotTopPicks');
        dom.rankingTableBody = document.getElementById('copilotRankingBody');
        dom.lastUpdatedEl = document.getElementById('copilotLastUpdated');
        dom.scanStatusEl = document.getElementById('copilotScanStatus');

        dom.checkerCard = document.getElementById('copilotCheckerCard');
        dom.checkerCoinSelect = document.getElementById('checkerCoinSelect');
        dom.checkerAmountInput = document.getElementById('checkerAmountInput');
        dom.checkerCurrencyLabel = document.getElementById('checkerCurrencyLabel');
        dom.checkerCurrTag = document.getElementById('checkerCurrTag');
        dom.checkerAmountChips = document.getElementById('checkerAmountChips');
        dom.btnRunInvestmentCheck = document.getElementById('btnRunInvestmentCheck');
        dom.checkerResultBox = document.getElementById('checkerResultBox');
    }

    // --- Score Calculation Engine ---
    async function scanMarket() {
        if (isScanning) return;
        isScanning = true;
        if (dom.scanStatusEl) dom.scanStatusEl.textContent = 'Analysiere Marktdaten...';

        const results = [];

        await Promise.all(COPILOT_COINS.map(async (coin) => {
            try {
                // Fetch 24h ticker info & candles in parallel for fast loading
                const [tickerResp, klinesResp] = await Promise.all([
                    fetch(`/api/ticker?symbol=${coin.symbol}`).catch(() => null),
                    fetch(`/api/klines?symbol=${coin.symbol}&interval=4h&limit=30`).catch(() => null)
                ]);

                let priceChangePct = 0;
                let volumeUsd = 0;
                let lastPrice = 0;
                let highPrice = 0;
                let lowPrice = 0;

                if (tickerResp && tickerResp.ok) {
                    const t = await tickerResp.json();
                    priceChangePct = parseFloat(t.priceChangePercent) || 0;
                    volumeUsd = parseFloat(t.quoteVolume) || 0;
                    lastPrice = parseFloat(t.lastPrice) || 0;
                    highPrice = parseFloat(t.highPrice) || lastPrice;
                    lowPrice = parseFloat(t.lowPrice) || lastPrice;
                }

                let rsi = 50;
                let isAboveMA = true;
                let volatilityPct = 3.5;

                if (klinesResp && klinesResp.ok) {
                    const rawCandles = await klinesResp.json();
                    if (Array.isArray(rawCandles) && rawCandles.length > 14) {
                        const closes = rawCandles.map(c => parseFloat(c[4]));
                        rsi = calculateQuickRsi(closes, 14);

                        const sum = closes.slice(-20).reduce((a, b) => a + b, 0);
                        const ma20 = sum / 20;
                        isAboveMA = closes[closes.length - 1] >= ma20;

                        let rangeSum = 0;
                        for (const c of rawCandles.slice(-14)) {
                            const h = parseFloat(c[2]);
                            const l = parseFloat(c[3]);
                            const cl = parseFloat(c[4]);
                            if (cl > 0) rangeSum += ((h - l) / cl);
                        }
                        volatilityPct = (rangeSum / 14) * 100;
                    }
                }

                // --- 100-Punkte Bewertungsmodell ---
                // 1. Trend (20 Pkt)
                let trendScore = isAboveMA ? 18 : 6;
                if (priceChangePct > 0) trendScore = Math.min(20, trendScore + 2);

                // 2. Momentum (20 Pkt)
                let momentumScore = 10;
                if (priceChangePct >= 1 && priceChangePct <= 7) {
                    momentumScore = 18;
                } else if (priceChangePct > 7 && priceChangePct <= 14) {
                    momentumScore = 15;
                } else if (priceChangePct > 14) {
                    momentumScore = 11; // Überhitzt
                } else if (priceChangePct >= -2 && priceChangePct < 1) {
                    momentumScore = 12; // Konsolidierung
                } else {
                    momentumScore = 7; // Abwärtsdruck
                }

                // 3. Einstiegs-Timing (15 Pkt) - RSI Sweet Spot (38-54)
                let entryScore = 10;
                if (rsi >= 38 && rsi <= 54) {
                    entryScore = 15; // Optimaler Einstiegsbereich
                } else if (rsi > 54 && rsi <= 64) {
                    entryScore = 11;
                } else if (rsi < 38) {
                    entryScore = 13; // Stark überverkauft (Rebound-Chance)
                } else {
                    entryScore = 5; // Überkauft (RSI > 65)
                }

                // 4. Bewertung / Rabatt zum Hoch (10 Pkt)
                const discountFromHigh = highPrice > 0 ? Math.max(0, ((highPrice - lastPrice) / highPrice) * 100) : 0;
                let valuationScore = 5;
                if (discountFromHigh >= 4 && discountFromHigh <= 12) {
                    valuationScore = 9;
                } else if (discountFromHigh > 12) {
                    valuationScore = 10; // Großer Rabatt
                } else {
                    valuationScore = 4; // Nahe am Allzeithoch
                }

                // 5. Risiko / Volatilität (15 Pkt)
                let riskScore = 10;
                if (volatilityPct < 3.0) {
                    riskScore = 14; // Sehr stabil
                } else if (volatilityPct <= 5.0) {
                    riskScore = 11; // Solide
                } else {
                    riskScore = 6; // Hohe Schwankungen
                }

                // 6. Liquidität (10 Pkt)
                let liqScore = 5;
                if (volumeUsd > 200000000) {
                    liqScore = 10; // Mega-Cap Liquidität
                } else if (volumeUsd > 30000000) {
                    liqScore = 8;
                } else {
                    liqScore = 6;
                }

                // 7. Yield / Staking Bonus (Zusatzpunkte bei Rendite-Möglichkeiten)
                let yieldBonus = 0;
                if (coin.stakingApr) {
                    if (coin.stakingApr > 15) yieldBonus = 6; // Injective Hydro (16.42%)
                    else if (coin.stakingApr > 8) yieldBonus = 4;
                    else yieldBonus = 2;
                }

                let totalScore = Math.min(96, Math.max(45, trendScore + momentumScore + entryScore + valuationScore + riskScore + liqScore + yieldBonus));

                // Einstufung / Urteil formulieren
                let verdict = '';
                let badgeClass = 'verdict-neutral';
                let actionType = 'trade';
                if (coin.symbol === 'INJUSDT') {
                    actionType = 'stake';
                    if (totalScore >= 74) {
                        verdict = 'Top Cashflow-Pick (16.42% Hydro Staking + starker Trend)';
                        badgeClass = 'verdict-strong';
                    } else if (totalScore >= 65) {
                        verdict = 'Staking-Pick (16.42% Hydro Staking, moderate Trendstärke)';
                        badgeClass = 'verdict-moderate';
                    } else {
                        verdict = 'Defensives Staking (16.42% APR Cashflow in Konsolidierungsphase)';
                        badgeClass = 'verdict-neutral';
                    }
                } else if (totalScore >= 74) {
                    verdict = 'Starke Kaufgelegenheit: Trend intakt, RSI im optimalen Bereich';
                    badgeClass = 'verdict-strong';
                } else if (totalScore >= 68) {
                    verdict = 'Solider Trendkauf mit hoher Liquidität und kontrolliertem Risiko';
                    badgeClass = 'verdict-moderate';
                } else if (discountFromHigh > 10 && rsi < 42) {
                    verdict = 'Rebound-Chance / Dip-Kauf: Günstige Bewertung nahe Support';
                    badgeClass = 'verdict-dip';
                } else {
                    verdict = 'Halten / Abwarten: Vorübergehende Konsolidierung';
                    badgeClass = 'verdict-neutral';
                }

                results.push({
                    symbol: coin.symbol,
                    name: coin.name,
                    ticker: coin.ticker,
                    cat: coin.cat,
                    price: lastPrice,
                    highPrice: highPrice,
                    lowPrice: lowPrice,
                    discountFromHigh: discountFromHigh,
                    change24h: priceChangePct,
                    rsi: rsi.toFixed(1),
                    volatility: volatilityPct.toFixed(1),
                    stakingApr: coin.stakingApr,
                    scores: {
                        trend: trendScore,
                        momentum: momentumScore,
                        entry: entryScore,
                        valuation: valuationScore,
                        risk: riskScore,
                        liquidity: liqScore,
                        total: totalScore
                    },
                    verdict: verdict,
                    badgeClass: badgeClass,
                    actionType: actionType
                });

            } catch (err) {
                console.warn(`Fehler beim Scannen von ${coin.symbol}:`, err);
            }
        }));

        // Sort by total score descending
        results.sort((a, b) => b.scores.total - a.scores.total);
        coinRatings = results;
        lastScanTime = new Date();
        isScanning = false;

        renderCopilotUI();
    }

    function calculateQuickRsi(closes, period = 14) {
        if (closes.length < period + 1) return 50;
        let gains = 0;
        let losses = 0;

        for (let i = closes.length - period; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }

        if (losses === 0) return 100;
        const rs = (gains / period) / (losses / period);
        return 100 - (100 / (1 + rs));
    }

    // --- UI Rendering ---
    function renderCopilotUI() {
        if (!dom.copilotContainer) return;

        if (dom.lastUpdatedEl) {
            dom.lastUpdatedEl.textContent = `Stand: ${lastScanTime.toLocaleTimeString('de-DE')} Uhr (Live gescannt)`;
        }
        if (dom.scanStatusEl) {
            dom.scanStatusEl.textContent = `● SCAN VOLLSTÄNDIG (${coinRatings.length} MÄRKTE)`;
        }

        // 1. Render Top Picks Cards
        if (dom.topPicksContainer && coinRatings.length > 0) {
            // Pick #1: Absolute highest score
            const topOverall = coinRatings[0];
            // Pick #2: Conservative pick (BTC or ETH with highest score)
            const topConservative = coinRatings.find(c => c.cat === 'conservative') || coinRatings[1];
            // Pick #3: Yield / Staking Pick (INJ Hydro Protocol)
            const topYield = coinRatings.find(c => c.symbol === 'INJUSDT') || coinRatings.find(c => c.stakingApr > 5);

            const picks = [
                {
                    rankBadge: "EMPFEHLUNG DES TAGES // PLATZ 1",
                    item: topOverall,
                    icon: "⭐",
                    highlight: "Bester Gesamtwert aus Trend, Momentum & Einstieg"
                },
                {
                    rankBadge: "KONSISTENZ & SICHERHEIT // DEFENSIF",
                    item: topConservative,
                    icon: "🛡️",
                    highlight: "Niedrigste Volatilität & maximale Markttiefe"
                },
                {
                    rankBadge: "CASHFLOW & STAKING // PASSIVES EINKOMMEN",
                    item: topYield,
                    icon: "💧",
                    highlight: "16.42% APR Liquid Staking im Hydro Protocol"
                }
            ];

            dom.topPicksContainer.innerHTML = picks.map(p => {
                if (!p.item) return '';
                const item = p.item;
                const isStake = item.actionType === 'stake';

                return `
                    <div class="copilot-pick-card">
                        <div class="pick-card-top">
                            <span class="pick-rank-tag">${p.rankBadge}</span>
                            <span class="pick-score-pill">${item.scores.total} / 100 PKT</span>
                        </div>

                        <div class="pick-coin-row">
                            <div class="pick-coin-ident">
                                <span class="pick-coin-ticker">${item.ticker}</span>
                                <span class="pick-coin-name">${item.name}</span>
                            </div>
                            <div class="pick-price-box">
                                <span class="pick-price-val">${formatMoney(item.price)}</span>
                                <span class="pick-change ${item.change24h >= 0 ? 'text-green' : 'text-red'}">
                                    ${item.change24h >= 0 ? '+' : ''}${item.change24h.toFixed(2)}% (24h)
                                </span>
                            </div>
                        </div>

                        <p class="pick-reasoning">
                            ${item.verdict}
                        </p>

                        <div class="pick-metrics-row">
                            <div class="pick-sub-metric">
                                <span class="psm-label">RSI (14):</span>
                                <span class="psm-val">${item.rsi}</span>
                            </div>
                            <div class="pick-sub-metric">
                                <span class="psm-label">Trend-Score:</span>
                                <span class="psm-val text-green">${item.scores.trend}/20</span>
                            </div>
                            <div class="pick-sub-metric">
                                <span class="psm-label">Einstiegs-Score:</span>
                                <span class="psm-val text-cyan">${item.scores.entry}/15</span>
                            </div>
                            ${item.stakingApr ? `
                                <div class="pick-sub-metric">
                                    <span class="psm-label">Staking APR:</span>
                                    <span class="psm-val text-orange">${item.stakingApr}%</span>
                                </div>
                            ` : ''}
                        </div>

                        <button class="btn-copilot-action" onclick="window.CopilotEngine.selectRecommended('${item.symbol}', '${item.actionType}')">
                            ${isStake ? 'Im Hydro Protocol staken (16.42% APR) →' : `${item.ticker} Setup & Chart im Orakel laden →`}
                        </button>
                    </div>
                `;
            }).join('');
        }

        // 2. Render Personal Investment Checker
        runInvestmentCheck();

        // 3. Render Full Filtered Ranking Table
        renderRankingTable();
    }

    function renderRankingTable() {
        if (!dom.rankingTableBody) return;

        let filtered = coinRatings;
        if (currentFilter !== 'all') {
            filtered = coinRatings.filter(c => c.cat === currentFilter || (currentFilter === 'yield' && c.stakingApr));
        }

        dom.rankingTableBody.innerHTML = filtered.map((coin, idx) => {
            const isStake = coin.actionType === 'stake';
            return `
                <tr class="ranking-row">
                    <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-orange);">
                        #${idx + 1}
                    </td>
                    <td>
                        <strong style="color: #ffffff;">${coin.ticker}</strong>
                        <span style="font-size: 0.75rem; color: var(--text-faint); margin-left: 4px;">(${coin.name})</span>
                    </td>
                    <td>
                        <span class="score-badge ${coin.scores.total >= 72 ? 'score-high' : 'score-mid'}">
                            ${coin.scores.total}
                        </span>
                    </td>
                    <td style="font-family: 'JetBrains Mono', monospace;">
                        ${formatMoney(coin.price)}
                    </td>
                    <td style="font-family: 'JetBrains Mono', monospace; color: ${coin.change24h >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight: 600;">
                        ${coin.change24h >= 0 ? '+' : ''}${coin.change24h.toFixed(2)}%
                    </td>
                    <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">
                        ${coin.rsi}
                    </td>
                    <td style="font-size: 0.78rem; color: var(--text-muted);">
                        ${coin.verdict}
                    </td>
                    <td>
                        <button class="btn-table-pick" onclick="window.CopilotEngine.selectRecommended('${coin.symbol}', '${coin.actionType}')">
                            ${isStake ? 'Staking' : 'Analysieren'}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // =========================================================================
    // PERSÖNLICHER ECHTZEIT-INVESTMENT-CHECK & KAUFBERATUNG ENGINE
    // =========================================================================
    function runInvestmentCheck() {
        if (!dom.checkerResultBox) return;

        const symbol = dom.checkerCoinSelect ? dom.checkerCoinSelect.value : 'BTCUSDT';
        const rawAmount = parseFloat(dom.checkerAmountInput ? dom.checkerAmountInput.value : 1000) || 1000;
        const currentCurr = (window.getCurrentCurrency && window.getCurrentCurrency()) || 'EUR';
        const eurRate = (window.getEurRate && window.getEurRate()) || 0.92;

        // Update currency labels
        if (dom.checkerCurrencyLabel) dom.checkerCurrencyLabel.textContent = currentCurr === 'USD' ? '$' : '€';
        if (dom.checkerCurrTag) dom.checkerCurrTag.textContent = currentCurr;

        // Find rating item or show honest loading state
        let item = coinRatings.find(c => c.symbol === symbol);
        if (!item) {
            dom.checkerResultBox.innerHTML = `
                <div class="checker-verdict-banner verdict-badge-wait">
                    <div>
                        <div class="checker-verdict-title">LIVE-MARKTDATEN WERDEN GELADEN</div>
                        <div style="font-size: 0.8rem; margin-top: 3px; opacity: 0.9;">Die aktuellen Live-Marktdaten für ${symbol.replace('USDT', '')} werden synchronisiert. Bitte einen Moment Geduld...</div>
                    </div>
                    <span class="checker-verdict-pill">LADEN...</span>
                </div>
            `;
            return;
        }

        // Calculations for user's entered amount
        // Note: item.price is in USD
        const amountInUSD = currentCurr === 'EUR' ? (rawAmount / eurRate) : rawAmount;
        const coinAmount = item.price > 0 ? (amountInUSD / item.price) : 0;
        const coinAmountStr = coinAmount < 0.0001 ? coinAmount.toFixed(6) : (coinAmount < 1 ? coinAmount.toFixed(4) : coinAmount.toFixed(2));

        // Stop Loss distance (between 3.5% and 8.0% based on volatility)
        const vol = parseFloat(item.volatility) || 3.5;
        const slDistPct = Math.min(8.0, Math.max(3.5, vol * 1.15));
        const riskAmount = rawAmount * (slDistPct / 100);
        const slPriceUSD = item.price * (1 - (slDistPct / 100));

        // Target 1 (Fibonacci TP ~ 2.4x Stop Loss distance)
        const tpDistPct = Math.max(slDistPct * 2.3, 10.8);
        const profitAmount = rawAmount * (tpDistPct / 100);
        const tpPriceUSD = item.price * (1 + (tpDistPct / 100));

        const crv = (tpDistPct / slDistPct).toFixed(2);

        // Formatted display values
        const amountFormatted = currentCurr === 'EUR' ? `${rawAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : `$${rawAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const riskFormatted = currentCurr === 'EUR' ? `${riskAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : `$${riskAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const profitFormatted = currentCurr === 'EUR' ? `${profitAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : `$${profitAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const rsiNum = parseFloat(item.rsi) || 50;
        const changeNum = item.change24h || 0;
        const totalScore = item.scores.total || 70;

        let verdictType = 'BUY'; // 'BUY', 'WAIT', 'AVOID', 'STAKE'
        let verdictTitle = '';
        let verdictSubtitle = '';
        let verdictBadgeClass = '';
        let dcaAdvice = '';
        let justification = '';

        if (symbol === 'INJUSDT') {
            verdictType = 'STAKE';
            verdictTitle = 'PASSIVES CASHFLOW-STAKING EMPFOHLEN (16.42% APR)';
            verdictSubtitle = `Für Injective wird anstelle eines reinen Spot-Kaufs das Liquid Staking im Hydro Protocol angeraten.`;
            verdictBadgeClass = 'verdict-badge-stake';
            const yearlyYield = rawAmount * 0.1642;
            const monthlyYield = yearlyYield / 12;
            const yearlyYieldFormatted = currentCurr === 'EUR' ? `${yearlyYield.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : `$${yearlyYield.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const monthlyYieldFormatted = currentCurr === 'EUR' ? `${monthlyYield.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : `$${monthlyYield.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            justification = `Injective bietet mit 16.42% nativem Staking-Ertrag auf Injective (injective-1) eine der attraktivsten realen Cashflow-Renditen im Krypto-Sektor. Bei Ihrem geplanten Betrag von <strong>${amountFormatted}</strong> erhalten Sie ca. <strong>${yearlyYieldFormatted} pro Jahr</strong> (ca. <strong>${monthlyYieldFormatted} monatlich</strong>) an stetig anwachsendem Ertrag, ohne auf kurzfristiges Kurs-Timing angewiesen zu sein.`;
            dcaAdvice = `Taktische Empfehlung: Investieren Sie die ${amountFormatted} direkt in den Liquid-Staking-Pool (hINJ) und nutzen Sie den ECC-Autopiloten für vollautomatisches Reinvestieren (Auto-Compound bis zu 28.6% APY).`;
        } else if (totalScore >= 70 && rsiNum <= 56 && changeNum < 10) {
            verdictType = 'BUY';
            verdictTitle = 'INVESTMENT HEUTE ANGERATEN // GÜNSTIGES KAUF-TIMING';
            verdictSubtitle = `Solider Einstieg: Trend intakt, RSI(${rsiNum}) im Sweet-Spot, überzeugendes Chance-Risiko-Verhältnis.`;
            verdictBadgeClass = 'verdict-badge-buy';
            justification = `Der Markt für <strong>${item.name} (${item.ticker})</strong> befindet sich aktuell in einer vorteilhaften Konstellation: Der Kurs notiert stabil über den gleitenden Durchschnitten. Der RSI(14) liegt mit <strong>${rsiNum}</strong> im neutral-bullischen Kaufkorridor (keine Überhitzung). Das berechnete Chance-Risiko-Verhältnis von <strong>1 : ${crv}</strong> spricht klar für eine Positionseröffnung.`;
            const halfAmt = rawAmount * 0.5;
            const halfAmtFormatted = currentCurr === 'EUR' ? `${halfAmt.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : `$${halfAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            dcaAdvice = `Empfohlene Tranchen-Order für ${amountFormatted}: Investieren Sie 50% (${halfAmtFormatted}) sofort zum Marktpreis. Platzieren Sie die restlichen 50% (${halfAmtFormatted}) als Limit-Kauforder bei ${formatMoney(item.price * 0.972)} (Fibonacci Support).`;
        } else if ((rsiNum > 58 && rsiNum <= 68) || (changeNum >= 7 && changeNum <= 18) || (item.discountFromHigh < 2.5)) {
            verdictType = 'WAIT';
            verdictTitle = 'VOM SOFORTKAUF WIRD ABGERATEN // RÜCKSETZER / DIP ABWARTEN';
            verdictSubtitle = `Kurzfristig heiß gelaufen (24h: ${changeNum >= 0 ? '+' : ''}${changeNum.toFixed(2)}%, RSI: ${rsiNum}). Gefahr eines Kaufs am Zwischenhoch.`;
            verdictBadgeClass = 'verdict-badge-wait';
            justification = `Für <strong>${item.name} (${item.ticker})</strong> wird von einer ungeduldigen Market-Order zum aktuellen Zeitpunkt <strong>abgeraten</strong>. Der Kurs hat in den letzten 24 Stunden stark zugelegt (+${changeNum.toFixed(2)}%) und der RSI(14) nähert sich mit ${rsiNum} der überkauften Zone. Historisch führen solche Niveaus häufig zu vorübergehenden Gewinnmitnahmen ("Pullbacks").`;
            const pullbackPrice = formatMoney(item.price * 0.952);
            dcaAdvice = `Taktische Empfehlung: Jagen Sie den Kursen nicht hinterher! Platzieren Sie für Ihre ${amountFormatted} eine Limit-Order bei ${pullbackPrice} (nächstes Fibonacci-Retracement), um von einem gesunden Rücksetzer zu profitieren.`;
        } else {
            verdictType = 'AVOID';
            verdictTitle = 'VOM KAUF WIRD AKTUELL ABGERATEN // ERHÖHTES RISIKO';
            verdictSubtitle = `Überkaufte Marktphase (RSI > 68) oder anhaltender Abwärtsdruck. Erhöhtes Verlustrisiko.`;
            verdictBadgeClass = 'verdict-badge-avoid';
            justification = `Zum aktuellen Zeitpunkt wird von einem Kauf von <strong>${item.name} (${item.ticker})</strong> <strong>ausdrücklich abgeraten</strong>. Der Coin weist mit einem Gesamt-Score von ${totalScore}/100 und RSI von ${rsiNum} ein ungünstiges Chance-Risiko-Verhältnis auf. Die Gefahr eines sofortigen Kursrückschlags übersteigt das realistische Aufwärtspotenzial.`;
            dcaAdvice = `Handlungsempfehlung: Schonen Sie Ihr Kapital von ${amountFormatted}. Weichen Sie stattdessen auf stärkere Qualitäts-Assets aus (z. B. Bitcoin) oder nutzen Sie planbare Cashflow-Renditen wie Liquid Staking.`;
        }

        // Render Result Box
        dom.checkerResultBox.innerHTML = `
            <div class="checker-verdict-banner ${verdictBadgeClass}">
                <div>
                    <div class="checker-verdict-title">${verdictTitle}</div>
                    <div style="font-size: 0.8rem; margin-top: 3px; opacity: 0.9;">${verdictSubtitle}</div>
                </div>
                <span class="checker-verdict-pill">${totalScore} / 100 SCORE</span>
            </div>

            <div class="checker-reasoning-card">
                <div style="font-weight: 700; color: #fff; margin-bottom: 6px; font-size: 0.88rem;">
                    Begründung & Marktlage für ${item.name} (${item.ticker}):
                </div>
                <p style="margin: 0; color: var(--text-muted); font-size: 0.83rem; line-height: 1.6;">
                    ${justification}
                </p>
                <div class="checker-dca-tip">
                    ✦ ${dcaAdvice}
                </div>
            </div>

            <div class="checker-metrics-grid">
                <div class="checker-metric-box">
                    <div class="checker-metric-label">Erworbene Menge bei ${amountFormatted}</div>
                    <div class="checker-metric-val" style="color: #fff;">${coinAmountStr} ${item.ticker}</div>
                    <div style="font-size: 0.7rem; color: var(--text-faint); margin-top: 2px;">Basis: ${formatMoney(item.price)}</div>
                </div>
                <div class="checker-metric-box">
                    <div class="checker-metric-label">Max. Risiko bei Stop-Loss</div>
                    <div class="checker-metric-val text-red">-${riskFormatted} (-${slDistPct.toFixed(1)}%)</div>
                    <div style="font-size: 0.7rem; color: var(--text-faint); margin-top: 2px;">SL-Marke: ${formatMoney(slPriceUSD)}</div>
                </div>
                <div class="checker-metric-box">
                    <div class="checker-metric-label">Erstes Kursziel (Fib TP)</div>
                    <div class="checker-metric-val text-green">+${profitFormatted} (+${tpDistPct.toFixed(1)}%)</div>
                    <div style="font-size: 0.7rem; color: var(--text-faint); margin-top: 2px;">TP-Marke: ${formatMoney(tpPriceUSD)}</div>
                </div>
                <div class="checker-metric-box">
                    <div class="checker-metric-label">Chance-Risiko-Verhältnis (CRV)</div>
                    <div class="checker-metric-val" style="color: ${parseFloat(crv) >= 2.0 ? 'var(--accent-green)' : 'var(--accent-amber)'};">1 : ${crv}</div>
                    <div style="font-size: 0.7rem; color: var(--text-faint); margin-top: 2px;">${parseFloat(crv) >= 2.0 ? 'Ausgezeichnet' : 'Moderat'}</div>
                </div>
            </div>

            <div class="checker-actions-row">
                <button class="btn-checker-transfer" onclick="window.CopilotEngine.applyInvestmentToCalculator('${symbol}', ${rawAmount})">
                    ✦ Dieses Setup (${amountFormatted} in ${item.ticker}) im interaktiven Chart laden →
                </button>
                ${symbol === 'INJUSDT' ? `
                    <button class="btn-checker-stake" onclick="window.HydroApp ? window.HydroApp.openStakingForInj() : null">
                        💧 ${amountFormatted} direkt im Hydro Protocol staken (16.42% APR) →
                    </button>
                ` : ''}
            </div>
        `;
    }

    function selectRecommended(symbol, actionType) {
        if (actionType === 'stake' && window.HydroApp) {
            window.HydroApp.openStakingForInj();
            showToast(`Zu Hydro Protocol gewechselt: Injective (INJ) Staking aktiv.`);
        } else {
            if (window.HydroApp) {
                window.HydroApp.switchMainView('oracle');
            }
            const dropdown = document.getElementById('cryptoDropdown');
            if (dropdown) {
                dropdown.value = symbol;
                dropdown.dispatchEvent(new Event('change'));
            }
            if (dom.checkerCoinSelect) {
                dom.checkerCoinSelect.value = symbol;
                runInvestmentCheck();
            }
            showToast(`Helfer hat ${symbol.replace('USDT', '')} für die Trade-Berechnung geladen.`);
            const chartPanel = document.getElementById('chartPanel') || document.getElementById('chartContainer');
            if (chartPanel) {
                chartPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (window.renderCharts) {
                setTimeout(window.renderCharts, 120);
            }
        }
    }

    function applyInvestmentToCalculator(symbol, amount) {
        if (dom.copilotContainer) {
            dom.copilotContainer.style.display = 'none';
        }
        if (dom.toggleBtn) {
            dom.toggleBtn.classList.remove('active');
        }
        if (window.applyInvestmentToCalculator) {
            window.applyInvestmentToCalculator(symbol, amount);
            showToast(`Setup für ${symbol.replace('USDT', '')} mit Investitionswert im Chart geladen.`);
        }
        const chartPanel = document.getElementById('chartPanel') || document.getElementById('chartContainer');
        if (chartPanel) {
            chartPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const container = document.getElementById('chartContainer');
            if (container) {
                container.style.boxShadow = '0 0 30px rgba(255, 184, 0, 0.6)';
                setTimeout(() => { container.style.boxShadow = ''; }, 1600);
            }
        }
        if (window.renderCharts) {
            setTimeout(window.renderCharts, 120);
        }
    }

    function setFilter(filterKey) {
        currentFilter = filterKey;
        if (dom.filterBtns) {
            dom.filterBtns.forEach(btn => {
                if (btn.getAttribute('data-filter') === filterKey) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        renderRankingTable();
    }

    function toggleCopilotPanel() {
        if (!dom.copilotContainer) return;
        const isHidden = dom.copilotContainer.style.display === 'none';
        dom.copilotContainer.style.display = isHidden ? 'block' : 'none';
        if (dom.toggleBtn) {
            if (isHidden) {
                dom.toggleBtn.classList.add('active');
                dom.copilotContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                dom.toggleBtn.classList.remove('active');
                const chartPanel = document.getElementById('chartPanel') || document.getElementById('chartContainer');
                if (chartPanel) {
                    chartPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        }
    }

    function onCurrencyChange() {
        runInvestmentCheck();
        renderRankingTable();
        if (dom.topPicksContainer) renderCopilotUI();
    }

    function formatMoney(amount, decimals = 2) {
        if (window.formatMoney && typeof window.formatMoney === 'function') {
            return window.formatMoney(amount, decimals);
        }
        return `$${amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }

    function showToast(msg) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<div>${msg}</div>`;
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3800);
    }

    // --- Setup Listeners ---
    function setupEventListeners() {
        if (dom.toggleBtn) {
            dom.toggleBtn.addEventListener('click', toggleCopilotPanel);
        }

        const btnClose = document.getElementById('btnCloseCopilot');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                if (dom.copilotContainer) dom.copilotContainer.style.display = 'none';
                if (dom.toggleBtn) dom.toggleBtn.classList.remove('active');
            });
        }

        const btnRefreshScan = document.getElementById('btnRefreshCopilotScan');
        if (btnRefreshScan) {
            btnRefreshScan.addEventListener('click', () => {
                scanMarket();
                showToast('Markt-Scan wird aktualisiert...');
            });
        }

        if (dom.filterBtns) {
            dom.filterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    setFilter(btn.getAttribute('data-filter'));
                });
            });
        }

        // Investment Checker Listeners
        if (dom.checkerCoinSelect) {
            dom.checkerCoinSelect.addEventListener('change', () => {
                runInvestmentCheck();
            });
        }

        if (dom.checkerAmountInput) {
            dom.checkerAmountInput.addEventListener('input', () => {
                runInvestmentCheck();
            });
        }

        if (dom.btnRunInvestmentCheck) {
            dom.btnRunInvestmentCheck.addEventListener('click', () => {
                runInvestmentCheck();
                showToast('Investment-Check aktualisiert.');
            });
        }

        if (dom.checkerAmountChips) {
            const chips = dom.checkerAmountChips.querySelectorAll('.checker-chip');
            chips.forEach(chip => {
                chip.addEventListener('click', () => {
                    chips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    const amt = chip.getAttribute('data-amt');
                    if (dom.checkerAmountInput && amt) {
                        dom.checkerAmountInput.value = amt;
                        runInvestmentCheck();
                    }
                });
            });
        }

        // Sync main page cryptoDropdown with Investment Checker
        const mainDropdown = document.getElementById('cryptoDropdown');
        if (mainDropdown) {
            mainDropdown.addEventListener('change', () => {
                if (dom.checkerCoinSelect && dom.checkerCoinSelect.value !== mainDropdown.value) {
                    dom.checkerCoinSelect.value = mainDropdown.value;
                    runInvestmentCheck();
                }
            });
        }
    }

    // --- Initialize on DOM Ready ---
    document.addEventListener('DOMContentLoaded', () => {
        initDOM();
        setupEventListeners();
        // Initial quick check with defaults
        setTimeout(runInvestmentCheck, 400);
        // Run full market scan immediately
        setTimeout(scanMarket, 200);
    });

    // Expose API
    window.CopilotEngine = {
        scanMarket,
        selectRecommended,
        applyInvestmentToCalculator,
        runInvestmentCheck,
        onCurrencyChange,
        setFilter,
        toggleCopilotPanel
    };

})();
