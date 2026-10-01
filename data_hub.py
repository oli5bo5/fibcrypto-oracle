import json
import os
import time
import threading
import urllib.request
import urllib.parse
import urllib.error
import concurrent.futures
from market_hours import get_market_status

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
ASSETS_PATH = os.path.join(DIRECTORY, "assets.json")
START_TIME = time.time()

# ------------------------------------------------------------------------------
# In-Memory Thread-Safe TTL Cache
# ------------------------------------------------------------------------------
class TTLCache:
    def __init__(self):
        self._lock = threading.Lock()
        self._store = {} # key -> (data, expires_at, created_at)
        self.stats = {"hits": 0, "misses": 0, "sets": 0}

    def get(self, key, allow_stale=False):
        now = time.time()
        with self._lock:
            if key in self._store:
                data, expires_at, created_at = self._store[key]
                if now <= expires_at:
                    self.stats["hits"] += 1
                    return data, False
                elif allow_stale and (now - created_at < 600): # max 10 min stale
                    self.stats["hits"] += 1
                    return data, True
                else:
                    del self._store[key]
            self.stats["misses"] += 1
            return None, False

    def set(self, key, data, ttl_seconds):
        with self._lock:
            self._store[key] = (data, time.time() + ttl_seconds, time.time())
            self.stats["sets"] += 1

    def count(self):
        with self._lock:
            return len(self._store)

cache = TTLCache()

# ------------------------------------------------------------------------------
# Assets Loader & Symbol Mapping
# ------------------------------------------------------------------------------
def load_assets():
    try:
        if os.path.exists(ASSETS_PATH):
            with open(ASSETS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"[DATA HUB WARN] Failed to load assets.json: {e}")
    return {"crypto": [], "stocks": []}

ASSETS = load_assets()

def get_crypto_meta(symbol):
    sym_clean = symbol.upper().replace("-", "").replace("/", "")
    if sym_clean == "MATICUSDT": sym_clean = "POLUSDT"
    for c in ASSETS.get("crypto", []):
        if c["symbol"] == sym_clean or c.get("alias") == sym_clean:
            return c
    return {
        "symbol": sym_clean,
        "name": sym_clean.replace("USDT", ""),
        "providers": {
            "okx": sym_clean.replace("USDT", "-USDT"),
            "kraken": sym_clean.replace("BTCUSDT", "XBTUSDT"),
            "binance": sym_clean
        }
    }

def get_stock_meta(symbol):
    sym_clean = symbol.upper()
    for s in ASSETS.get("stocks", []):
        if s["symbol"].upper() == sym_clean:
            return s
    return {
        "symbol": sym_clean,
        "name": sym_clean,
        "exchange": "XETRA" if sym_clean.endswith(".DE") else "NASDAQ",
        "currency": "EUR" if sym_clean.endswith(".DE") else "USD"
    }

# ------------------------------------------------------------------------------
# Host Failure Tracker
# ------------------------------------------------------------------------------
failed_hosts = {}
failed_lock = threading.Lock()

def is_host_failed(host):
    with failed_lock:
        if host in failed_hosts:
            if time.time() - failed_hosts[host] < 300: # 5 min cooldown
                return True
            del failed_hosts[host]
        return False

def mark_host_failed(host):
    with failed_lock:
        failed_hosts[host] = time.time()

# ------------------------------------------------------------------------------
# Provider HTTP Helper
# ------------------------------------------------------------------------------
def fetch_json(url, timeout=3.5, headers=None):
    if headers is None:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FibCrypto/14.2'}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status == 200:
            return json.loads(resp.read().decode('utf-8'))
    return None

