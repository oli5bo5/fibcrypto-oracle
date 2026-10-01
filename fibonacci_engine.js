/**
 * FibCrypto Oracle - Core Fibonacci & Technical Indicator Analysis Engine
 * Calculates Fibonacci Retracements, Extensions, RSI, MACD, Bollinger Bands,
 * Oracle Signals, Exact Profit Calculations, and Backtesting Metrics.
 */

const FibEngine = (function() {
    
    // --- Swing High & Low Finder ---
    function findSwingHighLow(candles) {
        if (!candles || candles.length === 0) {
            return { high: 0, low: 0, highIndex: 0, lowIndex: 0, highTime: 0, lowTime: 0, diff: 0, isUptrend: true };
        }
        
        let highest = -Infinity;
        let lowest = Infinity;
        let highIndex = 0;
        let lowIndex = 0;
        
        candles.forEach((c, idx) => {
            if (c.high > highest) {
                highest = c.high;
                highIndex = idx;
            }
            if (c.low < lowest) {
                lowest = c.low;
                lowIndex = idx;
            }
        });

        // Determine main swing direction
        const isUptrend = lowIndex < highIndex;
        const diff = Math.max(0.0001, highest - lowest);

        return {
            high: highest,
            low: lowest,
            highIndex,
            lowIndex,
            highTime: candles[highIndex]?.timestamp,
            lowTime: candles[lowIndex]?.timestamp,
            diff,
            isUptrend
        };
    }

    // --- Fibonacci Retracements & Extensions Calculation ---
    function calculateFibonacciLevels(swingHigh, swingLow, isUptrend = true) {
        const diff = Math.max(0.0001, swingHigh - swingLow);

        let levels = {};
        if (isUptrend) {
            // Aufwärtstrend: Tief = 0%, Hoch = 100%, Extensions darüber
            levels = {
                '0%': swingLow,
                '23.6%': swingLow + diff * 0.236,
                '38.2%': swingLow + diff * 0.382,
                '50.0%': swingLow + diff * 0.500,
                '61.8%': swingLow + diff * 0.618,
                '78.6%': swingLow + diff * 0.786,
                '100%': swingHigh,
                '127.2%': swingLow + diff * 1.272,
                '161.8%': swingLow + diff * 1.618
            };
        } else {
            // Abwärtstrend: Hoch = 0%, Tief = 100%, Extensions darunter
            levels = {
                '0%': swingHigh,
                '23.6%': swingHigh - diff * 0.236,
                '38.2%': swingHigh - diff * 0.382,
                '50.0%': swingHigh - diff * 0.500,
                '61.8%': swingHigh - diff * 0.618,
                '78.6%': swingHigh - diff * 0.786,
                '100%': swingLow,
                '127.2%': swingHigh - diff * 1.272,
                '161.8%': swingHigh - diff * 1.618
            };
        }

        return {
            diff,
            swingHigh,
            swingLow,
            isUptrend,
            levels
        };
    }

    // --- RSI (Relative Strength Index) ---
    function calculateRSI(closes, period = 14) {
        if (!closes || closes.length <= period) {
            return Array(closes ? closes.length : 0).fill(50);
        }

        const rsiValues = new Array(closes.length).fill(null);
        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= period; i++) {
            const change = closes[i] - closes[i - 1];
            if (change >= 0) gains += change;
            else losses -= change;
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        rsiValues[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

        for (let i = period + 1; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            const gain = change >= 0 ? change : 0;
            const loss = change < 0 ? -change : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;

            rsiValues[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        }

        return rsiValues;
    }

    // --- EMA Helper ---
    function calculateEMA(data, period) {
        const k = 2 / (period + 1);
        const ema = new Array(data.length).fill(null);
        
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i];
        }
        ema[period - 1] = sum / period;

        for (let i = period; i < data.length; i++) {
            ema[i] = data[i] * k + ema[i - 1] * (1 - k);
        }
        return ema;
    }

    // --- MACD (Moving Average Convergence Divergence) ---
    function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (!closes || closes.length < slowPeriod) {
            return { macdLine: [], signalLine: [], histogram: [] };
        }

        const fastEMA = calculateEMA(closes, fastPeriod);
        const slowEMA = calculateEMA(closes, slowPeriod);

        const macdLine = closes.map((_, i) => {
            if (fastEMA[i] !== null && slowEMA[i] !== null) {
                return fastEMA[i] - slowEMA[i];
            }
            return null;
        });

        const validMacdIndices = [];
        const validMacdValues = [];
        macdLine.forEach((val, idx) => {
            if (val !== null) {
                validMacdIndices.push(idx);
                validMacdValues.push(val);
            }
        });

        const signalEMA = calculateEMA(validMacdValues, signalPeriod);
        const signalLine = new Array(closes.length).fill(null);
        const histogram = new Array(closes.length).fill(null);

        signalEMA.forEach((val, idx) => {
            if (val !== null) {
                const originalIdx = validMacdIndices[idx];
                signalLine[originalIdx] = val;
                histogram[originalIdx] = macdLine[originalIdx] - val;
            }
        });

        return { macdLine, signalLine, histogram };
    }

    // --- Bollinger Bands ---
    function calculateBollingerBands(closes, period = 20, stdDevMult = 2) {
        if (!closes || closes.length < period) {
            return { upper: [], middle: [], lower: [] };
        }

        const upper = new Array(closes.length).fill(null);
        const middle = new Array(closes.length).fill(null);
        const lower = new Array(closes.length).fill(null);

        for (let i = period - 1; i < closes.length; i++) {
            const slice = closes.slice(i - period + 1, i + 1);
            const mean = slice.reduce((a, b) => a + b, 0) / period;
            const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
            const stdDev = Math.sqrt(variance);

            middle[i] = mean;
            upper[i] = mean + stdDevMult * stdDev;
            lower[i] = mean - stdDevMult * stdDev;
        }

        return { upper, middle, lower };
    }

    // --- Oracle Signal & Financial Setup Generator ---
    function generateOracleSignal(currentPrice, fibData, rsiValue, macdData, bollingerData) {
        const levels = fibData.levels;
        
        // Find nearest Fibonacci level
        let nearestLevelName = '0%';
        let minDistance = Infinity;

        Object.entries(levels).forEach(([name, price]) => {
            const dist = Math.abs(currentPrice - price);
            if (dist < minDistance) {
                minDistance = dist;
                nearestLevelName = name;
            }
        });

        const nearestPrice = levels[nearestLevelName];
        const distPct = ((currentPrice - nearestPrice) / currentPrice) * 100;
        const absDistPct = Math.abs(distPct);

        // Proximity threshold: |distPct| <= 1.5% to consider price actively testing a level
        const isAtLevel = absDistPct <= 1.5;

        // RSI Conditions
        const isRsiOversold = rsiValue !== null && rsiValue < 38;
        const isRsiOverbought = rsiValue !== null && rsiValue > 65;

        // MACD Status: strict crossover & momentum logic
        const macdHist = macdData.histogram && macdData.histogram.length > 0 ? 
            macdData.histogram[macdData.histogram.length - 1] : 0;
        const prevMacdHist = macdData.histogram && macdData.histogram.length > 1 ? 
            macdData.histogram[macdData.histogram.length - 2] : 0;
        
        // Positive and rising momentum OR clear crossover
        const isMacdBullish = (macdHist > 0 && macdHist > prevMacdHist) || (prevMacdHist <= 0 && macdHist > 0);
        // Negative and falling momentum OR clear crossover
        const isMacdBearish = (macdHist < 0 && macdHist < prevMacdHist) || (prevMacdHist >= 0 && macdHist < 0);

        // Bollinger Band position
        const upperBB = bollingerData.upper && bollingerData.upper.length > 0 ? 
            bollingerData.upper[bollingerData.upper.length - 1] : currentPrice * 1.05;
        const lowerBB = bollingerData.lower && bollingerData.lower.length > 0 ? 
            bollingerData.lower[bollingerData.lower.length - 1] : currentPrice * 0.95;
        const middleBB = bollingerData.middle && bollingerData.middle.length > 0 ? 
            bollingerData.middle[bollingerData.middle.length - 1] : currentPrice;

        const isSupportLevel = nearestPrice <= currentPrice;
        const isResistanceLevel = nearestPrice > currentPrice;

        let signalType = 'NEUTRAL';
        let confidence = 50;
        let reasoning = [];

        if (isAtLevel && isSupportLevel && (isRsiOversold || isMacdBullish)) {
            signalType = 'BUY';
            reasoning.push(`1. FIBONACCI SUPPORT: Kurs testet Fib-Unterstützung ${nearestLevelName} ($${nearestPrice.toLocaleString()})`);
            reasoning.push(`2. RSI MOMENTUM: RSI (${rsiValue ? rsiValue.toFixed(1) : '50'}) ist ${isRsiOversold ? 'überverkauft (<38)' : 'stabil im bullischen Bereich'}`);
            reasoning.push(`3. MACD MOMENTUM: Positives Trendmomentum bestätigt Aufwärtsbewegung`);
        } 
        else if (isAtLevel && isResistanceLevel && (isRsiOverbought || isMacdBearish)) {
            signalType = 'SELL';
            reasoning.push(`1. FIBONACCI WIDERSTAND: Kurs testet Widerstand ${nearestLevelName} ($${nearestPrice.toLocaleString()})`);
            reasoning.push(`2. RSI OVERBOUGHT: RSI (${rsiValue ? rsiValue.toFixed(1) : '50'}) zeigt überhitzten Markt (>65)`);
            reasoning.push(`3. MACD DIVERGENZ: Nachlassendes Momentum deutet auf Konsolidierung hin`);
        } 
        else {
            signalType = 'NEUTRAL';
            reasoning.push(`1. KEIN SETUP: Kurs pendelt bei ${nearestLevelName} ($${nearestPrice.toLocaleString()}), Abstand ${absDistPct.toFixed(1)}%`);
            reasoning.push(`2. RHYTHMUS: RSI (${rsiValue ? rsiValue.toFixed(1) : '50'}) zeigt ausgeglichenes Angebot/Nachfrage`);
            reasoning.push(`3. TIMING: Warten auf eindeutiges Signal an einer wichtigen Fibonacci-Stütze`);
        }

        // Weighted Confidence Calculation (50% to 92%)
        if (signalType !== 'NEUTRAL') {
            const proximityScore = Math.max(0, 25 * (1 - absDistPct / 1.5));
            const rsiScore = (isRsiOversold || isRsiOverbought) ? 20 : 10;
            const macdScore = (isMacdBullish || isMacdBearish) ? 15 : 5;
            confidence = Math.min(92, Math.round(50 + proximityScore + rsiScore + macdScore));
        } else {
            confidence = 50;
        }

        // --- Exact Financial Calculations (Pure Numeric & Formatted) ---
        const entryPrice = currentPrice;
        
        // Stop Loss on nearest level strictly BELOW entry with min 1.0% distance
        const sortedPrices = Object.values(levels).sort((a, b) => a - b);
        const lowerLevels = sortedPrices.filter(p => p < entryPrice * 0.99);
        
        let stopLossPrice = lowerLevels.length > 0 ? lowerLevels[lowerLevels.length - 1] : entryPrice * 0.985;
        if (entryPrice - stopLossPrice < entryPrice * 0.01) {
            stopLossPrice = entryPrice * 0.985;
        }

        const riskAmountUsd = Math.max(0, entryPrice - stopLossPrice);
        const riskPct = entryPrice > 0 ? ((riskAmountUsd / entryPrice) * 100) : 0;

        // Take-Profit targets strictly ABOVE entry price
        const upperLevels = sortedPrices.filter(p => p > entryPrice * 1.01);
        
        let tp1Price = upperLevels.length > 0 ? upperLevels[0] : entryPrice * 1.04;
        let tp2Price = upperLevels.length > 1 ? upperLevels[1] : entryPrice * 1.08;

        const profit1Usd = Math.max(0, tp1Price - entryPrice);
        const profit1Pct = entryPrice > 0 ? ((profit1Usd / entryPrice) * 100) : 0;

        const profit2Usd = Math.max(0, tp2Price - entryPrice);
        const profit2Pct = entryPrice > 0 ? ((profit2Usd / entryPrice) * 100) : 0;

        const crvNumber = (riskAmountUsd > 0 && profit1Usd > 0) ? (profit1Usd / riskAmountUsd) : 0;
        const crvStr = crvNumber > 0 ? `1:${crvNumber.toFixed(2)}` : 'n/a';

        // Volatility assessment via Bollinger Bandwidth
        const bbWidth = (upperBB && lowerBB && middleBB > 0) ? ((upperBB - lowerBB) / middleBB) * 100 : 5;
        let riskRating = 'Mittel';
        if (bbWidth > 8) riskRating = 'Hoch';
        else if (bbWidth < 3) riskRating = 'Niedrig';

        // Consolidated tradeSetup with clean numbers and ready-to-display values
        const tradeSetup = {
            entryPrice: entryPrice,
            stopLossPrice: stopLossPrice,
            riskAmountUsd: riskAmountUsd,
            riskPct: riskPct,
            tp1Price: tp1Price,
            profit1Usd: profit1Usd,
            profit1Pct: profit1Pct,
            tp2Price: tp2Price,
            profit2Usd: profit2Usd,
            profit2Pct: profit2Pct,
            riskRewardRatio: crvNumber,
            crvStr: crvStr
        };

        return {
            signal: signalType,
            confidence,
            nearestLevelName,
            nearestPrice,
            distPct,
            reasoning,
            tradeSetup,
            tradeSetupNumbers: tradeSetup, // Backward compatibility alias
            riskRating,
            bbWidth: bbWidth.toFixed(2)
        };
    }

    // --- Backtesting Simulator with Realistic Execution ---
    function runBacktest(candles, buyFibLevelPct = 0.382, sellFibLevelPct = 1.618) {
        if (!candles || candles.length < 30) {
            return {
                insufficientData: true,
                winRate: null,
                sharpeRatio: null,
                maxDrawdown: null,
                totalProfit: null,
                totalTrades: 0
            };
        }

        const closes = candles.map(c => c.close);
        const rsiValues = calculateRSI(closes, 14);

        let initialBalance = 10000;
        let balance = initialBalance;
        let position = null;
        let trades = [];
        let peakBalance = initialBalance;
        let maxDrawdown = 0;
        const feeRate = 0.00075; // 0.075% taker fee per execution

        // Rolling 50-candle window without look-ahead bias
        for (let i = 25; i < candles.length; i++) {
            const price = candles[i].close;
            const rsi = rsiValues[i];

            if (balance > peakBalance) peakBalance = balance;
            const currentDrawdown = ((balance - peakBalance) / peakBalance) * 100;
            if (currentDrawdown < maxDrawdown) maxDrawdown = currentDrawdown;

            const windowSlice = candles.slice(Math.max(0, i - 50), i + 1);
            const swing = findSwingHighLow(windowSlice);
            const fib = calculateFibonacciLevels(swing.high, swing.low, swing.isUptrend);

            const buyTargetPrice = swing.low + fib.diff * buyFibLevelPct;
            if (!position && price <= buyTargetPrice * 1.01 && rsi < 50) {
                // Apply buy fee
                const effectiveBalance = balance * (1 - feeRate);
                position = {
                    entryPrice: price,
                    amount: effectiveBalance / price,
                    index: i,
                    tpTarget: swing.low + fib.diff * sellFibLevelPct,
                    slTarget: price * 0.975 // -2.5% stop loss
                };
            }
            else if (position) {
                const profitPct = ((price - position.entryPrice) / position.entryPrice) * 100;

                if (price >= position.tpTarget || price <= position.slTarget || i - position.index > 15) {
                    const grossProceeds = position.amount * price;
                    const netProceeds = grossProceeds * (1 - feeRate);
                    const profit = netProceeds - (position.amount * position.entryPrice);
                    balance = netProceeds;
                    trades.push({
                        profit,
                        profitPct
                    });
                    position = null;
                }
            }
        }

        const wins = trades.filter(t => t.profit > 0).length;
        const totalTrades = trades.length;
        
        if (totalTrades === 0) {
            return {
                insufficientData: false,
                lowSample: true,
                winRate: 0,
                sharpeRatio: 0,
                maxDrawdown: 0,
                totalProfit: 0,
                totalTrades: 0
            };
        }

        const winRate = ((wins / totalTrades) * 100);
        const totalProfitPct = ((balance - initialBalance) / initialBalance) * 100;

        const returns = trades.map(t => t.profitPct);
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        
        // Sample standard deviation (n - 1)
        const variance = returns.length > 1 ? 
            returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / (returns.length - 1) : 0;
        const stdDevReturn = Math.sqrt(variance);
        
        // Single-trade Reward/Risk score
        const sharpeRatio = stdDevReturn > 0 ? (avgReturn / stdDevReturn) : 0;

        return {
            insufficientData: false,
            lowSample: totalTrades < 20,
            winRate: Math.round(winRate * 10) / 10,
            sharpeRatio: Math.round(sharpeRatio * 100) / 100,
            maxDrawdown: Math.round(maxDrawdown * 10) / 10,
            totalProfit: Math.round(totalProfitPct * 10) / 10,
            totalTrades
        };
    }

    // --- Historical Signal Log & Audit Engine ---
    function generateHistoricalSignalLog(candles) {
        if (!candles || candles.length < 20) return [];

        const closes = candles.map(c => c.close);
        const rsiValues = calculateRSI(closes, 14);
        const macdData = calculateMACD(closes);
        const bbData = calculateBollingerBands(closes);

        const logs = [];
        const step = Math.max(1, Math.floor(candles.length / 10));

        for (let i = 20; i < candles.length - 2; i += step) {
            const candleSlice = candles.slice(Math.max(0, i - 50), i + 1);
            const swing = findSwingHighLow(candleSlice);
            const fib = calculateFibonacciLevels(swing.high, swing.low, swing.isUptrend);
            const priceAtSignal = candles[i].close;
            const rsi = rsiValues[i] || 50;

            const signalRes = generateOracleSignal(
                priceAtSignal,
                fib,
                rsi,
                {
                    macdLine: macdData.macdLine.slice(0, i + 1),
                    signalLine: macdData.signalLine.slice(0, i + 1),
                    histogram: macdData.histogram.slice(0, i + 1)
                },
                {
                    upper: bbData.upper.slice(0, i + 1),
                    middle: bbData.middle.slice(0, i + 1),
                    lower: bbData.lower.slice(0, i + 1)
                }
            );

            // Forward window for evaluation
            const futureCandles = candles.slice(i + 1, Math.min(candles.length, i + 16));
            let outcome = 'IN PROGRESS';
            let outcomeProfitPct = 0;
            let isTrade = false;
            let isWin = false;

            const entryUSD = priceAtSignal;
            const slUSD = signalRes.tradeSetup.stopLossPrice;
            const tp1USD = signalRes.tradeSetup.tp1Price;

            if (signalRes.signal === 'BUY') {
                isTrade = true;
                let maxHigh = Math.max(...futureCandles.map(c => c.high));
                let minLow = Math.min(...futureCandles.map(c => c.low));

                if (maxHigh >= tp1USD) {
                    outcome = 'WIN (TP1)';
                    outcomeProfitPct = ((tp1USD - entryUSD) / entryUSD) * 100;
                    isWin = true;
                } else if (minLow <= slUSD) {
                    outcome = 'STOP LOSS';
                    outcomeProfitPct = ((slUSD - entryUSD) / entryUSD) * 100;
                    isWin = false;
                } else {
                    const finalClose = futureCandles[futureCandles.length - 1]?.close || entryUSD;
                    outcomeProfitPct = ((finalClose - entryUSD) / entryUSD) * 100;
                    outcome = outcomeProfitPct >= 0 ? 'OFFEN (+)' : 'OFFEN (-)';
                    isWin = outcomeProfitPct >= 0;
                }
            } else if (signalRes.signal === 'SELL') {
                isTrade = true;
                let minLow = Math.min(...futureCandles.map(c => c.low));
                let maxHigh = Math.max(...futureCandles.map(c => c.high));

                const targetShort = entryUSD * 0.97;
                const stopShort = entryUSD * 1.015;

                if (minLow <= targetShort) {
                    outcome = 'WIN (SHORT)';
                    outcomeProfitPct = 3.0;
                    isWin = true;
                } else if (maxHigh >= stopShort) {
                    outcome = 'STOP LOSS';
                    outcomeProfitPct = -1.5;
                    isWin = false;
                } else {
                    outcome = 'OFFEN';
                    outcomeProfitPct = 0.0;
                    isWin = false;
                }
            } else {
                isTrade = false;
                outcome = 'KEIN SIGNAL';
                outcomeProfitPct = 0.0;
                isWin = false;
            }

            logs.push({
                timestamp: candles[i].timestamp,
                dateStr: new Date(candles[i].timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
                signal: signalRes.signal,
                confidence: signalRes.confidence,
                entryUSD,
                slUSD,
                tp1USD,
                outcome,
                outcomeProfitPct: outcomeProfitPct.toFixed(2),
                isTrade,
                isWin
            });
        }

        return logs.reverse(); // Newest first
    }

    return {
        findSwingHighLow,
        calculateFibonacciLevels,
        calculateRSI,
        calculateMACD,
        calculateBollingerBands,
        generateOracleSignal,
        runBacktest,
        generateHistoricalSignalLog
    };

})();

if (typeof module !== 'undefined') {
    module.exports = FibEngine;
}
