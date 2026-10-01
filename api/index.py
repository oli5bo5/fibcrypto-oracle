from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import os
import sys

# Ensure parent and current directory are on sys.path
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

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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

        try:
            if path.endswith('/healthz'):
                send_json(data_hub.get_health_status(), 200, 'no-cache')
                return

            if path.endswith('/api/ticker') or path == '/ticker':
                symbol = qs.get('symbol', ['BTCUSDT'])[0]
                data = data_hub.get_ticker(symbol)
                if data:
                    send_json(data, 200, 'public, max-age=5, s-maxage=5')
                else:
                    send_json({'error': f'Failed to fetch ticker for {symbol}'}, 502)
                return

            if path.endswith('/api/klines') or path == '/klines':
                symbol = qs.get('symbol', ['BTCUSDT'])[0]
                interval = qs.get('interval', ['4h'])[0]
                limit = int(qs.get('limit', ['100'])[0])
                data = data_hub.get_klines(symbol, interval, limit)
                if data:
                    send_json(data, 200, 'public, max-age=15, s-maxage=15')
                else:
                    send_json({'error': f'Failed to fetch klines for {symbol}'}, 502)
                return

            if path.endswith('/api/stock/quote') or path == '/stock/quote':
                symbol = qs.get('symbol', ['SAP.DE'])[0]
                data = data_hub.get_stock_quote(symbol)
                if data:
                    send_json(data, 200, 'public, max-age=30, s-maxage=30')
                else:
                    send_json({'error': f'Failed to fetch stock quote for {symbol}'}, 502)
                return

            if path.endswith('/api/stock/klines') or path == '/stock/klines':
                symbol = qs.get('symbol', ['SAP.DE'])[0]
                interval = qs.get('interval', ['1d'])[0]
                limit = int(qs.get('limit', ['100'])[0])
                data = data_hub.get_stock_klines(symbol, interval, limit)
                if data:
                    send_json(data, 200, 'public, max-age=60, s-maxage=60')
                else:
                    send_json({'error': f'Failed to fetch stock klines for {symbol}'}, 502)
                return

            if path.endswith('/api/market/spread') or path == '/market/spread':
                symbol = qs.get('symbol', ['BTCUSDT'])[0]
                data = data_hub.get_market_spread(symbol)
                if data:
                    send_json(data, 200, 'public, max-age=5, s-maxage=5')
                else:
                    send_json({'error': f'Failed to calculate spread for {symbol}'}, 502)
                return

            # Default 404
            send_json({'error': 'Endpoint not found', 'path': self.path}, 404)

        except Exception as e:
            send_json({'error': f'Serverless execution error: {str(e)}'}, 500)