# ------------------------------------------------------------------------------
# Krypto Ticker & Failover Chain (OKX -> Kraken -> Binance -> Coinbase)
# ------------------------------------------------------------------------------
def get_crypto_ticker(symbol):
    meta = get_crypto_meta(symbol)
    std_sym = meta["symbol"]
    cache_key = f"ticker:crypto:{std_sym}"

    cached_data, is_stale = cache.get(cache_key, allow_stale=False)
    if cached_data:
        return cached_data

    # 1. Primary: OKX Public Market Ticker
    okx_id = meta.get("providers", {}).get("okx", std_sym.replace("USDT", "-USDT"))
    try:
        data = fetch_json(f"https://www.okx.com/api/v5/market/ticker?instId={okx_id}", timeout=3.0)
        if data and data.get("code") == "0" and data.get("data"):
            d = data["data"][0]
            last = float(d.get("last", 0))
            open24 = float(d.get("open24h", last))
            change_pct = ((last - open24) / open24 * 100) if open24 > 0 else 0.0
            vol = float(d.get("vol24h", 0))
            vol_ccy = float(d.get("volCcy24h", 0))

            payload = {
                "symbol": std_sym,
                "lastPrice": str(last),
                "priceChangePercent": f"{change_pct:+.2f}",
                "volume": str(vol),
                "quoteVolume": str(vol_ccy),
                "highPrice": d.get("high24h", str(last)),
                "lowPrice": d.get("low24h", str(last)),
                "provider": "OKX",
                "isConsolidated": False
            }
            cache.set(cache_key, payload, ttl_seconds=5)
            return payload
    except Exception as e_okx:
        pass

    # 2. Secondary: Kraken Public Ticker
    krk_pair = meta.get("providers", {}).get("kraken", "XBTUSDT" if "BTC" in std_sym else std_sym)
    try:
        data = fetch_json(f"https://api.kraken.com/0/public/Ticker?pair={krk_pair}", timeout=3.0)
        if data and "result" in data:
            pair_key = list(data["result"].keys())[0]
            d = data["result"][pair_key]
            last = float(d["c"][0])
            open24 = float(d["o"])
            change_pct = ((last - open24) / open24 * 100) if open24 > 0 else 0.0
            vol = float(d["v"][1]) # 24h volume
            high24 = float(d["h"][1])
            low24 = float(d["l"][1])

            payload = {
                "symbol": std_sym,
                "lastPrice": str(last),
                "priceChangePercent": f"{change_pct:+.2f}",
                "volume": str(vol),
                "quoteVolume": str(vol * last),
                "highPrice": str(high24),
                "lowPrice": str(low24),
                "provider": "Kraken",
                "isConsolidated": False
            }
            cache.set(cache_key, payload, ttl_seconds=5)
            return payload
    except Exception as e_krk:
        pass

    # 3. Tertiary: Binance REST Hosts (Proxy Fallback)
    for host in ['https://api.binance.com', 'https://api1.binance.com']:
        if is_host_failed(host): continue
        try:
            data = fetch_json(f"{host}/api/v3/ticker/24hr?symbol={std_sym}", timeout=3.0)
            if data and "lastPrice" in data:
                data["provider"] = "Binance"
                cache.set(cache_key, data, ttl_seconds=5)
                return data
        except Exception:
            mark_host_failed(host)

    # 4. Fallback to stale cache if available
    stale_data, _ = cache.get(cache_key, allow_stale=True)
    if stale_data:
        stale_copy = dict(stale_data)
        stale_copy["isStale"] = True
        return stale_copy

    return None

