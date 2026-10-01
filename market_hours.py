import datetime

def get_market_status(exchange="XETRA", asset_class="stock"):
    """
    Evaluates current trading hours for stocks (XETRA, NASDAQ, NYSE) vs Crypto (24/7).
    Returns a structured status dict with isOpen, status code, exchange, and localized notice.
    """
    if asset_class.lower() == "crypto":
        return {
            "status": "OPEN",
            "isOpen": True,
            "exchange": "24/7 Global Crypto Network",
            "notice": "24/7 Live-Handel aktiv",
            "badgeClass": "badge-market-open"
        }

    # Use UTC to calculate timezone offsets accurately
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    weekday = now_utc.weekday() # 0 = Monday, 6 = Sunday

    # Weekend check: Saturday (5) or Sunday (6)
    if weekday in (5, 6):
        return {
            "status": "CLOSED",
            "isOpen": False,
            "exchange": exchange,
            "notice": f"Wochenende — {exchange} öffnet Montag früh",
            "badgeClass": "badge-market-closed",
            "reason": "weekend"
        }

    # Standard European / XETRA Hours: 09:00 - 17:30 CET (UTC+1 / UTC+2 in summer)
    # In October, Central European Summer Time (CEST) is UTC+2
    # In winter, CET is UTC+1. Let's approximate UTC+2 for October.
    if exchange.upper() in ("XETRA", "FRA", "GER"):
        cet_hour = (now_utc.hour + 2) % 24
        cet_min = now_utc.minute
        time_minutes = cet_hour * 60 + cet_min

        open_minutes = 9 * 60        # 09:00 CET
        close_minutes = 17 * 60 + 30 # 17:30 CET

        if open_minutes <= time_minutes < close_minutes:
            return {
                "status": "OPEN",
                "isOpen": True,
                "exchange": "XETRA",
                "notice": "XETRA Live-Handel aktiv (09:00–17:30 MEZ)",
                "badgeClass": "badge-market-open"
            }
        else:
            return {
                "status": "CLOSED",
                "isOpen": False,
                "exchange": "XETRA",
                "notice": "XETRA geschlossen — Handel Mo–Fr 09:00–17:30 MEZ",
                "badgeClass": "badge-market-closed",
                "reason": "outside_hours"
            }

    # Standard US Hours (NYSE / NASDAQ): 09:30 - 16:00 EST (UTC-4 in summer EDT, UTC-5 in EST)
    # In October, EDT is UTC-4.
    if exchange.upper() in ("NASDAQ", "NYSE", "NMS", "NYQ"):
        edt_hour = (now_utc.hour - 4) % 24
        edt_min = now_utc.minute
        time_minutes = edt_hour * 60 + edt_min

        pre_minutes = 4 * 60         # 04:00 EDT
        open_minutes = 9 * 60 + 30   # 09:30 EDT (15:30 MEZ)
        close_minutes = 16 * 60      # 16:00 EDT (22:00 MEZ)
        post_minutes = 20 * 60       # 20:00 EDT

        if open_minutes <= time_minutes < close_minutes:
            return {
                "status": "OPEN",
                "isOpen": True,
                "exchange": exchange,
                "notice": f"{exchange} Live-Handel aktiv (15:30–22:00 MEZ)",
                "badgeClass": "badge-market-open"
            }
        elif pre_minutes <= time_minutes < open_minutes:
            return {
                "status": "PRE",
                "isOpen": False,
                "exchange": exchange,
                "notice": f"{exchange} Pre-Market (Hauptsession öffnet 15:30 MEZ)",
                "badgeClass": "badge-market-pre"
            }
        elif close_minutes <= time_minutes < post_minutes:
            return {
                "status": "POST",
                "isOpen": False,
                "exchange": exchange,
                "notice": f"{exchange} After-Hours geschlossen (Schlusskurs fixiert)",
                "badgeClass": "badge-market-closed"
            }
        else:
            return {
                "status": "CLOSED",
                "isOpen": False,
                "exchange": exchange,
                "notice": f"{exchange} geschlossen (Handel Mo–Fr 15:30–22:00 MEZ)",
                "badgeClass": "badge-market-closed",
                "reason": "outside_hours"
            }

    # Default fallback
    return {
        "status": "OPEN",
        "isOpen": True,
        "exchange": exchange,
        "notice": f"{exchange} Marktdaten aktiv",
        "badgeClass": "badge-market-open"
    }

if __name__ == "__main__":
    print("XETRA Status:", get_market_status("XETRA", "stock"))
    print("NASDAQ Status:", get_market_status("NASDAQ", "stock"))
    print("Crypto Status:", get_market_status("OKX", "crypto"))
