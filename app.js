/**
 * FibCrypto Oracle - Main Application Controller
 * Manages WebSocket & Proxy REST data fetching for 100% REAL LIVE MARKET DATA,
 * interactive canvas chart rendering, dual currency conversion ($ USD / € EUR),
 * 30-day historical signal audit verification, and Parallax Q2 UI state.
 * 
 * Includes audit remediation fixes for ERR_17 through ERR_26 and ERR_32 through ERR_36.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- State Variables ---
    let currentSymbol = 'BTCUSDT';
    let currentTimeframe = '4h';
    let candles = [];
    let ws = null;
    let wsReconnectAttempts = 0;
    let wsReconnectTimeout = null;
    let pollInterval = null;
    let currentPrice = 0;
    let alertsLog = [];
    let toastContainer = document.getElementById('toastContainer');

    // FIX ERR_34: Dual Currency State ($ USD / € EUR)
    let currentCurrency = 'USD'; // 'USD' or 'EUR'
    let eurRate = 0.92; // 1 USD = 0.92 EUR default rate (updated dynamically via API)

    // FIX ERR_26 / FIX ERR_33: Interactive Hover State
    let hoveredCandleIndex = null;
    let mousePos = { x: -1, y: -1 };
    let chartAnimFrameId = null;
    let currentTicker24h = null;

    // --- DOM Elements ---
    const currencyToggleBtn = document.getElementById('currencyToggleBtn');
    const currUsdLabel = document.getElementById('currUsdLabel');
    const currEurLabel = document.getElementById('currEurLabel');
    const investInputLabel = document.getElementById('investInputLabel');

    let assetBtns = document.querySelectorAll('.asset-btn');
    const assetSelectorEl = document.getElementById('assetSelector');
    const cryptoDropdown = document.getElementById('cryptoDropdown');
    const cryptoActiveBadgeEl = document.getElementById('cryptoActiveBadge');
    const chartActiveTagEl = document.getElementById('chartActiveTag');
    const tfBtns = document.querySelectorAll('.tf-btn');
    const connectionStatusEl = document.getElementById('connectionStatus');

    // Dual Asset Class Elements & State
    let currentAssetClass = 'crypto'; // 'crypto' or 'stock'
    const btnClassCrypto = document.getElementById('btnClassCrypto');
    const btnClassStocks = document.getElementById('btnClassStocks');
    const stockStatusBadge = document.getElementById('stockStatusBadge');
    const cryptoArbitrageBadge = document.getElementById('cryptoArbitrageBadge');
    const stockMarketHoursBadge = document.getElementById('stockMarketHoursBadge');
    const assetSelectionHeading = document.getElementById('assetSelectionHeading');

    const CRYPTO_ASSETS = [
        { symbol: 'BTCUSDT', name: 'Bitcoin', rank: 1, base: 'BTC' },
        { symbol: 'ETHUSDT', name: 'Ethereum', rank: 2, base: 'ETH' },
        { symbol: 'SOLUSDT', name: 'Solana', rank: 3, base: 'SOL' },
        { symbol: 'BNBUSDT', name: 'Binance Coin', rank: 4, base: 'BNB' },
        { symbol: 'XRPUSDT', name: 'Ripple', rank: 5, base: 'XRP' },
        { symbol: 'ADAUSDT', name: 'Cardano', rank: 6, base: 'ADA' },
        { symbol: 'DOGEUSDT', name: 'Dogecoin', rank: 7, base: 'DOGE' },
        { symbol: 'AVAXUSDT', name: 'Avalanche', rank: 8, base: 'AVAX' },
        { symbol: 'LINKUSDT', name: 'Chainlink', rank: 9, base: 'LINK' },
        { symbol: 'DOTUSDT', name: 'Polkadot', rank: 10, base: 'DOT' },
        { symbol: 'SUIUSDT', name: 'Sui', rank: 11, base: 'SUI' },
        { symbol: 'NEARUSDT', name: 'NEAR Protocol', rank: 12, base: 'NEAR' },
        { symbol: 'LTCUSDT', name: 'Litecoin', rank: 13, base: 'LTC' },
        { symbol: 'POLUSDT', name: 'Polygon', rank: 14, base: 'POL' },
        { symbol: 'SHIBUSDT', name: 'Shiba Inu', rank: 15, base: 'SHIB' },
        { symbol: 'INJUSDT', name: 'Injective', rank: 16, base: 'INJ' }
    ];

    const STOCK_ASSETS = [
        { symbol: 'SAP.DE', name: 'SAP SE', exchange: 'XETRA', currency: 'EUR', chip: 'SAP' },
        { symbol: 'SIE.DE', name: 'Siemens AG', exchange: 'XETRA', currency: 'EUR', chip: 'SIE' },
        { symbol: 'AIR.DE', name: 'Airbus SE', exchange: 'XETRA', currency: 'EUR', chip: 'AIR' },
        { symbol: 'ALV.DE', name: 'Allianz SE', exchange: 'XETRA', currency: 'EUR', chip: 'ALV' },
        { symbol: 'DTE.DE', name: 'Deutsche Telekom', exchange: 'XETRA', currency: 'EUR', chip: 'DTE' },
        { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD', chip: 'AAPL' },
        { symbol: 'MSFT', name: 'Microsoft Corp.', exchange: 'NASDAQ', currency: 'USD', chip: 'MSFT' },
        { symbol: 'NVDA', name: 'NVIDIA Corp.', exchange: 'NASDAQ', currency: 'USD', chip: 'NVDA' },
        { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', currency: 'USD', chip: 'TSLA' }
    ];

    const COIN_NAMES = {
        'BTCUSDT': 'Bitcoin',
        'ETHUSDT': 'Ethereum',
        'SOLUSDT': 'Solana',
        'BNBUSDT': 'Binance Coin',
        'XRPUSDT': 'Ripple',
        'ADAUSDT': 'Cardano',
        'DOGEUSDT': 'Dogecoin',
        'AVAXUSDT': 'Avalanche',
        'LINKUSDT': 'Chainlink',
        'DOTUSDT': 'Polkadot',
        'SUIUSDT': 'Sui',
        'NEARUSDT': 'NEAR Protocol',
        'LTCUSDT': 'Litecoin',
        'POLUSDT': 'Polygon',
        'MATICUSDT': 'Polygon',
        'SHIBUSDT': 'Shiba Inu',
        'INJUSDT': 'Injective',
        'SAP.DE': 'SAP SE',
        'SIE.DE': 'Siemens AG',
        'AIR.DE': 'Airbus SE',
        'ALV.DE': 'Allianz SE',
        'DTE.DE': 'Deutsche Telekom',
        'AAPL': 'Apple Inc.',
        'MSFT': 'Microsoft Corp.',
        'NVDA': 'NVIDIA Corp.',
        'TSLA': 'Tesla Inc.'
    };

    const bannerSymbolEl = document.getElementById('bannerSymbol');
    const livePriceEl = document.getElementById('livePrice');
    const liveChangeEl = document.getElementById('liveChange');
    const liveVolumeEl = document.getElementById('liveVolume');
    const liveVolumeUsdEl = document.getElementById('liveVolumeUsd');
    const swingHighLowEl = document.getElementById('swingHighLow');
    const swingDiffEl = document.getElementById('swingDiff');
    const riskRatingEl = document.getElementById('riskRating');
    const bbBandwidthEl = document.getElementById('bbBandwidth');

    const signalTimestampEl = document.getElementById('signalTimestamp');
    const oracleSignalBadgeEl = document.getElementById('oracleSignalBadge');
    const oracleSignalTextEl = document.getElementById('oracleSignalText');
    const confidenceValEl = document.getElementById('confidenceVal');
    const confidenceBarEl = document.getElementById('confidenceBar');
    
    // Signal Progress Bar Elements
    const signalStrengthPctValEl = document.getElementById('signalStrengthPctVal');
    const signalStrengthBarEl = document.getElementById('signalStrengthBar');

    // Profit & Trade Setup Elements
    const setupWarningBannerEl = document.getElementById('setupWarningBanner'); // FIX ERR_18
    const investAmountInput = document.getElementById('investAmountInput');
    const coinAmountInput = document.getElementById('coinAmountInput');
    const coinSymbolLabelEl = document.getElementById('coinSymbolLabel');
    const tradeEntryValEl = document.getElementById('tradeEntryVal');
    const calcCoinsValEl = document.getElementById('calcCoinsVal');
    const tradeStopLossValEl = document.getElementById('tradeStopLossVal');
    const tradeRiskAmountEl = document.getElementById('tradeRiskAmount');
    const tradeTp1ValEl = document.getElementById('tradeTp1Val');
    const tradeProfit1AmountEl = document.getElementById('tradeProfit1Amount');
    const tradeTp2ValEl = document.getElementById('tradeTp2Val');
    const tradeProfit2AmountEl = document.getElementById('tradeProfit2Amount');
    const crvBadgeEl = document.getElementById('crvBadge');

    const reasoningListEl = document.getElementById('reasoningList');
    const fibTableBodyEl = document.getElementById('fibTableBody');
    const historyTableBodyEl = document.getElementById('historyTableBody');
    const histWinRateBadgeEl = document.getElementById('histWinRateBadge');

    // Technical Indicators Elements
    const indRsiEl = document.getElementById('indRsi');
    const rsiStatusBadgeEl = document.getElementById('rsiStatusBadge');
    const rsiMeterFillEl = document.getElementById('rsiMeterFill');
    
    const macdStatusBadgeEl = document.getElementById('macdStatusBadge');
    const indMacdLineEl = document.getElementById('indMacdLine');
    const indMacdSignalEl = document.getElementById('indMacdSignal');
    const indMacdHistEl = document.getElementById('indMacdHist');

    const bbStatusBadgeEl = document.getElementById('bbStatusBadge');
    const indBbUpperEl = document.getElementById('indBbUpper');
    const indBbMiddleEl = document.getElementById('indBbMiddle');
    const indBbLowerEl = document.getElementById('indBbLower');

    const btWinRateEl = document.getElementById('btWinRate');
    const btSharpeEl = document.getElementById('btSharpe');
    const btDrawdownEl = document.getElementById('btDrawdown');
    const btTotalProfitEl = document.getElementById('btTotalProfit');
    const btnRunBacktest = document.getElementById('btnRunBacktest');

    const alertFeedEl = document.getElementById('alertFeed');

    const chartContainer = document.getElementById('chartContainer');
    const priceCanvas = document.getElementById('priceCanvas');
    const rsiCanvas = document.getElementById('rsiCanvas');
    const canvasTooltip = document.getElementById('canvasTooltip');
    const chartOverlayInfo = document.getElementById('chartOverlayInfo');

    let activeInputSource = 'usd'; // 'usd' or 'coin'

    // --- Asset & Currency Identification Helpers ---
    function isStockSymbol(sym = currentSymbol) {
        return STOCK_ASSETS.some(s => s.symbol === sym) || (sym && sym.endsWith('.DE')) || (sym && !sym.endsWith('USDT') && sym.length <= 6);
    }

    function isNativeEurAsset(sym = currentSymbol) {
        if (!sym) return false;
        if (sym.endsWith('.DE')) return true;
        const stock = STOCK_ASSETS.find(s => s.symbol === sym);
        return stock ? stock.currency === 'EUR' : false;
    }

    function getAssetTicker(sym = currentSymbol) {
        if (!sym) return '';
        if (sym.endsWith('USDT')) return sym.replace('USDT', '');
        if (sym.endsWith('.DE')) return sym.replace('.DE', '');
        return sym;
    }

    function formatSymbolName(sym) {
        if (!sym) return '';
        if (sym.endsWith('USDT')) {
            return sym.replace('USDT', '/USDT');
        }
        const stock = STOCK_ASSETS.find(s => s.symbol === sym);
        if (stock) {
            return `${stock.chip} (${stock.exchange})`;
        }
        return sym;
    }

    // --- Initialize ---
    init();

    function init() {
        renderAssetControls();
        setupEventListeners();
        selectSymbol('BTCUSDT', false);
        setupChartInteraction();
        fetchEurRate();
        fetchData();
        setupAutoRefresh();
    }

    // --- FIX ERR_34: Currency Helper Function (USD/EUR with native stock currency awareness) ---
    function formatMoney(amount, decimals = 2, sym = currentSymbol) {
        const num = (typeof amount === 'number') ? amount : parseFloat(String(amount).replace(/[^0-9.-]+/g, '')) || 0;
        const isEur = isNativeEurAsset(sym);
        if (isEur) {
            // German / European asset quoted natively in EUR
            if (currentCurrency === 'USD') {
                const amountUSD = (eurRate > 0) ? (num / eurRate) : num;
                return `$${amountUSD.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
            }
            return `€${num.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
        } else {
            // US Equities or Crypto quoted natively in USD/USDT
            if (currentCurrency === 'EUR') {
                const amountEUR = num * eurRate;
                return `€${amountEUR.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
            }
            return `$${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
        }
    }
    window.formatMoney = formatMoney;
    window.getCurrentCurrency = () => currentCurrency;
    window.getEurRate = () => eurRate;
    window.isStockSymbol = isStockSymbol;
    window.applyInvestmentToCalculator = function(symbol, amount) {
        if (window.HydroApp) window.HydroApp.switchMainView('oracle');
        if (cryptoDropdown) {
            cryptoDropdown.value = symbol;
            cryptoDropdown.dispatchEvent(new Event('change'));
        }
        if (investAmountInput && amount > 0) {
            investAmountInput.value = amount;
            activeInputSource = 'usd';
            investAmountInput.dispatchEvent(new Event('input'));
        }
        const setupCard = document.getElementById('tradeEntryVal');
        if (setupCard) {
            setupCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    // Navigation and section highlighting helper
    window.scrollToDashboardSection = function(sectionId) {
        if (window.HydroApp) window.HydroApp.switchMainView('oracle');
        const el = document.getElementById(sectionId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('highlight-section-pulse');
            setTimeout(() => {
                el.classList.remove('highlight-section-pulse');
            }, 1800);
        }
    };

    window.toggleAndScrollCopilot = function() {
        if (window.HydroApp) window.HydroApp.switchMainView('oracle');
        const cp = document.getElementById('copilotPanel');
        if (cp && cp.style.display === 'none') {
            if (window.CopilotEngine && typeof window.CopilotEngine.toggleCopilotPanel === 'function') {
                window.CopilotEngine.toggleCopilotPanel();
            } else {
                cp.style.display = 'block';
            }
        }
        window.scrollToDashboardSection('copilotPanel');
    };

    // --- FIX ERR_34 / FIX ERR_29: Fetch EUR/USD Exchange Rate ---
    async function fetchEurRate() {
        try {
            const resp = await fetch('/api/ticker?symbol=EURUSDT');
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.lastPrice) {
                    const price = parseFloat(data.lastPrice);
                    if (price > 0) eurRate = 1 / price;
                }
            }
        } catch(e) {
            // Fallback rate = 0.92
        }
    }

    // --- Dual Asset Class UI & Controls Renderer ---
    function renderAssetControls() {
        if (!assetSelectorEl || !cryptoDropdown) return;

        if (currentAssetClass === 'crypto') {
            if (assetSelectionHeading) assetSelectionHeading.textContent = 'KRYPTOWÄHRUNG WÄHLEN — TOP MÄRKTE (24/7 LIVE)';
            cryptoDropdown.innerHTML = CRYPTO_ASSETS.map(a => 
                `<option value="${a.symbol}" ${a.symbol === currentSymbol ? 'selected' : ''}>#${a.rank} ${a.base} — ${a.name}</option>`
            ).join('');

            assetSelectorEl.innerHTML = `<span class="chips-label">Direkt-Klick:</span>` + CRYPTO_ASSETS.map(a => 
                `<button type="button" class="asset-btn ${a.symbol === currentSymbol ? 'active' : ''}" data-symbol="${a.symbol}" data-tooltip="${a.name} (${a.base}) Handels-Chart laden" ${a.symbol === 'INJUSDT' ? 'style="border-color: rgba(0, 240, 255, 0.4);"' : ''}><span class="chip-rank">#${a.rank}</span> ${a.base}</button>`
            ).join('');

            if (cryptoArbitrageBadge) cryptoArbitrageBadge.style.display = 'inline-block';
            if (stockStatusBadge) stockStatusBadge.style.display = 'none';
            if (stockMarketHoursBadge) stockMarketHoursBadge.style.display = 'none';
        } else {
            if (assetSelectionHeading) assetSelectionHeading.textContent = 'AKTIEN WATCHLIST WÄHLEN — XETRA & US TECH';
            cryptoDropdown.innerHTML = STOCK_ASSETS.map(s => 
                `<option value="${s.symbol}" ${s.symbol === currentSymbol ? 'selected' : ''}>${s.chip} (${s.exchange}) — ${s.name} [${s.currency}]</option>`
            ).join('');

            assetSelectorEl.innerHTML = `<span class="chips-label">Direkt-Klick:</span>` + STOCK_ASSETS.map(s => 
                `<button type="button" class="asset-btn ${s.symbol === currentSymbol ? 'active' : ''}" data-symbol="${s.symbol}" data-tooltip="${s.name} (${s.exchange}) Chart & Fibonacci-Analyse"><span class="chip-rank">${s.exchange}</span> ${s.chip}</button>`
            ).join('');

            if (cryptoArbitrageBadge) cryptoArbitrageBadge.style.display = 'none';
            if (stockStatusBadge) stockStatusBadge.style.display = 'inline-block';
            if (stockMarketHoursBadge) stockMarketHoursBadge.style.display = 'inline-block';
        }

        assetBtns = document.querySelectorAll('.asset-btn');
    }

    function switchAssetClass(newClass) {
        if (currentAssetClass === newClass) return;
        currentAssetClass = newClass;

        if (btnClassCrypto && btnClassStocks) {
            if (newClass === 'crypto') {
                btnClassCrypto.classList.add('active');
                btnClassStocks.classList.remove('active');
            } else {
                btnClassCrypto.classList.remove('active');
                btnClassStocks.classList.add('active');
            }
        }

        renderAssetControls();
        const defaultSymbol = (newClass === 'crypto') ? 'BTCUSDT' : 'SAP.DE';
        selectSymbol(defaultSymbol, true);

        const label = newClass === 'crypto' ? 'Krypto Top 16 (24/7 Live)' : 'Aktien Watchlist (XETRA & US)';
        showToast(`Asset-Klasse gewechselt: ${label}`);
    }
    window.switchAssetClass = switchAssetClass;

    // Unified Symbol Selector Handler
    function selectSymbol(sym, triggerFetch = true) {
        currentSymbol = sym;
        const isStock = isStockSymbol(sym);

        const targetClass = isStock ? 'stock' : 'crypto';
        if (currentAssetClass !== targetClass) {
            currentAssetClass = targetClass;
            if (btnClassCrypto && btnClassStocks) {
                if (targetClass === 'crypto') {
                    btnClassCrypto.classList.add('active');
                    btnClassStocks.classList.remove('active');
                } else {
                    btnClassCrypto.classList.remove('active');
                    btnClassStocks.classList.add('active');
                }
            }
            renderAssetControls();
        }

        if (cryptoDropdown && cryptoDropdown.value !== sym) {
            cryptoDropdown.value = sym;
        }
        document.querySelectorAll('.asset-btn').forEach(b => {
            if (b.getAttribute('data-symbol') === sym) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        const ticker = getAssetTicker(currentSymbol);
        const coinName = COIN_NAMES[currentSymbol] || ticker;
        if (coinSymbolLabelEl) coinSymbolLabelEl.textContent = ticker;
        if (bannerSymbolEl) bannerSymbolEl.textContent = formatSymbolName(currentSymbol);
        if (cryptoActiveBadgeEl) cryptoActiveBadgeEl.textContent = isStock ? `${formatSymbolName(currentSymbol)} — ${coinName}` : `${formatSymbolName(currentSymbol)} (${coinName})`;
        if (chartActiveTagEl) chartActiveTagEl.textContent = formatSymbolName(currentSymbol);

        const injCta = document.getElementById('injHydroCtaBanner');
        if (injCta) {
            injCta.style.display = (sym === 'INJUSDT') ? 'flex' : 'none';
        }

        if (isStock) {
            if (ws) {
                try { ws.close(); } catch(e) {}
                ws = null;
            }
            if (cryptoArbitrageBadge) cryptoArbitrageBadge.style.display = 'none';
            if (stockStatusBadge) stockStatusBadge.style.display = 'inline-block';
            if (stockMarketHoursBadge) stockMarketHoursBadge.style.display = 'inline-block';
        } else {
            if (cryptoArbitrageBadge) cryptoArbitrageBadge.style.display = 'inline-block';
            if (stockStatusBadge) stockStatusBadge.style.display = 'none';
            if (stockMarketHoursBadge) stockMarketHoursBadge.style.display = 'none';
        }

        if (triggerFetch) {
            showToast(`Asset gewechselt auf ${formatSymbolName(currentSymbol)} (${coinName})`);
            fetchData();
            if (!isStock) {
                connectWebSocket();
            }
        }
    }
    window.selectSymbol = selectSymbol;

    // --- Event Listeners ---
    function setupEventListeners() {
        // FIX ERR_34: Currency Switcher Button Listener ($ USD / € EUR)
        if (currencyToggleBtn) {
            currencyToggleBtn.addEventListener('click', () => {
                currentCurrency = (currentCurrency === 'USD') ? 'EUR' : 'USD';
                if (currUsdLabel && currEurLabel) {
                    if (currentCurrency === 'USD') {
                        currUsdLabel.className = 'active-curr';
                        currEurLabel.className = 'inactive-curr';
                    } else {
                        currUsdLabel.className = 'inactive-curr';
                        currEurLabel.className = 'active-curr';
                    }
                }
                currencyToggleBtn.setAttribute('data-tooltip', `Aktuell: ${currentCurrency === 'EUR' ? 'Euro (€)' : 'Dollar ($)'} • Klicken zum Wechseln`);
                if (investInputLabel) {
                    investInputLabel.textContent = `Investition in ${currentCurrency} (${currentCurrency === 'USD' ? '$' : '€'}):`;
                }
                showToast(`Währung gewechselt: Alle Kurse & Berechnungen auf ${currentCurrency === 'EUR' ? 'Euro (€ EUR)' : 'US-Dollar ($ USD)'} umgestellt`);
                processAndRenderAll();
                if (window.CopilotEngine && typeof window.CopilotEngine.onCurrencyChange === 'function') {
                    window.CopilotEngine.onCurrencyChange();
                }
            });
        }

        // Asset Class Switcher Buttons (Crypto vs Stocks)
        if (btnClassCrypto) {
            btnClassCrypto.addEventListener('click', () => switchAssetClass('crypto'));
        }
        if (btnClassStocks) {
            btnClassStocks.addEventListener('click', () => switchAssetClass('stock'));
        }

        // Top Assets Dropdown Listener
        if (cryptoDropdown) {
            cryptoDropdown.addEventListener('change', (e) => {
                selectSymbol(e.target.value);
            });
        }

        // Delegated Quick Asset Selector Chips
        if (assetSelectorEl) {
            assetSelectorEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.asset-btn');
                if (btn) {
                    const sym = btn.getAttribute('data-symbol');
                    if (sym) selectSymbol(sym);
                }
            });
        }

        // Timeframe Selector
        tfBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tfBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTimeframe = btn.getAttribute('data-tf');
                showToast(`Zeitrahmen geändert: ${currentTimeframe}`);
                fetchData();
            });
        });

        // Investment Input Realtime Listener ($ / € with native stock currency awareness)
        if (investAmountInput) {
            investAmountInput.addEventListener('input', () => {
                activeInputSource = 'usd';
                if (currentPrice > 0 && coinAmountInput) {
                    const inputVal = parseFloat(investAmountInput.value) || 0;
                    const isEur = isNativeEurAsset(currentSymbol);
                    let nativeCoinQty;
                    if (isEur) {
                        const valInEUR = (currentCurrency === 'USD') ? (eurRate > 0 ? inputVal * eurRate : inputVal) : inputVal;
                        nativeCoinQty = valInEUR / currentPrice;
                    } else {
                        const valInUSD = (currentCurrency === 'EUR') ? (eurRate > 0 ? inputVal / eurRate : inputVal) : inputVal;
                        nativeCoinQty = valInUSD / currentPrice;
                    }
                    coinAmountInput.value = nativeCoinQty < 1 ? nativeCoinQty.toFixed(5) : nativeCoinQty.toFixed(2);
                }
                processAndRenderAll();
            });
        }

        // Coin/Share Amount Input Realtime Listener
        if (coinAmountInput) {
            coinAmountInput.addEventListener('input', () => {
                activeInputSource = 'coin';
                if (currentPrice > 0 && investAmountInput) {
                    const coinVal = parseFloat(coinAmountInput.value) || 0;
                    const isEur = isNativeEurAsset(currentSymbol);
                    let displayVal;
                    if (isEur) {
                        const costEUR = coinVal * currentPrice;
                        displayVal = (currentCurrency === 'USD') ? (eurRate > 0 ? costEUR / eurRate : costEUR) : costEUR;
                    } else {
                        const costUSD = coinVal * currentPrice;
                        displayVal = (currentCurrency === 'EUR') ? costUSD * eurRate : costUSD;
                    }
                    investAmountInput.value = displayVal.toFixed(2);
                }
                processAndRenderAll();
            });
        }

        // Backtest Run Button
        if (btnRunBacktest) {
            btnRunBacktest.addEventListener('click', handleRunBacktest);
        }

        // Window & Container Resize Canvas Observer
        window.addEventListener('resize', () => {
            if (candles.length > 0) renderCharts();
        });

        if (window.ResizeObserver && chartContainer) {
            const ro = new ResizeObserver(() => {
                if (candles.length > 0) renderCharts();
            });
            ro.observe(chartContainer);
        }
    }

    // FIX ERR_35: Clean Toast Popup Notification Handler (NO EMOJIS, queued)
    function showToast(msgText) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<div>${msgText}</div>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }

    // --- FIX ERR_26 / FIX ERR_33: Interactive Chart Mouse & Touch Handler (Debounced with rAF) ---
    function setupChartInteraction() {
        if (!chartContainer) return;

        const updatePointer = (clientX, clientY) => {
            const rect = chartContainer.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;

            mousePos = { x, y };

            if (chartAnimFrameId) cancelAnimationFrame(chartAnimFrameId);
            chartAnimFrameId = requestAnimationFrame(() => {
                if (candles.length > 0) {
                    const isMobile = window.innerWidth <= 768;
                    const padding = { left: isMobile ? 8 : 15, right: isMobile ? 70 : 95 };
                    const chartW = rect.width - padding.left - padding.right;
                    const relX = mousePos.x - padding.left;

                    if (relX >= 0 && relX <= chartW) {
                        const index = Math.round((relX / chartW) * (candles.length - 1));
                        hoveredCandleIndex = Math.max(0, Math.min(candles.length - 1, index));
                    } else {
                        hoveredCandleIndex = null;
                    }

                    renderCharts();
                    updateCanvasTooltip(mousePos.x, mousePos.y);
                }
            });
        };

        const clearPointer = () => {
            if (chartAnimFrameId) cancelAnimationFrame(chartAnimFrameId);
            hoveredCandleIndex = null;
            mousePos = { x: -1, y: -1 };
            if (canvasTooltip) canvasTooltip.style.display = 'none';
            renderCharts();
        };

        chartContainer.addEventListener('mousemove', (e) => {
            updatePointer(e.clientX, e.clientY);
        });

        chartContainer.addEventListener('mouseleave', clearPointer);

        // Mobile Touch Gestures
        chartContainer.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length > 0) {
                updatePointer(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        chartContainer.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length > 0) {
                updatePointer(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        chartContainer.addEventListener('touchend', clearPointer, { passive: true });
        chartContainer.addEventListener('touchcancel', clearPointer, { passive: true });
    }

    // FIX ERR_26: Floating Tooltip Update on Canvas
    function updateCanvasTooltip(mouseX, mouseY) {
        if (hoveredCandleIndex === null || !candles[hoveredCandleIndex] || !canvasTooltip) {
            canvasTooltip.style.display = 'none';
            return;
        }

        const candle = candles[hoveredCandleIndex];
        const dateStr = new Date(candle.timestamp).toLocaleString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const isUp = candle.close >= candle.open;
        const changePct = (((candle.close - candle.open) / candle.open) * 100).toFixed(2);
        const changeColor = isUp ? 'var(--accent-green)' : 'var(--accent-red)';

        canvasTooltip.innerHTML = `
            <div style="font-weight:700; color:var(--accent-orange); margin-bottom:4px;">${dateStr}</div>
            <div>O: <strong>${formatMoney(candle.open)}</strong> H: <strong>${formatMoney(candle.high)}</strong></div>
            <div>L: <strong>${formatMoney(candle.low)}</strong> C: <strong style="color:${changeColor}">${formatMoney(candle.close)}</strong></div>
            <div style="margin-top:2px;">Änderung: <span style="color:${changeColor}">${changePct >= 0 ? '+' : ''}${changePct}%</span></div>
            <div>Volumen: ${candle.volume.toFixed(1)} ${getAssetTicker(currentSymbol)}</div>
        `;

        let posX = mouseX + 15;
        let posY = mouseY - 40;
        if (posX + 180 > chartContainer.clientWidth) posX = mouseX - 195;
        // Clamp bounds to prevent overflow on mobile screens
        posX = Math.max(6, Math.min(chartContainer.clientWidth - 190, posX));
        posY = Math.max(8, Math.min(chartContainer.clientHeight - 110, posY));

        canvasTooltip.style.left = `${posX}px`;
        canvasTooltip.style.top = `${posY}px`;
        canvasTooltip.style.display = 'block';
    }

    // --- FIX ERR_36 / Multi-Exchange & Equities Market Data Engine ---
    async function fetchData() {
        if (connectionStatusEl) connectionStatusEl.textContent = '● VERBINDUNG LÄUFT...';

        const isStock = isStockSymbol(currentSymbol);

        if (isStock) {
            // 1. Fetch real-time stock quote and market hours status
            try {
                const qResp = await fetch(`/api/stock/quote?symbol=${currentSymbol}`);
                if (qResp.ok) {
                    const qData = await qResp.json();
                    const priceVal = parseFloat(qData.lastPrice || qData.price || 0);
                    if (qData && priceVal > 0) {
                        currentTicker24h = {
                            priceChangePercent: qData.priceChangePercent != null ? qData.priceChangePercent : (qData.change_percent != null ? qData.change_percent : 0),
                            volume: qData.volume != null ? qData.volume : 0,
                            quoteVolume: (qData.volume != null) ? (parseFloat(qData.volume) * priceVal) : 0
                        };
                        currentPrice = priceVal;

                        const isOpen = qData.isOpen !== undefined ? qData.isOpen : (qData.marketState === 'OPEN');
                        const statusLabel = isOpen ? 'MARKT OFFEN' : 'MARKT GESCHLOSSEN';
                        const badgeText = `${qData.exchange || 'STOCK'} • ${statusLabel}`;
                        
                        if (stockStatusBadge) {
                            stockStatusBadge.textContent = badgeText;
                            stockStatusBadge.className = `stock-status-pill ${isOpen ? 'status-open' : 'status-closed'}`;
                            stockStatusBadge.style.display = 'inline-block';
                        }
                        if (stockMarketHoursBadge) {
                            stockMarketHoursBadge.textContent = `${qData.exchange || 'BÖRSE'}: ${statusLabel}`;
                            stockMarketHoursBadge.className = `stock-market-hours-badge ${isOpen ? 'status-open' : 'status-closed'}`;
                            stockMarketHoursBadge.style.display = 'inline-block';
                        }
                    }
                }
            } catch(e) {
                console.warn('Stock quote fetch error:', e);
            }

            // 2. Fetch stock klines (normalized OHLCV)
            try {
                const kResp = await fetch(`/api/stock/klines?symbol=${currentSymbol}&interval=${currentTimeframe}&limit=100`);
                if (kResp.ok) {
                    const kData = await kResp.json();
                    if (Array.isArray(kData) && kData.length > 0) {
                        candles = kData.map(item => ({
                            timestamp: item[0],
                            open: parseFloat(item[1]),
                            high: parseFloat(item[2]),
                            low: parseFloat(item[3]),
                            close: parseFloat(item[4]),
                            volume: parseFloat(item[5])
                        }));
                        currentPrice = candles[candles.length - 1].close;
                        if (connectionStatusEl) connectionStatusEl.textContent = '● BÖRSEN-FEED (15M/REALTIME) AKTIV';
                        processAndRenderAll();
                        return;
                    }
                }
            } catch(e) {
                console.warn('Stock klines fetch error:', e);
            }

            if (connectionStatusEl) connectionStatusEl.textContent = '● BÖRSENDATEN FEHLER';
            return;
        }

        // --- CRYPTO FEED ---
        // Arbitrage Spread across OKX, Kraken & Binance
        fetch(`/api/market/spread?symbol=${currentSymbol}`)
            .then(res => res.ok ? res.json() : null)
            .then(spreadData => {
                if (spreadData && cryptoArbitrageBadge && spreadData.spreadPct !== undefined) {
                    const spreadPct = parseFloat(spreadData.spreadPct) || 0;
                    cryptoArbitrageBadge.textContent = `Spread: ${spreadPct.toFixed(2)}% (${spreadData.status || 'OKX/Kraken/Binance'})`;
                    if (spreadData.spreadWarning) {
                        cryptoArbitrageBadge.classList.add('spread-warning');
                        cryptoArbitrageBadge.setAttribute('data-tooltip', `Achtung: Erhöhter Arbitrage-Spread von ${spreadPct.toFixed(2)}% zwischen Börsen!`);
                    } else {
                        cryptoArbitrageBadge.classList.remove('spread-warning');
                        cryptoArbitrageBadge.setAttribute('data-tooltip', `Multi-Börsen-Spread: ${spreadPct.toFixed(2)}% über OKX, Kraken & Binance`);
                    }
                }
            })
            .catch(() => {});

        // Real 24h ticker
        fetch(`/api/ticker?symbol=${currentSymbol}`)
            .then(res => res.ok ? res.json() : null)
            .then(tData => {
                if (tData) {
                    currentTicker24h = tData;
                    if (candles.length > 0) {
                        const swing = FibEngine.findSwingHighLow(candles);
                        const closes = candles.map(c => c.close);
                        const fib = FibEngine.calculateFibonacciLevels(swing.high, swing.low, swing.isUptrend);
                        const rsiSeries = FibEngine.calculateRSI(closes, 14);
                        const latestRsi = rsiSeries[rsiSeries.length - 1] || 50;
                        const macdData = FibEngine.calculateMACD(closes);
                        const bbData = FibEngine.calculateBollingerBands(closes);
                        const oracleSignal = FibEngine.generateOracleSignal(currentPrice, fib, latestRsi, macdData, bbData);
                        renderBanner(candles, swing, oracleSignal);
                    }
                }
            })
            .catch(() => {});

        // Fetch klines with failover chain (Proxy OKX/Kraken/Binance -> Binance direct)
        const endpoints = [
            `/api/klines?symbol=${currentSymbol}&interval=${currentTimeframe}&limit=100`,
            `https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=${currentTimeframe}&limit=100`,
            `https://api1.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=${currentTimeframe}&limit=100`
        ];

        let loadedData = null;

        for (const url of endpoints) {
            try {
                const resp = await fetch(url);
                if (resp.ok) {
                    const data = await resp.json();
                    if (Array.isArray(data) && data.length > 0) {
                        loadedData = data;
                        break;
                    }
                }
            } catch (e) {
                // Try next endpoint in failover chain
            }
        }

        if (loadedData) {
            candles = loadedData.map(item => ({
                timestamp: item[0],
                open: parseFloat(item[1]),
                high: parseFloat(item[2]),
                low: parseFloat(item[3]),
                close: parseFloat(item[4]),
                volume: parseFloat(item[5])
            }));

            currentPrice = candles[candles.length - 1].close;
            if (connectionStatusEl) connectionStatusEl.textContent = '● ALL SYSTEMS NOMINAL';
            processAndRenderAll();
        } else {
            console.error('All live REST endpoints failed.');
            if (connectionStatusEl) connectionStatusEl.textContent = '● VERBINDUNGSFEHLER';
        }
    }

    // --- FIX ERR_32: Connect WebSocket for Millisecond Ticker with Auto-Reconnect Exponential Backoff ---
    function connectWebSocket() {
        if (isStockSymbol(currentSymbol)) return;
        if (ws) {
            try { ws.close(); } catch(e) {}
        }
        if (wsReconnectTimeout) {
            clearTimeout(wsReconnectTimeout);
            wsReconnectTimeout = null;
        }

        try {
            const streamName = `${currentSymbol.toLowerCase()}@ticker`;
            ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);

            ws.onopen = () => {
                wsReconnectAttempts = 0;
                if (connectionStatusEl) connectionStatusEl.textContent = '● STREAM AKTIV';
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.c) {
                    const newPrice = parseFloat(msg.c);
                    if (msg.P !== undefined) {
                        currentTicker24h = {
                            priceChangePercent: msg.P,
                            volume: msg.v,
                            quoteVolume: msg.q
                        };
                    }
                    if (newPrice !== currentPrice && candles.length > 0) {
                        currentPrice = newPrice;
                        candles[candles.length - 1].close = newPrice;
                        if (newPrice > candles[candles.length - 1].high) candles[candles.length - 1].high = newPrice;
                        if (newPrice < candles[candles.length - 1].low) candles[candles.length - 1].low = newPrice;
                        
                        if (connectionStatusEl) connectionStatusEl.textContent = '● STREAM AKTIV';
                        processAndRenderAll();
                    }
                }
            };

            ws.onerror = (e) => {
                console.warn('WebSocket stream connection error.');
            };

            ws.onclose = () => {
                if (isStockSymbol(currentSymbol)) return;
                wsReconnectAttempts++;
                const delay = Math.min(30000, Math.pow(2, wsReconnectAttempts) * 1000);
                if (connectionStatusEl) connectionStatusEl.textContent = `● RECONNECTING (${Math.round(delay/1000)}s)...`;
                wsReconnectTimeout = setTimeout(() => {
                    connectWebSocket();
                }, delay);
            };

        } catch (e) {
            console.warn('WS Connection failed:', e);
        }
    }

    function setupAutoRefresh() {
        if (!isStockSymbol(currentSymbol)) {
            connectWebSocket();
        }
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(() => {
            fetchData();
        }, 5000);
    }

    // --- Processing & Rendering Master Controller ---
    function processAndRenderAll() {
        if (!candles || candles.length === 0) return;

        const closes = candles.map(c => c.close);
        
        // 1. Engine Calculations
        const swing = FibEngine.findSwingHighLow(candles);
        const fib = FibEngine.calculateFibonacciLevels(swing.high, swing.low, swing.isUptrend);
        const rsiSeries = FibEngine.calculateRSI(closes, 14);
        const latestRsi = rsiSeries[rsiSeries.length - 1] || 50;
        const macdData = FibEngine.calculateMACD(closes);
        const bbData = FibEngine.calculateBollingerBands(closes);

        const oracleSignal = FibEngine.generateOracleSignal(
            currentPrice,
            fib,
            latestRsi,
            macdData,
            bbData
        );

        // Update timestamp
        if (signalTimestampEl) {
            signalTimestampEl.textContent = `Aktualisiert: ${new Date().toLocaleTimeString()}`;
        }

        // 2. Update Header Banner
        renderBanner(candles, swing, oracleSignal);

        // 3. Update Oracle Signal, Signal Bar & Live Investment Profit Panel (FIX ERR_17, ERR_18, ERR_19)
        renderOraclePanel(oracleSignal);

        // 4. Render Charts synchronously and asynchronously
        renderCharts(swing, fib, rsiSeries, bbData);

        // 5. Render Fibonacci Matrix Table
        renderFibTable(fib, currentPrice);

        // 6. Render Technical Indicators (FIX ERR_20, ERR_21, ERR_22)
        renderIndicators(latestRsi, macdData, bbData);

        // 7. Render 30-Day Historical Signal Audit Table (FIX ERR_23)
        renderHistoricalLog(candles);

        // 8. Check & Push Alerts (FIX ERR_25)
        checkAlerts(oracleSignal, fib, currentPrice);
    }

    // --- Render Top Banner ---
    function renderBanner(candles, swing, oracleSignal) {
        let changePct = ((currentPrice - candles[0].close) / candles[0].close) * 100;
        let changeLabel = `(${currentTimeframe})`;
        if (currentTicker24h && currentTicker24h.priceChangePercent !== undefined) {
            const parsedChange = parseFloat(currentTicker24h.priceChangePercent);
            if (!isNaN(parsedChange)) {
                changePct = parsedChange;
                changeLabel = '(24h)';
            }
        }

        let totalVolume = candles.reduce((acc, c) => acc + c.volume, 0);
        let volumeUsd = totalVolume * currentPrice;
        let volLabel = 'Total';
        if (currentTicker24h && currentTicker24h.volume !== undefined) {
            const parsedVol = parseFloat(currentTicker24h.volume);
            if (!isNaN(parsedVol)) {
                totalVolume = parsedVol;
                volumeUsd = currentTicker24h.quoteVolume ? parseFloat(currentTicker24h.quoteVolume) : totalVolume * currentPrice;
                volLabel = '24h';
            }
        }

        if (livePriceEl) livePriceEl.textContent = formatMoney(currentPrice);
        
        if (liveChangeEl) {
            liveChangeEl.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% ${changeLabel}`;
            liveChangeEl.className = `banner-sub ${changePct >= 0 ? 'val-up' : 'val-down'}`;
        }

        const baseCoin = getAssetTicker(currentSymbol);
        if (liveVolumeEl) liveVolumeEl.textContent = `${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${baseCoin}`;
        if (liveVolumeUsdEl) liveVolumeUsdEl.textContent = `~${formatMoney(volumeUsd)} ${volLabel}`;

        if (swingHighLowEl) swingHighLowEl.textContent = `${formatMoney(swing.low, 1)} → ${formatMoney(swing.high, 1)}`;
        if (swingDiffEl) swingDiffEl.textContent = `Spanne: ${formatMoney(swing.diff, 1)}`;

        if (riskRatingEl) {
            riskRatingEl.textContent = oracleSignal.riskRating;
            if (oracleSignal.riskRating === 'Hoch') riskRatingEl.style.color = 'var(--accent-red)';
            else if (oracleSignal.riskRating === 'Mittel') riskRatingEl.style.color = 'var(--accent-amber)';
            else riskRatingEl.style.color = 'var(--accent-green)';
        }

        if (bbBandwidthEl) bbBandwidthEl.textContent = `Bollinger Bandbreite: ${oracleSignal.bbWidth}%`;
    }

    // --- FIX ERR_17, ERR_18, ERR_19: Render Oracle Signal Card, Signal Progress Bar & Trade Setup ---
    function renderOraclePanel(oracleSignal) {
        if (oracleSignalBadgeEl) oracleSignalBadgeEl.className = `oracle-signal-badge signal-${oracleSignal.signal}`;
        
        let signalLabel = 'NEUTRAL';
        if (oracleSignal.signal === 'BUY') signalLabel = 'KAUFSIGNAL';
        else if (oracleSignal.signal === 'SELL') signalLabel = 'VERKAUFSIGNAL';

        if (oracleSignalTextEl) oracleSignalTextEl.textContent = signalLabel;

        if (confidenceValEl) confidenceValEl.textContent = `${oracleSignal.confidence}%`;
        if (confidenceBarEl) confidenceBarEl.style.width = `${oracleSignal.confidence}%`;

        // Update Signal Strength Percentage Progress Bar
        const pct = oracleSignal.confidence;
        if (signalStrengthPctValEl && signalStrengthBarEl) {
            if (oracleSignal.signal === 'BUY') {
                signalStrengthPctValEl.textContent = `${pct}% Kaufsignal / Bullish`;
                signalStrengthPctValEl.style.color = 'var(--accent-green)';
                signalStrengthBarEl.style.width = `${pct}%`;
                signalStrengthBarEl.style.background = 'linear-gradient(90deg, #7af09e, #ff6e3a)';
                signalStrengthBarEl.style.color = '#7af09e';
            } else if (oracleSignal.signal === 'SELL') {
                signalStrengthPctValEl.textContent = `${pct}% Verkaufsignal / Bearish`;
                signalStrengthPctValEl.style.color = 'var(--accent-red)';
                signalStrengthBarEl.style.width = `${pct}%`;
                signalStrengthBarEl.style.background = 'linear-gradient(90deg, #ff4d4d, #ff6e3a)';
                signalStrengthBarEl.style.color = '#ff4d4d';
            } else {
                signalStrengthPctValEl.textContent = `${pct}% Neutral / Konsolidierung`;
                signalStrengthPctValEl.style.color = 'var(--accent-amber)';
                signalStrengthBarEl.style.width = `${pct}%`;
                signalStrengthBarEl.style.background = 'linear-gradient(90deg, #ffb800, #8e95a5)';
                signalStrengthBarEl.style.color = '#ffb800';
            }
        }

        // FIX ERR_17: Parse trade setup numeric values safely without string corruption
        const setup = oracleSignal.tradeSetup;
        const parseSetupVal = (val, defaultVal) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
                const cleaned = val.replace(/[^0-9.-]+/g, '');
                const parsed = parseFloat(cleaned);
                return isNaN(parsed) ? defaultVal : parsed;
            }
            return defaultVal;
        };

        const entryNum = parseSetupVal(setup.entryPrice, currentPrice);
        const slNum = parseSetupVal(setup.stopLossPrice, entryNum * 0.98);
        const tp1Num = parseSetupVal(setup.tp1Price, entryNum * 1.05);
        const tp2Num = parseSetupVal(setup.tp2Price, entryNum * 1.10);
        const crvVal = parseSetupVal(setup.riskRewardRatio, 2.0);

        const baseCoinStr = getAssetTicker(currentSymbol);
        if (coinSymbolLabelEl) coinSymbolLabelEl.textContent = baseCoinStr;

        // FIX ERR_18: Trade Setup Warning Banner display logic
        if (setupWarningBannerEl) {
            if (oracleSignal.signal !== 'BUY' || crvVal < 1.5) {
                setupWarningBannerEl.style.display = 'flex';
                let reasonStr = oracleSignal.signal !== 'BUY' ? `SIGNAL IST ${oracleSignal.signal}` : `CRV IST ${crvVal} (< 1.5)`;
                setupWarningBannerEl.innerHTML = `<span>WARNUNG: KEIN AKTIVES KAUF-SETUP (${reasonStr})</span>`;
            } else {
                setupWarningBannerEl.style.display = 'none';
            }
        }

        // FIX ERR_19: Investment vs Coin/Stock Amount sync (with EUR/USD native currency awareness)
        let assetAmount = 0.01;
        const isEur = isNativeEurAsset(currentSymbol);

        if (activeInputSource === 'usd') {
            const rawInputValue = parseFloat(investAmountInput ? investAmountInput.value : 1000) || 1000;
            let nativeUserInvest;
            if (isEur) {
                nativeUserInvest = (currentCurrency === 'USD') ? (eurRate > 0 ? rawInputValue * eurRate : rawInputValue) : rawInputValue;
            } else {
                nativeUserInvest = (currentCurrency === 'EUR') ? (eurRate > 0 ? rawInputValue / eurRate : rawInputValue) : rawInputValue;
            }
            assetAmount = entryNum > 0 ? (nativeUserInvest / entryNum) : 0;
            if (coinAmountInput && document.activeElement !== coinAmountInput) {
                coinAmountInput.value = assetAmount < 1 ? assetAmount.toFixed(5) : assetAmount.toFixed(2);
            }
        } else {
            assetAmount = parseFloat(coinAmountInput ? coinAmountInput.value : 0.01) || 0.01;
            let displayInputValue;
            if (isEur) {
                const costEUR = assetAmount * entryNum;
                displayInputValue = (currentCurrency === 'USD') ? (eurRate > 0 ? costEUR / eurRate : costEUR) : costEUR;
            } else {
                const costUSD = assetAmount * entryNum;
                displayInputValue = (currentCurrency === 'EUR') ? costUSD * eurRate : costUSD;
            }
            if (investAmountInput && document.activeElement !== investAmountInput) {
                investAmountInput.value = displayInputValue.toFixed(2);
            }
        }
        
        if (calcCoinsValEl) {
            calcCoinsValEl.textContent = `${assetAmount < 1 ? assetAmount.toFixed(5) : assetAmount.toFixed(2)} ${baseCoinStr}`;
        }

        if (tradeEntryValEl) tradeEntryValEl.textContent = formatMoney(entryNum);
        if (tradeStopLossValEl) tradeStopLossValEl.textContent = formatMoney(slNum);
        if (tradeTp1ValEl) tradeTp1ValEl.textContent = formatMoney(tp1Num);
        if (tradeTp2ValEl) tradeTp2ValEl.textContent = formatMoney(tp2Num);

        // Dynamic Profit & Loss calculations in chosen currency ($/€)
        const riskNative = Math.abs(entryNum - slNum) * assetAmount;
        const riskPct = entryNum > 0 ? (Math.abs(entryNum - slNum) / entryNum) * 100 : 0;
        
        const profit1Native = Math.abs(tp1Num - entryNum) * assetAmount;
        const profit1Pct = entryNum > 0 ? (Math.abs(tp1Num - entryNum) / entryNum) * 100 : 0;

        const profit2Native = Math.abs(tp2Num - entryNum) * assetAmount;
        const profit2Pct = entryNum > 0 ? (Math.abs(tp2Num - entryNum) / entryNum) * 100 : 0;

        if (tradeRiskAmountEl) {
            tradeRiskAmountEl.textContent = `-${formatMoney(riskNative)} (-${riskPct.toFixed(1)}%)`;
        }
        if (tradeProfit1AmountEl) {
            tradeProfit1AmountEl.textContent = `+${formatMoney(profit1Native)} (+${profit1Pct.toFixed(1)}%)`;
        }
        if (tradeProfit2AmountEl) {
            tradeProfit2AmountEl.textContent = `+${formatMoney(profit2Native)} (+${profit2Pct.toFixed(1)}%)`;
        }

        if (crvBadgeEl) {
            crvBadgeEl.textContent = `CRV: 1:${crvVal.toFixed(2)}`;
        }

        // Reasoning list (NO EMOJIS)
        if (reasoningListEl) {
            reasoningListEl.innerHTML = oracleSignal.reasoning
                .map(r => `<div class="reasoning-item">${r}</div>`)
                .join('');
        }
    }

    // --- FIX ERR_26, ERR_33: Render High Resolution Canvas Charts ---
    function renderCharts(swing, fib, rsiSeries, bbData) {
        if (!priceCanvas || !rsiCanvas) return;
        if (!candles || candles.length === 0) return;

        // If chartContainer is hidden or width not yet computed by browser, retry on next frame
        if (chartContainer && chartContainer.clientWidth === 0) {
            requestAnimationFrame(() => renderCharts(swing, fib, rsiSeries, bbData));
            return;
        }

        if (!swing) swing = FibEngine.findSwingHighLow(candles);
        if (!fib) fib = FibEngine.calculateFibonacciLevels(swing.high, swing.low, swing.isUptrend);
        if (!rsiSeries) rsiSeries = FibEngine.calculateRSI(candles.map(c => c.close), 14);

        const dpr = window.devicePixelRatio || 1;
        const containerWidth = (chartContainer && chartContainer.clientWidth > 50) ? chartContainer.clientWidth : 800;
        const isMobile = window.innerWidth <= 768;
        
        const cssWidth = Math.max(260, Math.floor(containerWidth));
        const cssHeightP = isMobile ? 260 : 320;
        const cssHeightR = isMobile ? 100 : 120;

        // Set internal buffer dimensions matching High-DPI resolution
        priceCanvas.width = Math.floor(cssWidth * dpr);
        priceCanvas.height = Math.floor(cssHeightP * dpr);
        priceCanvas.style.width = `${cssWidth}px`;
        priceCanvas.style.height = `${cssHeightP}px`;

        rsiCanvas.width = Math.floor(cssWidth * dpr);
        rsiCanvas.height = Math.floor(cssHeightR * dpr);
        rsiCanvas.style.width = `${cssWidth}px`;
        rsiCanvas.style.height = `${cssHeightR}px`;

        const ctxP = priceCanvas.getContext('2d');
        const ctxR = rsiCanvas.getContext('2d');

        // Reset transform to identity before scaling
        ctxP.setTransform(1, 0, 0, 1, 0, 0);
        ctxR.setTransform(1, 0, 0, 1, 0, 0);

        ctxP.scale(dpr, dpr);
        ctxR.scale(dpr, dpr);

        // Clear and solid background
        ctxP.clearRect(0, 0, cssWidth, cssHeightP);
        ctxP.fillStyle = '#08090d';
        ctxP.fillRect(0, 0, cssWidth, cssHeightP);

        ctxR.clearRect(0, 0, cssWidth, cssHeightR);
        ctxR.fillStyle = '#08090d';
        ctxR.fillRect(0, 0, cssWidth, cssHeightR);

        const padding = { 
            top: isMobile ? 18 : 25, 
            bottom: isMobile ? 22 : 30, 
            left: isMobile ? 8 : 15, 
            right: isMobile ? 70 : 95 
        };
        const chartW = Math.max(50, cssWidth - padding.left - padding.right);
        const chartHP = cssHeightP - padding.top - padding.bottom;

        let allPrices = [
            ...candles.map(c => c.low),
            ...candles.map(c => c.high)
        ];
        if (swing) {
            allPrices.push(swing.low, swing.high);
        }
        if (fib && fib.levels) {
            allPrices.push(...Object.values(fib.levels));
        }

        const validPrices = allPrices.filter(p => typeof p === 'number' && !isNaN(p) && isFinite(p) && p > 0);
        const trueMin = validPrices.length > 0 ? Math.min(...validPrices) : 100;
        const trueMax = validPrices.length > 0 ? Math.max(...validPrices) : 1000;
        const margin = Math.max(0.1, (trueMax - trueMin) * 0.04);
        const minP = trueMin - margin;
        const maxP = trueMax + margin;
        const priceRange = Math.max(0.0001, maxP - minP);

        function getYP(val) {
            const num = (typeof val === 'number' && !isNaN(val)) ? val : minP;
            return padding.top + chartHP - ((num - minP) / priceRange) * chartHP;
        }

        function getValP(y) {
            return minP + ((padding.top + chartHP - y) / chartHP) * priceRange;
        }

        function getX(idx) {
            return padding.left + (idx / Math.max(1, candles.length - 1)) * chartW;
        }

        // 1. Translucent Fibonacci Color Bands
        if (fib && fib.levels) {
            const y23 = getYP(fib.levels['23.6%']);
            const y38 = getYP(fib.levels['38.2%']);
            const y50 = getYP(fib.levels['50.0%']);
            const y61 = getYP(fib.levels['61.8%']);
            const y100 = getYP(fib.levels['100%']);
            const y161 = getYP(fib.levels['161.8%'] || fib.levels['100%']);

            // 50% - 61.8% Golden Ratio Zone
            ctxP.fillStyle = 'rgba(122, 240, 158, 0.12)';
            ctxP.fillRect(padding.left, Math.min(y50, y61), chartW, Math.abs(y61 - y50));

            // 38.2% - 50.0% Support Zone
            ctxP.fillStyle = 'rgba(255, 184, 0, 0.08)';
            ctxP.fillRect(padding.left, Math.min(y38, y50), chartW, Math.abs(y50 - y38));

            // 23.6% - 38.2% Zone
            ctxP.fillStyle = 'rgba(255, 110, 58, 0.06)';
            ctxP.fillRect(padding.left, Math.min(y23, y38), chartW, Math.abs(y38 - y23));

            // 100% - 161.8% Target Extension Zone
            ctxP.fillStyle = 'rgba(255, 77, 77, 0.08)';
            ctxP.fillRect(padding.left, Math.min(y100, y161), chartW, Math.abs(y161 - y100));

            ctxP.fillStyle = '#7af09e';
            ctxP.font = 'bold 10px "JetBrains Mono", monospace';
            ctxP.fillText('* GOLDEN RATIO ZONE (61.8%)', padding.left + 15, Math.min(y50, y61) + 14);
        }

        // 2. Grid Lines
        ctxP.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctxP.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (i / 5) * chartHP;
            ctxP.beginPath();
            ctxP.moveTo(padding.left, y);
            ctxP.lineTo(cssWidth - padding.right, y);
            ctxP.stroke();
        }

        // 3. Fibonacci Lines & Price Labels
        if (fib && fib.levels) {
            const fibColors = {
                '0%': '#8e95a5',
                '23.6%': '#ff6e3a',
                '38.2%': '#ff6e3a',
                '50.0%': '#ffb800',
                '61.8%': '#7af09e',
                '78.6%': '#b200ff',
                '100%': '#8e95a5',
                '127.2%': '#ff4d4d',
                '161.8%': '#ff4d4d'
            };

            Object.entries(fib.levels).forEach(([name, levelPrice]) => {
                const y = getYP(levelPrice);
                if (y >= padding.top - 15 && y <= cssHeightP - padding.bottom + 15) {
                    ctxP.strokeStyle = fibColors[name] || '#ffffff';
                    ctxP.setLineDash(name === '61.8%' ? [] : [4, 4]);
                    ctxP.lineWidth = name === '61.8%' ? 2.2 : 1;

                    ctxP.beginPath();
                    ctxP.moveTo(padding.left, y);
                    ctxP.lineTo(cssWidth - padding.right, y);
                    ctxP.stroke();

                    ctxP.setLineDash([]);
                    ctxP.fillStyle = fibColors[name] || '#ffffff';
                    ctxP.font = isMobile ? '9px "JetBrains Mono", monospace' : '11px "JetBrains Mono", monospace';
                    const fibLabel = isMobile ? `${name} ${formatMoney(levelPrice, 0)}` : `Fib ${name}: ${formatMoney(levelPrice, 1)}`;
                    ctxP.fillText(fibLabel, cssWidth - padding.right + 4, y + 4);
                }
            });
            ctxP.setLineDash([]);
        }

        // 4. Trend Area Line
        ctxP.beginPath();
        candles.forEach((c, i) => {
            const x = getX(i);
            const y = getYP(c.close);
            if (i === 0) ctxP.moveTo(x, y);
            else ctxP.lineTo(x, y);
        });
        
        ctxP.strokeStyle = 'rgba(255, 110, 58, 0.4)';
        ctxP.lineWidth = 1.5;
        ctxP.stroke();

        // 5. Candlesticks
        const candleW = Math.max(3, (chartW / candles.length) * 0.7);

        candles.forEach((c, i) => {
            const x = getX(i);
            const yOpen = getYP(c.open);
            const yClose = getYP(c.close);
            const yHigh = getYP(c.high);
            const yLow = getYP(c.low);

            const isUp = c.close >= c.open;
            const isHovered = (hoveredCandleIndex === i);
            let color = isUp ? '#7af09e' : '#ff4d4d';

            if (isHovered) {
                color = '#ff6e3a';
            }

            ctxP.strokeStyle = color;
            ctxP.lineWidth = isHovered ? 2.5 : 1.2;
            ctxP.beginPath();
            ctxP.moveTo(x, yHigh);
            ctxP.lineTo(x, yLow);
            ctxP.stroke();

            ctxP.fillStyle = color;
            const bodyY = Math.min(yOpen, yClose);
            const bodyH = Math.max(2, Math.abs(yClose - yOpen));
            ctxP.fillRect(x - candleW / 2, bodyY, candleW, bodyH);
        });

        // 6. Interactive Crosshairs
        if (mousePos.x > 0 && mousePos.y > 0) {
            const crossX = mousePos.x;
            const crossY = mousePos.y;

            ctxP.strokeStyle = 'rgba(255, 110, 58, 0.8)';
            ctxP.setLineDash([3, 3]);
            ctxP.lineWidth = 1;
            ctxP.beginPath();
            ctxP.moveTo(crossX, padding.top);
            ctxP.lineTo(crossX, cssHeightP - padding.bottom);
            ctxP.stroke();

            if (crossY >= padding.top && crossY <= cssHeightP - padding.bottom) {
                ctxP.beginPath();
                ctxP.moveTo(padding.left, crossY);
                ctxP.lineTo(cssWidth - padding.right, crossY);
                ctxP.stroke();

                const hoverPrice = getValP(crossY);
                ctxP.setLineDash([]);
                ctxP.fillStyle = '#ff6e3a';
                ctxP.fillRect(cssWidth - padding.right + 2, crossY - 10, isMobile ? 66 : 88, 20);
                ctxP.fillStyle = '#0b0b0d';
                ctxP.font = isMobile ? 'bold 9px "JetBrains Mono", monospace' : 'bold 11px "JetBrains Mono", monospace';
                ctxP.fillText(`${formatMoney(hoverPrice, isMobile ? 0 : 1)}`, cssWidth - padding.right + (isMobile ? 3 : 6), crossY + 4);
            }
            ctxP.setLineDash([]);
        }

        // 7. RSI Sub-Chart Rendering
        const chartHR = cssHeightR - 30;
        function getYR(val) {
            return 15 + chartHR - (val / 100) * chartHR;
        }

        ctxR.strokeStyle = 'rgba(255, 77, 77, 0.4)';
        ctxR.setLineDash([3, 3]);
        ctxR.beginPath();
        ctxR.moveTo(padding.left, getYR(70));
        ctxR.lineTo(cssWidth - padding.right, getYR(70));
        ctxR.stroke();

        ctxR.strokeStyle = 'rgba(122, 240, 158, 0.4)';
        ctxR.beginPath();
        ctxR.moveTo(padding.left, getYR(30));
        ctxR.lineTo(cssWidth - padding.right, getYR(30));
        ctxR.stroke();
        ctxR.setLineDash([]);

        ctxR.fillStyle = '#8e95a5';
        ctxR.font = isMobile ? '8px "JetBrains Mono", monospace' : '10px "JetBrains Mono", monospace';
        ctxR.fillText('RSI 70', cssWidth - padding.right + (isMobile ? 3 : 6), getYR(70) + 3);
        ctxR.fillText('RSI 30', cssWidth - padding.right + (isMobile ? 3 : 6), getYR(30) + 3);

        ctxR.strokeStyle = '#ff6e3a';
        ctxR.lineWidth = 1.8;
        ctxR.beginPath();

        let firstPoint = true;
        rsiSeries.forEach((val, i) => {
            if (val !== null && val !== undefined) {
                const x = getX(i);
                const y = getYR(val);
                if (firstPoint) {
                    ctxR.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctxR.lineTo(x, y);
                }
            }
        });
        ctxR.stroke();

        if (mousePos.x > 0) {
            ctxR.strokeStyle = 'rgba(255, 110, 58, 0.6)';
            ctxR.setLineDash([3, 3]);
            ctxR.lineWidth = 1;
            ctxR.beginPath();
            ctxR.moveTo(mousePos.x, 10);
            ctxR.lineTo(mousePos.x, cssHeightR - 10);
            ctxR.stroke();
            ctxR.setLineDash([]);
        }

        if (chartOverlayInfo) {
            if (hoveredCandleIndex !== null && candles[hoveredCandleIndex]) {
                const hc = candles[hoveredCandleIndex];
                chartOverlayInfo.textContent = `Kerze #${hoveredCandleIndex + 1}: O: ${formatMoney(hc.open)} | H: ${formatMoney(hc.high)} | L: ${formatMoney(hc.low)} | C: ${formatMoney(hc.close)}`;
            } else {
                chartOverlayInfo.textContent = `Swing: ${formatMoney(swing.low, 1)} (Low) → ${formatMoney(swing.high, 1)} (High) | Live: ${formatMoney(currentPrice)}`;
            }
        }
    }
    window.renderCharts = renderCharts;

    // --- Render Fibonacci Matrix Table ---
    function renderFibTable(fib, price) {
        if (!fib || !fib.levels || !fibTableBodyEl) return;

        fibTableBodyEl.innerHTML = '';

        Object.entries(fib.levels).forEach(([levelName, targetPrice]) => {
            const distPct = targetPrice > 0 ? ((price - targetPrice) / targetPrice) * 100 : 0;
            const absDist = Math.abs(distPct);
            const isCurrentlyTested = absDist < 0.8;

            let statusBadge = '';
            if (isCurrentlyTested) {
                statusBadge = `<span class="status-badge badge-testing">TESTING</span>`;
            } else if (targetPrice < price) {
                statusBadge = `<span class="status-badge badge-support">SUPPORT</span>`;
            } else {
                statusBadge = `<span class="status-badge badge-resistance">WIDERSTAND</span>`;
            }

            let typeLabel = parseFloat(levelName) <= 100 ? 'Retracement' : 'Extension Target';

            const row = document.createElement('tr');
            if (isCurrentlyTested) row.className = 'active-level';

            row.innerHTML = `
                <td style="font-weight: 700; color: ${levelName === '61.8%' ? 'var(--accent-green)' : 'var(--text-main)'};">
                    ${levelName} ${levelName === '61.8%' ? '* (Golden Ratio)' : ''}
                </td>
                <td style="color: var(--accent-orange); font-weight:700;">${formatMoney(targetPrice)}</td>
                <td style="color: ${distPct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight: 600;">
                    ${distPct >= 0 ? '+' : ''}${distPct.toFixed(2)}%
                </td>
                <td>${statusBadge}</td>
                <td style="color: var(--text-faint);">${typeLabel}</td>
            `;

            fibTableBodyEl.appendChild(row);
        });
    }

    // --- FIX ERR_20, ERR_21, ERR_22: Render Technical Indicators ---
    function renderIndicators(rsi, macd, bb) {
        // FIX ERR_20: RSI (14) Indicator & Meter Fill thresholds
        if (indRsiEl) indRsiEl.textContent = rsi.toFixed(1);
        const rsiClamped = Math.max(0, Math.min(100, rsi));
        if (rsiMeterFillEl) {
            rsiMeterFillEl.style.width = `${rsiClamped}%`;
        }

        if (rsi < 38) {
            if (indRsiEl) indRsiEl.style.color = 'var(--accent-green)';
            if (rsiMeterFillEl) rsiMeterFillEl.style.background = 'var(--accent-green)';
            if (rsiStatusBadgeEl) {
                rsiStatusBadgeEl.textContent = 'Überverkauft (Bullish)';
                rsiStatusBadgeEl.className = 'status-badge badge-support';
            }
        } else if (rsi > 65) {
            if (indRsiEl) indRsiEl.style.color = 'var(--accent-red)';
            if (rsiMeterFillEl) rsiMeterFillEl.style.background = 'var(--accent-red)';
            if (rsiStatusBadgeEl) {
                rsiStatusBadgeEl.textContent = 'Überkauft (Bearish)';
                rsiStatusBadgeEl.className = 'status-badge badge-resistance';
            }
        } else {
            if (indRsiEl) indRsiEl.style.color = 'var(--accent-orange)';
            if (rsiMeterFillEl) rsiMeterFillEl.style.background = 'var(--accent-orange)';
            if (rsiStatusBadgeEl) {
                rsiStatusBadgeEl.textContent = 'Neutral';
                rsiStatusBadgeEl.className = 'status-badge';
            }
        }

        // FIX ERR_21: MACD Crossover Status Badge
        const macdLine = macd && macd.macdLine ? macd.macdLine[macd.macdLine.length - 1] || 0 : 0;
        const macdSig = macd && macd.signalLine ? macd.signalLine[macd.signalLine.length - 1] || 0 : 0;
        const macdHist = macd && macd.histogram ? macd.histogram[macd.histogram.length - 1] || 0 : 0;

        if (indMacdLineEl) indMacdLineEl.textContent = macdLine.toFixed(2);
        if (indMacdSignalEl) indMacdSignalEl.textContent = macdSig.toFixed(2);
        if (indMacdHistEl) {
            indMacdHistEl.textContent = macdHist.toFixed(2);
            indMacdHistEl.style.color = macdHist >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        }

        if (macdStatusBadgeEl) {
            if (macdHist > 0) {
                macdStatusBadgeEl.textContent = 'BULLISH CROSSOVER';
                macdStatusBadgeEl.className = 'status-badge badge-support';
            } else if (macdHist < 0) {
                macdStatusBadgeEl.textContent = 'BEARISH CROSSOVER';
                macdStatusBadgeEl.className = 'status-badge badge-resistance';
            } else {
                macdStatusBadgeEl.textContent = 'NEUTRAL';
                macdStatusBadgeEl.className = 'status-badge';
            }
        }

        // FIX ERR_22: Bollinger Bands Squeeze & Bandwidth Status
        const bbUp = bb && bb.upper ? bb.upper[bb.upper.length - 1] || 0 : 0;
        const bbMid = bb && bb.middle ? bb.middle[bb.middle.length - 1] || 0 : 0;
        const bbLow = bb && bb.lower ? bb.lower[bb.lower.length - 1] || 0 : 0;

        if (indBbUpperEl) indBbUpperEl.textContent = formatMoney(bbUp);
        if (indBbMiddleEl) indBbMiddleEl.textContent = formatMoney(bbMid);
        if (indBbLowerEl) indBbLowerEl.textContent = formatMoney(bbLow);

        const bandwidth = bbMid > 0 ? ((bbUp - bbLow) / bbMid) * 100 : 5;
        if (bbStatusBadgeEl) {
            if (bandwidth < 4.0) {
                bbStatusBadgeEl.textContent = 'SQUEEZE (VOR AUSBRUCH)';
                bbStatusBadgeEl.className = 'status-badge badge-testing';
            } else if (bandwidth > 8.0) {
                bbStatusBadgeEl.textContent = 'HOHE VOLATILITÄT';
                bbStatusBadgeEl.className = 'status-badge badge-resistance';
            } else {
                bbStatusBadgeEl.textContent = 'NORMALE VOLATILITÄT';
                bbStatusBadgeEl.className = 'status-badge';
            }
        }
    }

    // --- FIX ERR_23: Render 30-Day Historical Signal Audit Table ---
    function renderHistoricalLog(candles) {
        if (!historyTableBodyEl || !candles || candles.length === 0) return;

        const logs = FibEngine.generateHistoricalSignalLog(candles);
        if (!logs || logs.length === 0) {
            historyTableBodyEl.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-faint);">Keine Signale im Historien-Fenster</td></tr>';
            return;
        }

        historyTableBodyEl.innerHTML = '';
        let totalWins = 0;
        let validTradesCount = 0;

        logs.forEach(item => {
            if (item.signal === 'BUY' || item.signal === 'SELL') {
                validTradesCount++;
                if (item.isWin) totalWins++;
            }

            const row = document.createElement('tr');
            
            let signalBadge = '';
            if (item.signal === 'BUY') {
                signalBadge = `<span class="status-badge badge-support">KAUFSIGNAL</span>`;
            } else if (item.signal === 'SELL') {
                signalBadge = `<span class="status-badge badge-resistance">VERKAUFSIGNAL</span>`;
            } else {
                signalBadge = `<span class="status-badge">NEUTRAL</span>`;
            }

            let outcomeBadge = '';
            if (item.isWin) {
                outcomeBadge = `<span class="badge-win">WIN (${item.outcome})</span>`;
            } else {
                outcomeBadge = `<span class="badge-loss">STOP LOSS</span>`;
            }

            const entryStr = formatMoney(item.entryUSD);
            const slStr = formatMoney(item.slUSD);
            const tp1Str = formatMoney(item.tp1USD);

            const changeSign = parseFloat(item.outcomeProfitPct) >= 0 ? '+' : '';
            const changeColor = parseFloat(item.outcomeProfitPct) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

            row.innerHTML = `
                <td>${item.dateStr}</td>
                <td>${signalBadge}</td>
                <td style="color: var(--accent-orange); font-weight:700;">${item.confidence}%</td>
                <td>${entryStr}</td>
                <td style="color: var(--accent-red);">${slStr}</td>
                <td style="color: var(--accent-green);">${tp1Str}</td>
                <td style="color: ${changeColor}; font-weight:700;">${changeSign}${item.outcomeProfitPct}%</td>
                <td>${outcomeBadge}</td>
            `;

            historyTableBodyEl.appendChild(row);
        });

        if (histWinRateBadgeEl) {
            const countToUse = validTradesCount > 0 ? validTradesCount : logs.length;
            const winPct = Math.round((totalWins / countToUse) * 100);
            histWinRateBadgeEl.textContent = `Trefferquote (30d): ${winPct}% WIN (${totalWins}/${countToUse})`;
        }
    }

    // --- FIX ERR_24: Backtesting Trigger Handler ---
    function handleRunBacktest() {
        const buyLevel = parseFloat(document.getElementById('btBuyLevel').value);
        const sellLevel = parseFloat(document.getElementById('btSellLevel').value);

        const res = FibEngine.runBacktest(candles, buyLevel, sellLevel);

        if (btWinRateEl) btWinRateEl.textContent = `${res.winRate}%`;
        if (btSharpeEl) btSharpeEl.textContent = `${res.sharpeRatio}`;
        if (btDrawdownEl) btDrawdownEl.textContent = `${res.maxDrawdown}%`;
        if (btTotalProfitEl) btTotalProfitEl.textContent = `${res.totalProfit >= 0 ? '+' : ''}${res.totalProfit}%`;

        if (res.note) {
            showToast(`Backtest: ${res.winRate}% Win Rate (${res.totalTrades} Trades) - ${res.note}`);
        } else {
            showToast(`Backtest ausgeführt! Win Rate: ${res.winRate}%, Ertrag: ${res.totalProfit >= 0 ? '+' : ''}${res.totalProfit}%`);
        }
        pushAlert(`Backtest ausgeführt: Win Rate ${res.winRate}%, Profit ${res.totalProfit}% (${res.totalTrades} Trades)`);
    }

    // --- FIX ERR_25: Real-time Alert Feed & Push Notifications ---
    function checkAlerts(signal, fib, price) {
        if (!fib || !fib.levels) return;

        const level618 = fib.levels['61.8%'];
        if (price > 0 && Math.abs(price - level618) / price < 0.005) {
            const alertMsg = `ALERT: ${currentSymbol} testet 61.8% Golden Ratio bei ${formatMoney(level618)}!`;
            pushAlert(alertMsg);
        }
    }

    function pushAlert(msgText) {
        if (alertsLog.includes(msgText)) return;
        alertsLog.unshift(msgText);
        if (alertsLog.length > 5) alertsLog.pop();

        if (alertFeedEl) {
            alertFeedEl.innerHTML = alertsLog.map(msg => `
                <div class="alert-item">
                    <div>${msg}</div>
                    <div class="alert-time">${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                </div>
            `).join('');
        }
    }

});
