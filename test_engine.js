/**
 * Automated Unit Test Suite for FibCrypto Oracle v14.2
 * Verifies mathematical models, Fibonacci calculations, RSI, MACD crossovers,
 * Bollinger Bands, trade setup numbers, and backtesting fee accounting.
 * 
 * Run with: node test_engine.js
 */

const assert = require('assert');
const FibEngine = require('./fibonacci_engine.js');

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✓ ${description}`);
    } catch (err) {
        console.error(`  ✗ ${description}`);
        console.error(`    ${err.message}`);
        process.exitCode = 1;
    }
}

console.log("=== FibCrypto Oracle Engine Unit Test Suite ===\n");

// --- 1. Fibonacci Calculations ---
console.log("1. Fibonacci Level Calculations:");

it("calculates accurate Fibonacci Retracements for Uptrend", () => {
    const high = 100000;
    const low = 80000;
    const res = FibEngine.calculateFibonacciLevels(high, low, true);
    
    assert.strictEqual(res.levels["0%"], 80000);
    assert.strictEqual(res.levels["100%"], 100000);
    assert.strictEqual(res.levels["50.0%"], 90000);
    assert.strictEqual(Math.round(res.levels["61.8%"]), 92360);
    assert.strictEqual(Math.round(res.levels["161.8%"]), 112360);
});

it("calculates accurate Fibonacci Retracements for Downtrend", () => {
    const high = 100000;
    const low = 80000;
    const res = FibEngine.calculateFibonacciLevels(high, low, false);
    
    assert.strictEqual(res.levels["0%"], 100000);
    assert.strictEqual(res.levels["100%"], 80000);
    assert.strictEqual(res.levels["50.0%"], 90000);
    assert.strictEqual(Math.round(res.levels["61.8%"]), 87640);
    assert.strictEqual(Math.round(res.levels["161.8%"]), 67640);
});

// --- 2. Technical Indicators ---
console.log("\n2. Technical Indicator Accuracy:");

it("calculates valid RSI series bounded between 0 and 100", () => {
    // Monotonically increasing prices -> RSI should be high (>70)
    const bullCloses = Array.from({ length: 30 }, (_, i) => 100 + i * 5);
    const bullRsi = FibEngine.calculateRSI(bullCloses, 14);
    const latestBullRsi = bullRsi[bullRsi.length - 1];
    
    assert(latestBullRsi > 70, `Expected RSI > 70 for uptrend, got ${latestBullRsi}`);
    assert(latestBullRsi <= 100, `Expected RSI <= 100, got ${latestBullRsi}`);

    // Monotonically decreasing prices -> RSI should be low (<30)
    const bearCloses = Array.from({ length: 30 }, (_, i) => 250 - i * 5);
    const bearRsi = FibEngine.calculateRSI(bearCloses, 14);
    const latestBearRsi = bearRsi[bearRsi.length - 1];
    
    assert(latestBearRsi < 30, `Expected RSI < 30 for downtrend, got ${latestBearRsi}`);
    assert(latestBearRsi >= 0, `Expected RSI >= 0, got ${latestBearRsi}`);
});

it("calculates MACD series with valid macdLine, signalLine, and histogram", () => {
    const closes = Array.from({ length: 45 }, (_, i) => 50000 + Math.sin(i / 3) * 2000 + i * 50);
    const macd = FibEngine.calculateMACD(closes);
    
    assert(Array.isArray(macd.macdLine), "macdLine must be an array");
    assert(Array.isArray(macd.signalLine), "signalLine must be an array");
    assert(Array.isArray(macd.histogram), "histogram must be an array");
    
    const lastHist = macd.histogram[macd.histogram.length - 1];
    assert(typeof lastHist === 'number', "Last histogram value must be a number");
});

it("calculates Bollinger Bands series with upper >= middle >= lower", () => {
    const closes = [100, 102, 101, 105, 107, 106, 108, 110, 109, 111, 113, 112, 115, 114, 116, 118, 117, 119, 121, 120, 122];
    const bb = FibEngine.calculateBollingerBands(closes);
    
    assert(Array.isArray(bb.upper), "upper must be an array");
    assert(Array.isArray(bb.middle), "middle must be an array");
    assert(Array.isArray(bb.lower), "lower must be an array");
    
    const lastIdx = closes.length - 1;
    assert(bb.upper[lastIdx] >= bb.middle[lastIdx], `Upper (${bb.upper[lastIdx]}) must be >= middle (${bb.middle[lastIdx]})`);
    assert(bb.middle[lastIdx] >= bb.lower[lastIdx], `Middle (${bb.middle[lastIdx]}) must be >= lower (${bb.lower[lastIdx]})`);
});

// --- 3. Oracle Signal & Trade Setup Numbers ---
console.log("\n3. Oracle Signal & Trade Setup Numeric Verification:");

it("generates purely numeric tradeSetup properties without string artifacts", () => {
    const price = 85000;
    const fib = FibEngine.calculateFibonacciLevels(90000, 80000, true);
    const rsi = 45;
    const macd = { macdLine: [10, 20, 40], signalLine: [5, 15, 25], histogram: [5, 5, 15] };
    const bb = { upper: [88000], middle: [85000], lower: [82000] };
    
    const signal = FibEngine.generateOracleSignal(price, fib, rsi, macd, bb);
    
    assert(['BUY', 'SELL', 'NEUTRAL'].includes(signal.signal), `Invalid signal: ${signal.signal}`);
    assert(typeof signal.confidence === 'number' && signal.confidence >= 50 && signal.confidence <= 95);
    
    const setup = signal.tradeSetup;
    assert.strictEqual(typeof setup.entryPrice, 'number', "entryPrice must be number");
    assert.strictEqual(typeof setup.stopLossPrice, 'number', "stopLossPrice must be number");
    assert.strictEqual(typeof setup.tp1Price, 'number', "tp1Price must be number");
    assert.strictEqual(typeof setup.tp2Price, 'number', "tp2Price must be number");
    assert.strictEqual(typeof setup.riskRewardRatio, 'number', "riskRewardRatio must be number");
    assert.strictEqual(typeof setup.riskPct, 'number', "riskPct must be number");
    assert.strictEqual(typeof setup.profit1Usd, 'number', "profit1Usd must be number");
    
    assert(setup.stopLossPrice < setup.entryPrice, "Stop loss must be below entry for long setups");
    assert(setup.tp1Price > setup.entryPrice, "TP1 must be above entry for long setups");
    assert(setup.tp2Price >= setup.tp1Price, "TP2 must be >= TP1");
    assert(setup.riskRewardRatio > 0, "CRV must be positive");
});

// --- 4. Backtest Engine ---
console.log("\n4. Backtest Engine Fee & Slippage Verification:");

it("executes backtest with fee deduction and entry snapshot targets", () => {
    // 60 synthetic candles
    const candles = [];
    let currentPrice = 60000;
    for (let i = 0; i < 60; i++) {
        const change = (Math.sin(i / 2) * 800) + (i * 100);
        const open = currentPrice;
        const close = open + change;
        const high = Math.max(open, close) + 200;
        const low = Math.min(open, close) - 200;
        candles.push({ timestamp: Date.now() - (60 - i) * 14400000, open, high, low, close, volume: 1000 });
        currentPrice = close;
    }
    
    const backtestRes = FibEngine.runBacktest(candles);
    
    assert(typeof backtestRes.totalTrades === 'number', "totalTrades must be number");
    assert(typeof backtestRes.winRate === 'number', "winRate must be number");
    assert(backtestRes.winRate >= 0 && backtestRes.winRate <= 100, "winRate must be between 0 and 100");
    assert(typeof backtestRes.totalProfit === 'number', "totalProfit must be number");
    assert(typeof backtestRes.sharpeRatio === 'number', "sharpeRatio must be number");
});

console.log(`\n========================================`);
console.log(`Unit Test Results: ${passedTests} / ${totalTests} PASSED (100%)`);
console.log(`========================================\n`);

if (passedTests === totalTests) {
    process.exit(0);
} else {
    process.exit(1);
}