# ------------------------------------------------------------------------------
# Krypto Klines & Failover Chain (OKX -> Kraken -> Binance)
# ------------------------------------------------------------------------------
def get_crypto_klines(symbol, interval="4h", limit=100):
    meta = get_crypto_meta(symbol)
    std_sym = meta["symbol"]
    cache_key = f"klines:crypto:{std_sym}:{interval}:{limit}"

    cached_data, is_stale = cache.get(cache_key, allow_stale=False)
    if cached_data:
        return cached_data

    # 1. Primary: OKX Public Market Candles API
    okx_id = meta.get("providers", {}).get("okx", std_sym.replace("USDT", "-USDT"))
    okx_interval = '4H' if interval == '4h' else ('1H' if interval == '1h' else '1D')
    try:
        url = f"https://www.okx.com/api/v5/market/candles?instId={okx_id}&bar={okx_interval}&limit={limit}"
        data = fetch_json(url, timeout=3.5)
        if data and data.get("code") == "0" and data.get("data"):
            okx_candles = data["data"]
            binance_klines = []
            for c in reversed(okx_candles):
                binance_klines.append([
                    int(c[0]),          # Open time ms
                    c[1],               # Open
                    c[2],               # High
                    c[3],               # Low
                    c[4],               # Close
                    c[5],               # Volume
                    int(c[0]) + 3600000,
                    "0.0", 0, "0.0", "0.0", "0.0"
                ])
            cache.set(cache_key, binance_klines, ttl_seconds=60)
            return binance_klines
    except Exception as e_okx:
        pass

    # 2. Secondary: Kraken Public OHLC API
    krk_pair = meta.get("providers", {}).get("kraken", "XBTUSDT" if "BTC" in std_sym else std_sym)
    krk_min = 240 if interval == "4h" else (60 if interval == "1h" else 1440)
    try:
        url = f"https://api.kraken.com/0/public/OHLC?pair={krk_pair}&interval={krk_min}"
        data = fetch_json(url, timeout=3.5)
        if data and "result" in data:
            pair_key = [k for k in data["result"].keys() if k != "last"][0]
            raw_candles = data["result"][pair_key][-int(limit):]
            binance_klines = []
            for c in raw_candles:
                ts_ms = int(c[0]) * 1000
                binance_klines.append([
                    ts_ms,
                    str(c[1]),          # Open
                    str(c[2]),          # High
                    str(c[3]),          # Low
                    str(c[4]),          # Close
                    str(c[6]),          # Volume
                    ts_ms + (krk_min * 60000),
                    "0.0", 0, "0.0", "0.0", "0.0"
                ])
            cache.set(cache_key, binance_klines, ttl_seconds=60)
            return binance_klines
    except Exception as e_krk:
        pass

    # 3. Tertiary: Binance REST Hosts
    for host in ['https://api.binance.com', 'https://api1.binance.com', 'https://api2.binance.com']:
        if is_host_failed(host): continue
        try:
            url = f"{host}/api/v3/klines?symbol={std_sym}&interval={interval}&limit={limit}"
            data = fetch_json(url, timeout=3.5)
            if data and isinstance(data, list) and len(data) > 0:
                cache.set(cache_key, data, ttl_seconds=60)
                return data
        except Exception:
            mark_host_failed(host)

    # 4. Fallback to stale cache
    stale_data, _ = cache.get(cache_key, allow_stale=True)
    if stale_data:
        return stale_data

    return None

