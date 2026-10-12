from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import urllib.request
import os
import sys
import mimetypes

# Ensure base directory is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

try:
    import data_hub
except ImportError:
    from api import data_hub

def get_eur_rate():
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FibCrypto/14.2'}
    try:
        url = "https://api.frankfurter.app/latest?from=USD&to=EUR"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            raw = json.loads(resp.read().decode('utf-8'))
            eur_rate = raw['rates']['EUR']
            usd_per_eur = 1.0 / eur_rate if eur_rate > 0 else 1.085
            return {
                "symbol": "EURUSDT",
                "lastPrice": str(round(usd_per_eur, 4)),
                "priceChangePercent": "+0.00"
            }
    except Exception:
        return {
            "symbol": "EURUSDT",
            "lastPrice": "1.0850",
            "priceChangePercent": "+0.00"
        }

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip('/')
        qs = urllib.parse.parse_qs(parsed.query)

        def send_json(data, status=200, cache_control='public, max-age=5, s-maxage=5'):
            resp_bytes = json.dumps(data).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', cache_control)
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)

        def send_file(file_path, content_type=None, cache_control='public, max-age=3600, s-maxage=86400'):
            if not os.path.exists(file_path) or not os.path.isfile(file_path):
                send_json({'error': 'File not found', 'file': os.path.basename(file_path)}, 404)
                return
            if not content_type:
                content_type, _ = mimetypes.guess_type(file_path)
                if not content_type:
                    content_type = 'application/octet-stream'
            
            with open(file_path, 'rb') as f:
                content = f.read()

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', cache_control)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        try:
            route = qs.get('__route__', [''])[0]
            requested_file = qs.get('__file__', [''])[0]

            if not route:
                if '/api/ticker' in path: route = 'ticker'
                elif '/api/klines' in path: route = 'klines'
                elif '/api/stock/quote' in path: route = 'stock/quote'
                elif '/api/stock/klines' in path: route = 'stock/klines'
                elif '/api/market/spread' in path: route = 'market/spread'
                elif '/api/market/top-assets' in path: route = 'market/top-assets'
                elif '/api/news' in path: route = 'news'
                elif '/api/social/' in path: route = 'social/mindshare'
                elif '/api/unlocks/' in path: route = 'unlocks/upcoming'
                elif '/api/onchain/' in path: route = 'onchain/metrics'
                elif '/api/ai/' in path: route = 'ai/explain-signal'
                elif '/api/mcp' in path: route = 'mcp'
                elif 'healthz' in path: route = 'healthz'

            # -------------------------------------------------------------
            # API Endpoints
            # -------------------------------------------------------------
            if route == 'healthz':
                send_json(data_hub.get_health_status(), 200, 'no-cache')
                return

            if route == 'market/top-assets':
                limit = int(qs.get('limit', ['16'])[0])
                send_json(data_hub.get_top_assets(limit), 200, 'public, max-age=15, s-maxage=15')
                return

            if route == 'news':
                asset = qs.get('asset', ['BTCUSDT'])[0]
                limit = int(qs.get('limit', ['15'])[0])
                send_json(data_hub.get_asset_news(asset, limit), 200, 'public, max-age=60, s-maxage=60')
                return

            if route.startswith('social/'):
                asset = qs.get('asset', ['BTCUSDT'])[0]
                timespan = qs.get('timespan', ['7d'])[0]
                send_json(data_hub.get_social_mindshare(asset, timespan), 200, 'public, max-age=30, s-maxage=30')
                return

            if route.startswith('unlocks/'):
                asset = qs.get('asset', ['BTCUSDT'])[0]
                days = int(qs.get('days', ['90'])[0])
                send_json(data_hub.get_token_unlocks(asset, days), 200, 'public, max-age=60, s-maxage=60')
                return

            if route.startswith('onchain/'):
                asset = qs.get('asset', ['BTCUSDT'])[0]
                send_json(data_hub.get_onchain_metrics(asset), 200, 'public, max-age=30, s-maxage=30')
                return

            if route.startswith('ai/'):
                asset = qs.get('asset', ['BTCUSDT'])[0]
                signal_info = {
                    'action': qs.get('action', ['KAUFSIGNAL'])[0],
                    'confidence': qs.get('confidence', ['82'])[0],
                    'entry': qs.get('entry', [''])[0],
                    'tp1': qs.get('tp1', [''])[0],
                    'sl': qs.get('sl', [''])[0],
                    'fibLevel': qs.get('fibLevel', ['61.8%'])[0]
                }
                send_json(data_hub.explain_signal_ai(asset, signal_info), 200, 'no-cache')
                return

            if route == 'mcp':
                tool = qs.get('tool', ['catalog'])[0]
                asset = qs.get('asset', ['BTC'])[0]
                assets_param = qs.get('assets', ['BTC,ETH,SOL,INJ'])[0]
                query = qs.get('query', ['BTC'])[0]
                send_json(data_hub.handle_mcp_request(tool, {
                    'asset': asset,
                    'assets': assets_param,
                    'query': query,
                    'timeframe': qs.get('timeframe', ['4h'])[0]
                }), 200, 'no-cache')
                return

            if route == 'ticker':
                symbol = qs.get('symbol', ['BTCUSDT'])[0]
                if symbol == 'EURUSDT':
                    send_json(get_eur_rate(), 200, 'public, max-age=60, s-maxage=60')
                    return
                if symbol.endswith('.DE') or symbol in ['AAPL', 'MSFT', 'NVDA', 'TSLA']:
                    quote = data_hub.get_stock_quote(symbol)
                    if quote:
                        send_json(quote, 200, 'public, max-age=30, s-maxage=30')
                        return

                data = data_hub.get_crypto_ticker(symbol)
                if data:
                    send_json(data, 200, 'public, max-age=5, s-maxage=5')
                else:
                    send_json({'error': f'Failed to fetch ticker for {symbol}'}, 502)
                return

            if route == 'klines':
                symbol = qs.get('symbol', ['BTCUSDT'])[0]
                interval = qs.get('interval', ['4h'])[0]
                limit = int(qs.get('limit', ['100'])[0])
                if symbol.endswith('.DE') or symbol in ['AAPL', 'MSFT', 'NVDA', 'TSLA']:
                    data = data_hub.get_stock_klines(symbol, interval, limit)
                else:
                    data = data_hub.get_crypto_klines(symbol, interval, limit)

                if data:
                    send_json(data, 200, 'public, max-age=15, s-maxage=15')
                else:
                    send_json({'error': f'Failed to fetch klines for {symbol}'}, 502)
                return

            if route == 'stock/quote':
                symbol = qs.get('symbol', ['SAP.DE'])[0]
                data = data_hub.get_stock_quote(symbol)
                if data:
                    send_json(data, 200, 'public, max-age=30, s-maxage=30')
                else:
                    send_json({'error': f'Failed to fetch stock quote for {symbol}'}, 502)
                return

            if route == 'stock/klines':
                symbol = qs.get('symbol', ['SAP.DE'])[0]
                interval = qs.get('interval', ['1d'])[0]
                limit = int(qs.get('limit', ['100'])[0])
                data = data_hub.get_stock_klines(symbol, interval, limit)
                if data:
                    send_json(data, 200, 'public, max-age=60, s-maxage=60')
                else:
                    send_json({'error': f'Failed to fetch stock klines for {symbol}'}, 502)
                return

            if route == 'market/spread':
                symbol = qs.get('symbol', ['BTCUSDT'])[0]
                data = data_hub.get_market_spread(symbol)
                if data:
                    send_json(data, 200, 'public, max-age=5, s-maxage=5')
                else:
                    send_json({'error': f'Failed to calculate spread for {symbol}'}, 502)
                return

            # -------------------------------------------------------------
            # Static File Serving
            # -------------------------------------------------------------
            target = requested_file or path.lstrip('/')
            if not target or target == '/' or target == 'index.html':
                send_file(os.path.join(BASE_DIR, 'index.html'), 'text/html; charset=utf-8', 'no-cache')
                return

            clean_target = os.path.normpath(target).lstrip(r'\/')
            if clean_target.startswith('..'):
                send_json({'error': 'Forbidden'}, 403)
                return

            safe_path = os.path.join(BASE_DIR, clean_target)
            if os.path.exists(safe_path) and os.path.isfile(safe_path):
                send_file(safe_path)
                return

            send_json({'error': 'Endpoint or resource not found', 'path': self.path, 'route': route, 'target': target}, 404)

        except Exception as e:
            send_json({'error': f'Serverless execution error: {str(e)}'}, 500)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip('/')
        qs = urllib.parse.parse_qs(parsed.query)
        route = qs.get('__route__', [''])[0]

        content_len = int(self.headers.get('Content-Length', 0))
        body_raw = self.rfile.read(content_len).decode('utf-8') if content_len > 0 else '{}'
        try:
            body = json.loads(body_raw)
        except Exception:
            body = {}

        def send_json(data, status=200):
            resp_bytes = json.dumps(data).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Content-Length', str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)

        try:
            if 'ai/explain-signal' in route or '/api/ai/' in path:
                asset = body.get('asset', 'BTCUSDT')
                signal_info = body.get('signal', {})
                send_json(data_hub.explain_signal_ai(asset, signal_info))
                return

            if route == 'mcp' or '/api/mcp' in path:
                tool = body.get('tool', 'fib_analyze_asset')
                args = body.get('args', body)
                send_json(data_hub.handle_mcp_request(tool, args))
                return

            send_json({'status': 'saved', 'received': body}, 200)
        except Exception as e:
            send_json({'error': str(e)}, 500)

