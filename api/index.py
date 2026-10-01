from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
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

        # Helpers
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
            # 1. Check rewrite parameters
            route = qs.get('__route__', [''])[0]
            requested_file = qs.get('__file__', [''])[0]

            # Route detection from path if route param not used
            if not route:
                if '/api/ticker' in path: route = 'ticker'
                elif '/api/klines' in path: route = 'klines'
                elif '/api/stock/quote' in path: route = 'stock/quote'
                elif '/api/stock/klines' in path: route = 'stock/klines'
                elif '/api/market/spread' in path: route = 'market/spread'
                elif 'healthz' in path: route = 'healthz'

            # -------------------------------------------------------------
            # API Endpoints
            # -------------------------------------------------------------
            if route == 'healthz':
                send_json(data_hub.get_health_status(), 200, 'no-cache')
                return

            if route == 'ticker':
                symbol = qs.get('symbol', ['BTCUSDT'])[0]
                data = data_hub.get_ticker(symbol)
                if data:
                    send_json(data, 200, 'public, max-age=5, s-maxage=5')
                else:
                    send_json({'error': f'Failed to fetch ticker for {symbol}'}, 502)
                return

            if route == 'klines':
                symbol = qs.get('symbol', ['BTCUSDT'])[0]
                interval = qs.get('interval', ['4h'])[0]
                limit = int(qs.get('limit', ['100'])[0])
                data = data_hub.get_klines(symbol, interval, limit)
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
            # Static File Serving (Root, CSS, JS, JSON, PDF)
            # -------------------------------------------------------------
            target = requested_file or path.lstrip('/')
            if not target or target == '/' or target == 'index.html':
                send_file(os.path.join(BASE_DIR, 'index.html'), 'text/html; charset=utf-8', 'no-cache')
                return

            # Security: Prevent directory traversal
            clean_target = os.path.normpath(target).lstrip(r'\/')
            if clean_target.startswith('..'):
                send_json({'error': 'Forbidden'}, 403)
                return

            safe_path = os.path.join(BASE_DIR, clean_target)
            if os.path.exists(safe_path) and os.path.isfile(safe_path):
                send_file(safe_path)
                return

            # Default 404
            send_json({'error': 'Endpoint or resource not found', 'path': self.path, 'route': route, 'target': target}, 404)

        except Exception as e:
            send_json({'error': f'Serverless execution error: {str(e)}'}, 500)
