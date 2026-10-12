import http.server
import socketserver
import urllib.request
import urllib.parse
import urllib.error
import json
import sys
import os
import time

import data_hub

HOST = "127.0.0.1"
PORT = 8085
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Multi-threaded non-blocking HTTP Server
class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        clean_path = parsed_url.path

        # Antigravity alias routes
        if clean_path in ['/antigravity', '/antigravity/']:
            self.path = '/index.html'
            super().do_GET()
            return
        elif clean_path.startswith('/antigravity/'):
            subpath = clean_path[len('/antigravity'):]
            self.path = subpath if parsed_url.query == '' else f"{subpath}?{parsed_url.query}"
            super().do_GET()
            return

        # ----------------------------------------------------------------------
        # REST API Routes
        # ----------------------------------------------------------------------
        params = urllib.parse.parse_qs(parsed_url.query)

        # 1. Health-Check Endpoint
        if clean_path == '/healthz':
            health_data = data_hub.get_health_status()
            self.send_json_response(json.dumps(health_data).encode('utf-8'))
            return

        # 2. Asset Catalog Endpoint
        if clean_path in ['/api/assets', '/api/symbols']:
            assets_data = data_hub.ASSETS
            self.send_json_response(json.dumps(assets_data).encode('utf-8'))
            return

        # 3. Multi-Exchange Arbitrage Spread Endpoint
        if clean_path == '/api/market/spread':
            symbol = params.get('symbol', ['BTCUSDT'])[0]
            spread_data = data_hub.get_market_spread(symbol)
            self.send_json_response(json.dumps(spread_data).encode('utf-8'))
            return

        # 3b. Blockworks × FibCrypto Intelligence Endpoints
        if clean_path == '/api/market/top-assets':
            limit = int(params.get('limit', ['16'])[0])
            self.send_json_response(json.dumps(data_hub.get_top_assets(limit)).encode('utf-8'))
            return

        if clean_path == '/api/news':
            asset = params.get('asset', ['BTCUSDT'])[0]
            limit = int(params.get('limit', ['15'])[0])
            self.send_json_response(json.dumps(data_hub.get_asset_news(asset, limit)).encode('utf-8'))
            return

        if clean_path.startswith('/api/social/'):
            asset = params.get('asset', ['BTCUSDT'])[0]
            timespan = params.get('timespan', ['7d'])[0]
            self.send_json_response(json.dumps(data_hub.get_social_mindshare(asset, timespan)).encode('utf-8'))
            return

        if clean_path.startswith('/api/unlocks/'):
            asset = params.get('asset', ['BTCUSDT'])[0]
            days = int(params.get('days', ['90'])[0])
            self.send_json_response(json.dumps(data_hub.get_token_unlocks(asset, days)).encode('utf-8'))
            return

        if clean_path.startswith('/api/onchain/'):
            asset = params.get('asset', ['BTCUSDT'])[0]
            self.send_json_response(json.dumps(data_hub.get_onchain_metrics(asset)).encode('utf-8'))
            return

        if clean_path.startswith('/api/ai/'):
            asset = params.get('asset', ['BTCUSDT'])[0]
            signal_info = {
                'action': params.get('action', ['KAUFSIGNAL'])[0],
                'confidence': params.get('confidence', ['82'])[0],
                'entry': params.get('entry', [''])[0],
                'tp1': params.get('tp1', [''])[0],
                'sl': params.get('sl', [''])[0],
                'fibLevel': params.get('fibLevel', ['61.8%'])[0]
            }
            self.send_json_response(json.dumps(data_hub.explain_signal_ai(asset, signal_info)).encode('utf-8'))
            return

        if clean_path == '/api/mcp':
            tool = params.get('tool', ['catalog'])[0]
            asset = params.get('asset', ['BTC'])[0]
            assets_param = params.get('assets', ['BTC,ETH,SOL,INJ'])[0]
            query = params.get('query', ['BTC'])[0]
            res = data_hub.handle_mcp_request(tool, {
                'asset': asset,
                'assets': assets_param,
                'query': query,
                'timeframe': params.get('timeframe', ['4h'])[0]
            })
            self.send_json_response(json.dumps(res).encode('utf-8'))
            return

        # 4. Stock Endpoints (Quote & Klines)
        if clean_path == '/api/stock/quote':
            symbol = params.get('symbol', ['SAP.DE'])[0]
            quote = data_hub.get_stock_quote(symbol)
            if quote:
                self.send_json_response(json.dumps(quote).encode('utf-8'))
            else:
                self.send_error(502, f"Stock quote unavailable for {symbol}")
            return

        if clean_path == '/api/stock/klines':
            symbol = params.get('symbol', ['SAP.DE'])[0]
            interval = params.get('interval', ['1d'])[0]
            limit = int(params.get('limit', ['100'])[0])
            klines = data_hub.get_stock_klines(symbol, interval, limit)
            if klines:
                self.send_json_response(json.dumps(klines).encode('utf-8'))
            else:
                self.send_error(502, f"Stock klines unavailable for {symbol}")
            return

        # 5. Crypto Klines (OKX -> Kraken -> Binance)
        if clean_path == '/api/klines':
            symbol = params.get('symbol', ['BTCUSDT'])[0]
            interval = params.get('interval', ['4h'])[0]
            limit = int(params.get('limit', ['100'])[0])

            # Forward stock queries gracefully if sent to /api/klines
            if symbol.endswith('.DE') or symbol in ['AAPL', 'MSFT', 'NVDA', 'TSLA']:
                klines = data_hub.get_stock_klines(symbol, interval, limit)
            else:
                klines = data_hub.get_crypto_klines(symbol, interval, limit)

            if klines:
                self.send_json_response(json.dumps(klines).encode('utf-8'))
            else:
                self.send_error(502, "Bad Gateway: All upstream market data providers unavailable")
            return

        # 6. Crypto Ticker / Foreign Exchange
        if clean_path == '/api/ticker':
            symbol = params.get('symbol', ['BTCUSDT'])[0]

            # EUR/USD Foreign Exchange Special Handling
            if symbol == 'EURUSDT':
                self.handle_eur_fx()
                return

            # Forward stock queries gracefully if sent to /api/ticker
            if symbol.endswith('.DE') or symbol in ['AAPL', 'MSFT', 'NVDA', 'TSLA']:
                quote = data_hub.get_stock_quote(symbol)
                if quote:
                    self.send_json_response(json.dumps(quote).encode('utf-8'))
                    return

            ticker = data_hub.get_crypto_ticker(symbol)
            if ticker:
                self.send_json_response(json.dumps(ticker).encode('utf-8'))
            else:
                self.send_error(502, f"Ticker unavailable for {symbol}")
            return

        # Default static file handling
        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        clean_path = parsed_url.path
        content_len = int(self.headers.get('Content-Length', 0))
        body_raw = self.rfile.read(content_len).decode('utf-8') if content_len > 0 else '{}'
        try:
            body = json.loads(body_raw)
        except Exception:
            body = {}

        if clean_path.startswith('/api/ai/'):
            asset = body.get('asset', 'BTCUSDT')
            signal_info = body.get('signal', {})
            self.send_json_response(json.dumps(data_hub.explain_signal_ai(asset, signal_info)).encode('utf-8'))
            return

        if clean_path == '/api/mcp':
            tool = body.get('tool', 'fib_analyze_asset')
            args = body.get('args', body)
            self.send_json_response(json.dumps(data_hub.handle_mcp_request(tool, args)).encode('utf-8'))
            return

        self.send_json_response(json.dumps({'status': 'saved', 'received': body}).encode('utf-8'))


    def handle_eur_fx(self):
        # 1. Try Frankfurter Central Bank API
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FibCrypto/14.2'}
        try:
            frankfurter_url = "https://api.frankfurter.app/latest?from=USD&to=EUR"
            req = urllib.request.Request(frankfurter_url, headers=headers)
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                raw = json.loads(resp.read().decode('utf-8'))
                eur_rate = raw['rates']['EUR']
                usd_per_eur = 1.0 / eur_rate if eur_rate > 0 else 1.08
                payload = json.dumps({
                    "symbol": "EURUSDT",
                    "lastPrice": str(round(usd_per_eur, 4)),
                    "priceChangePercent": "0.00",
                    "rate": eur_rate
                }).encode('utf-8')
                self.send_json_response(payload)
                return
        except Exception:
            pass

        # 2. Fallback to OKX / Binance EUR-USDT
        t = data_hub.get_crypto_ticker("EURUSDT")
        if t:
            self.send_json_response(json.dumps(t).encode('utf-8'))
            return

        # 3. Static fallback
        self.send_json_response(json.dumps({
            "symbol": "EURUSDT",
            "lastPrice": "1.0800",
            "priceChangePercent": "0.00",
            "rate": 0.9259
        }).encode('utf-8'))

    def send_json_response(self, data_bytes):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        # Restrict CORS to localhost origins for security
        origin = self.headers.get('Origin', '')
        if 'localhost' in origin or '127.0.0.1' in origin:
            self.send_header('Access-Control-Allow-Origin', origin)
        else:
            self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:8085')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data_bytes)

def run_server():
    server_address = (HOST, PORT)
    httpd = ThreadedHTTPServer(server_address, ProxyHTTPRequestHandler)
    print(f"FibCrypto Oracle Multi-Asset Server running on http://{HOST}:{PORT}")
    print(f"Mapped route: http://{HOST}:{PORT}/antigravity -> index.html")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