# ------------------------------------------------------------------------------
# Multi-Exchange Spread & Arbitrage Detection
# ------------------------------------------------------------------------------
def get_market_spread(symbol):
    meta = get_crypto_meta(symbol)
    std_sym = meta["symbol"]
    cache_key = f"spread:crypto:{std_sym}"

    cached_data, _ = cache.get(cache_key, allow_stale=False)
    if cached_data:
        return cached_data

    prices = {}

    def fetch_okx():
        try:
            okx_id = meta.get("providers", {}).get("okx", std_sym.replace("USDT", "-USDT"))
            data = fetch_json(f"https://www.okx.com/api/v5/market/ticker?instId={okx_id}", timeout=2.5)
            if data and data.get("data"):
                return "OKX", float(data["data"][0]["last"])
        except Exception:
            pass
        return "OKX", None

    def fetch_kraken():
        try:
            krk_pair = meta.get("providers", {}).get("kraken", "XBTUSDT" if "BTC" in std_sym else std_sym)
            data = fetch_json(f"https://api.kraken.com/0/public/Ticker?pair={krk_pair}", timeout=2.5)
            if data and "result" in data:
                pair_key = list(data["result"].keys())[0]
                return "Kraken", float(data["result"][pair_key]["c"][0])
        except Exception:
            pass
        return "Kraken", None

    def fetch_binance():
        for host in ['https://api.binance.com', 'https://api1.binance.com']:
            if is_host_failed(host): continue
            try:
                data = fetch_json(f"{host}/api/v3/ticker/price?symbol={std_sym}", timeout=2.5)
                if data and "price" in data:
                    return "Binance", float(data["price"])
            except Exception:
                mark_host_failed(host)
        return "Binance", None

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(fetch_okx), executor.submit(fetch_kraken), executor.submit(fetch_binance)]
        for f in concurrent.futures.as_completed(futures):
            src, p = f.result()
            if p is not None and p > 0:
                prices[src] = p

    if not prices:
        # Fallback to single ticker
        t = get_crypto_ticker(std_sym)
        if t:
            prices[t.get("provider", "OKX")] = float(t.get("lastPrice", 0))

    valid_vals = list(prices.values())
    if valid_vals:
        median_price = sorted(valid_vals)[len(valid_vals) // 2]
        max_p = max(valid_vals)
        min_p = min(valid_vals)
        spread_pct = ((max_p - min_p) / median_price * 100) if median_price > 0 else 0.0

        payload = {
            "symbol": std_sym,
            "prices": prices,
            "medianPrice": median_price,
            "spreadPct": round(spread_pct, 4),
            "spreadWarning": spread_pct > 0.3,
            "status": "Erhöhter Spread (>0.3%)" if spread_pct > 0.3 else "Normal (Konsolidiert)",
            "sourcesCount": len(prices)
        }
        cache.set(cache_key, payload, ttl_seconds=5)
        return payload

    return {"symbol": std_sym, "prices": {}, "medianPrice": 0, "spreadPct": 0.0, "spreadWarning": False}

# ------------------------------------------------------------------------------
# Stock Provider: Yahoo Finance Native v8 Engine (XETRA & US Stocks)
# ------------------------------------------------------------------------------
def get_stock_quote(symbol):
    meta = get_stock_meta(symbol)
    std_sym = meta["symbol"]
    cache_key = f"quote:stock:{std_sym}"

    cached_data, is_stale = cache.get(cache_key, allow_stale=False)
    if cached_data:
        return cached_data

    exchange = meta.get("exchange", "XETRA" if std_sym.endswith(".DE") else "NASDAQ")
    status = get_market_status(exchange, "stock")

    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{std_sym}?interval=1d&range=5d"
        data = fetch_json(url, timeout=4.0)
        if data and "chart" in data and data["chart"].get("result"):
            res = data["chart"]["result"][0]
            chart_meta = res.get("meta", {})
            last_price = float(chart_meta.get("regularMarketPrice", 0))
            prev_close = float(chart_meta.get("previousClose", chart_meta.get("chartPreviousClose", last_price)))
            change_pct = ((last_price - prev_close) / prev_close * 100) if prev_close > 0 else 0.0
            
            day_high = float(chart_meta.get("regularMarketDayHigh", last_price))
            day_low = float(chart_meta.get("regularMarketDayLow", last_price))
            currency = chart_meta.get("currency", meta.get("currency", "EUR"))
            real_exchange = chart_meta.get("exchangeName", exchange)

            # Volume from quote
            quote_data = res.get("indicators", {}).get("quote", [{}])[0]
            vol_list = quote_data.get("volume", [])
            vol = vol_list[-1] if (vol_list and vol_list[-1] is not None) else 0

            payload = {
                "symbol": std_sym,
                "name": meta.get("name", std_sym),
                "display": meta.get("display", std_sym),
                "lastPrice": str(round(last_price, 2)),
                "priceChangePercent": f"{change_pct:+.2f}",
                "volume": str(vol),
                "highPrice": str(round(day_high, 2)),
                "lowPrice": str(round(day_low, 2)),
                "currency": currency,
                "exchange": real_exchange,
                "marketState": status["status"],
                "isOpen": status["isOpen"],
                "marketNotice": status["notice"],
                "delayNotice": f"Quelle: {real_exchange} (15 Min. verzögert)",
                "class": "stock",
                "sector": meta.get("sector", "Aktienmarkt")
            }
            cache.set(cache_key, payload, ttl_seconds=60)
            return payload
    except Exception as e_stock:
        print(f"[DATA HUB ERROR] Stock quote fetch failed for {std_sym}: {e_stock}")

    # Fallback to stale cache if available
    stale_data, _ = cache.get(cache_key, allow_stale=True)
    if stale_data:
        stale_copy = dict(stale_data)
        stale_copy["isStale"] = True
        return stale_copy

    return None

def get_stock_klines(symbol, interval="1d", limit=100):
    meta = get_stock_meta(symbol)
    std_sym = meta["symbol"]
    cache_key = f"klines:stock:{std_sym}:{interval}:{limit}"

    cached_data, is_stale = cache.get(cache_key, allow_stale=False)
    if cached_data:
        return cached_data

    # Map intervals to Yahoo Finance query parameters
    if interval == "1h":
        yf_interval = "1h"
        yf_range = "1mo"
    elif interval == "4h":
        # Yahoo Finance doesn't offer native 4h candles, we use 1h candles with 3mo range
        yf_interval = "1h"
        yf_range = "3mo"
    else:
        yf_interval = "1d"
        yf_range = "1y"

    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{std_sym}?interval={yf_interval}&range={yf_range}"
        data = fetch_json(url, timeout=4.5)
        if data and "chart" in data and data["chart"].get("result"):
            res = data["chart"]["result"][0]
            timestamps = res.get("timestamp", [])
            indicators = res.get("indicators", {}).get("quote", [{}])[0]

            opens = indicators.get("open", [])
            highs = indicators.get("high", [])
            lows = indicators.get("low", [])
            closes = indicators.get("close", [])
            volumes = indicators.get("volume", [])

            binance_klines = []
            for i in range(len(timestamps)):
                o = opens[i] if i < len(opens) else None
                h = highs[i] if i < len(highs) else None
                l = lows[i] if i < len(lows) else None
                c = closes[i] if i < len(closes) else None
                v = volumes[i] if i < len(volumes) else 0

                # Skip any incomplete or null trading sessions (market closed gaps)
                if o is None or h is None or l is None or c is None:
                    continue

                ts_ms = int(timestamps[i]) * 1000
                binance_klines.append([
                    ts_ms,
                    str(round(o, 2)),
                    str(round(h, 2)),
                    str(round(l, 2)),
                    str(round(c, 2)),
                    str(v or 0),
                    ts_ms + 86400000,
                    "0.0", 0, "0.0", "0.0", "0.0"
                ])

            # Slice to requested limit
            final_klines = binance_klines[-int(limit):] if len(binance_klines) > int(limit) else binance_klines
            cache.set(cache_key, final_klines, ttl_seconds=900) # 15 min cache
            return final_klines
    except Exception as e_kline:
        print(f"[DATA HUB ERROR] Stock klines fetch failed for {std_sym}: {e_kline}")

    stale_data, _ = cache.get(cache_key, allow_stale=True)
    if stale_data:
        return stale_data

    return None

# ------------------------------------------------------------------------------
# System Health Check
# ------------------------------------------------------------------------------
def get_health_status():
    uptime_sec = int(time.time() - START_TIME)
    
    # Check OKX connectivity
    okx_status = "OK"
    try:
        r = fetch_json("https://www.okx.com/api/v5/public/time", timeout=2.0)
        if not r or r.get("code") != "0": okx_status = "DEGRADED"
    except Exception:
        okx_status = "UNAVAILABLE"

    # Check Kraken connectivity
    kraken_status = "OK"
    try:
        r = fetch_json("https://api.kraken.com/0/public/Time", timeout=2.0)
        if not r or "result" not in r: kraken_status = "DEGRADED"
    except Exception:
        kraken_status = "UNAVAILABLE"

    # Check Yahoo Finance connectivity
    yahoo_status = "OK"
    try:
        r = fetch_json("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d", timeout=2.0)
        if not r or "chart" not in r: yahoo_status = "DEGRADED"
    except Exception:
        yahoo_status = "UNAVAILABLE"

    return {
        "status": "UP",
        "uptimeSeconds": uptime_sec,
        "providers": {
            "okx": okx_status,
            "kraken": kraken_status,
            "yahoo_finance": yahoo_status,
            "binance": "PROXY_FALLBACK"
        },
        "cache": {
            "cachedItems": cache.count(),
            "stats": cache.stats
        },
        "assets": {
            "cryptoCount": len(ASSETS.get("crypto", [])),
            "stocksCount": len(ASSETS.get("stocks", []))
        }
    }
