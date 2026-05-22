#!/usr/bin/env python3
"""
=============================================================================
CLAUDE CODE — Test připojení
=============================================================================
Zero-dependency test (jen standardní Python).
Ověří, jestli z tohoto počítače projde připojení na všechny endpointy,
které Claude Code potřebuje.

Spusť:  python test_connection.py
"""

import socket
import ssl
import sys
import time
import urllib.request
import urllib.error
import json
import os

# ---------------------------------------------------------------------------
# Endpointy, které Claude Code potřebuje
# ---------------------------------------------------------------------------
ENDPOINTS = [
    {
        "name": "Anthropic API",
        "host": "api.anthropic.com",
        "port": 443,
        "url": "https://api.anthropic.com",
        "required": True,
        "description": "Hlavní API — bez tohoto Claude Code nefunguje",
    },
    {
        "name": "Claude.ai (OAuth login)",
        "host": "claude.ai",
        "port": 443,
        "url": "https://claude.ai",
        "required": True,
        "description": "Přihlášení přes Max účet",
    },
    {
        "name": "Anthropic Console",
        "host": "console.anthropic.com",
        "port": 443,
        "url": "https://console.anthropic.com",
        "required": False,
        "description": "Volitelné — správa účtu",
    },
    {
        "name": "Claude Code CDN (instalace/update)",
        "host": "storage.googleapis.com",
        "port": 443,
        "url": "https://storage.googleapis.com",
        "required": True,
        "description": "Stahování a auto-update Claude Code",
    },
    {
        "name": "Git for Windows (portable)",
        "host": "github.com",
        "port": 443,
        "url": "https://github.com",
        "required": False,
        "description": "Stažení Git portable (pokud chybí)",
    },
    {
        "name": "PyPI (pip install)",
        "host": "pypi.org",
        "port": 443,
        "url": "https://pypi.org",
        "required": False,
        "description": "Instalace Python balíčků (pandas, matplotlib...)",
    },
]


def print_header():
    print()
    print("=" * 64)
    print("  CLAUDE CODE — TEST PŘIPOJENÍ")
    print("=" * 64)
    print(f"  Počítač:  {socket.gethostname()}")
    print(f"  Python:   {sys.version.split()[0]}")
    print(f"  Platforma: {sys.platform}")
    print()

    # Detekce proxy
    proxy_vars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY']
    found_proxy = False
    for var in proxy_vars:
        val = os.environ.get(var)
        if val:
            print(f"  {var} = {val}")
            found_proxy = True
    if not found_proxy:
        print("  Proxy:    žádná detekována")

    # Detekce API klíče (varování)
    if os.environ.get("ANTHROPIC_API_KEY"):
        print()
        print("  ⚠️  VAROVÁNÍ: Máš nastavenou ANTHROPIC_API_KEY!")
        print("     Claude Code bude účtovat přes API místo Max plánu.")
        print("     Pro Max plan odstraň tuto proměnnou:")
        print("       Windows:  set ANTHROPIC_API_KEY=")
        print("       PowerShell: Remove-Item Env:ANTHROPIC_API_KEY")

    print()
    print("-" * 64)
    print()


def test_dns(host):
    """Resolve DNS."""
    try:
        ip = socket.getaddrinfo(host, 443, socket.AF_INET)[0][4][0]
        return True, ip
    except socket.gaierror as e:
        return False, str(e)


def test_tcp(host, port, timeout=10):
    """Test TCP connection."""
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.close()
        return True, None
    except (socket.timeout, socket.error) as e:
        return False, str(e)


def test_tls(host, port=443, timeout=10):
    """Test TLS handshake."""
    try:
        context = ssl.create_default_context()
        with socket.create_connection((host, port), timeout=timeout) as sock:
            with context.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
                expiry = cert.get('notAfter', 'neznámé')
                return True, f"TLS {ssock.version()}, certifikát do {expiry}"
    except Exception as e:
        return False, str(e)


def test_https(url, timeout=15):
    """Test HTTPS GET request."""
    try:
        req = urllib.request.Request(url, method="HEAD")
        req.add_header("User-Agent", "Claude-Code-Connection-Test/1.0")
        start = time.time()
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = (time.time() - start) * 1000
            return True, f"HTTP {resp.status}, {elapsed:.0f} ms"
    except urllib.error.HTTPError as e:
        # HTTP error ale připojení funguje
        elapsed = 0
        return True, f"HTTP {e.code} (připojení OK, server odmítl HEAD)"
    except urllib.error.URLError as e:
        return False, str(e.reason)
    except Exception as e:
        return False, str(e)


def test_endpoint(endpoint):
    """Run all tests for one endpoint."""
    host = endpoint["host"]
    port = endpoint["port"]
    url = endpoint["url"]
    required = endpoint["required"]
    tag = "POVINNÝ" if required else "volitelný"

    print(f"  [{tag}] {endpoint['name']}")
    print(f"  {endpoint['description']}")
    print(f"  Host: {host}")
    print()

    results = {}
    all_ok = True

    # 1. DNS
    ok, detail = test_dns(host)
    results["dns"] = ok
    status = f"✅ OK → {detail}" if ok else f"❌ FAIL → {detail}"
    print(f"    DNS resolve:     {status}")
    if not ok:
        all_ok = False

    # 2. TCP
    if results["dns"]:
        ok, detail = test_tcp(host, port)
        results["tcp"] = ok
        status = "✅ OK" if ok else f"❌ FAIL → {detail}"
        print(f"    TCP :{port}:         {status}")
        if not ok:
            all_ok = False
    else:
        results["tcp"] = False
        print(f"    TCP :{port}:         ⏭️  přeskočeno (DNS selhal)")
        all_ok = False

    # 3. TLS
    if results.get("tcp"):
        ok, detail = test_tls(host, port)
        results["tls"] = ok
        status = f"✅ OK → {detail}" if ok else f"❌ FAIL → {detail}"
        print(f"    TLS handshake:   {status}")
        if not ok:
            all_ok = False
    else:
        results["tls"] = False
        print(f"    TLS handshake:   ⏭️  přeskočeno")

    # 4. HTTPS
    if results.get("tls"):
        ok, detail = test_https(url)
        results["https"] = ok
        status = f"✅ OK → {detail}" if ok else f"❌ FAIL → {detail}"
        print(f"    HTTPS request:   {status}")
        if not ok:
            all_ok = False
    else:
        results["https"] = False
        print(f"    HTTPS request:   ⏭️  přeskočeno")

    print()
    return all_ok, results


def test_api_latency():
    """Measure latency to Anthropic API (important for Claude Code responsiveness)."""
    print("  [LATENCY TEST] Anthropic API")
    print()

    latencies = []
    for i in range(3):
        try:
            req = urllib.request.Request("https://api.anthropic.com", method="HEAD")
            req.add_header("User-Agent", "Claude-Code-Connection-Test/1.0")
            start = time.time()
            try:
                urllib.request.urlopen(req, timeout=10)
            except urllib.error.HTTPError:
                pass  # Expected — we just want latency
            elapsed = (time.time() - start) * 1000
            latencies.append(elapsed)
            print(f"    Ping {i+1}/3:  {elapsed:.0f} ms")
        except Exception as e:
            print(f"    Ping {i+1}/3:  FAIL ({e})")
        time.sleep(0.5)

    if latencies:
        avg = sum(latencies) / len(latencies)
        print()
        if avg < 200:
            print(f"    Průměr: {avg:.0f} ms ✅ Výborné — Claude Code bude rychlý")
        elif avg < 500:
            print(f"    Průměr: {avg:.0f} ms ⚠️  OK — použitelné, ale pomalejší odezvy")
        else:
            print(f"    Průměr: {avg:.0f} ms ❌ Pomalé — Claude Code bude mít zpoždění")
    print()


def test_tools():
    """Check for available tools on the system."""
    print("-" * 64)
    print()
    print("  DOSTUPNÉ NÁSTROJE")
    print()

    tools = [
        ("python/python3", "python --version 2>&1 || python3 --version 2>&1"),
        ("pip", "pip --version 2>&1 || pip3 --version 2>&1"),
        ("git", "git --version"),
        ("node", "node --version"),
        ("tshark", "tshark --version 2>&1"),
    ]

    import subprocess
    for name, cmd in tools:
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=5
            )
            version = result.stdout.strip().split('\n')[0][:60] if result.stdout.strip() else "?"
            if result.returncode == 0:
                print(f"    ✅ {name:20s} {version}")
            else:
                print(f"    ❌ {name:20s} nenalezen")
        except Exception:
            print(f"    ❌ {name:20s} nenalezen")

    # Check pip --user capability
    print()
    try:
        import subprocess
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--user", "--dry-run", "requests"],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0:
            print("    ✅ pip install --user     funguje (můžeš instalovat bez admin)")
        else:
            print("    ⚠️  pip install --user     možná nefunguje — zkus ručně")
    except Exception:
        print("    ⚠️  pip install --user     nelze otestovat")

    print()


def print_summary(results):
    """Print final summary and recommendations."""
    print("=" * 64)
    print()
    print("  SHRNUTÍ")
    print()

    all_required_ok = True
    all_optional_ok = True

    for endpoint, (ok, _) in results.items():
        req = next(e for e in ENDPOINTS if e["name"] == endpoint)["required"]
        if req and not ok:
            all_required_ok = False
        if not req and not ok:
            all_optional_ok = False

    if all_required_ok:
        print("  ✅ VŠECHNY POVINNÉ ENDPOINTY JSOU DOSTUPNÉ")
        print()
        print("  Claude Code půjde nainstalovat a používat z tohoto počítače.")
        print()
        print("  Další kroky:")
        print("    1. Otevři PowerShell")
        print('    2. Spusť: irm https://claude.ai/install.ps1 | iex')
        print("    3. Zavři a otevři PowerShell")
        print("    4. Spusť: claude")
        print("    5. Přihlas se Max účtem v prohlížeči")
        if not all_optional_ok:
            print()
            print("  ⚠️  Některé volitelné endpointy nejsou dostupné.")
            print("     Claude Code bude fungovat, ale některé funkce")
            print("     (pip install, git) mohou vyžadovat workaround.")
    else:
        print("  ❌ NĚKTERÉ POVINNÉ ENDPOINTY JSOU BLOKOVANÉ")
        print()
        print("  Claude Code nebude fungovat bez přístupu k těmto serverům.")
        print()
        print("  Možná řešení:")
        print("    1. Zkontroluj VPN nastavení — je možný split tunnel?")
        print("    2. Požádej IT o whitelisting těchto domén:")
        for endpoint, (ok, _) in results.items():
            req = next(e for e in ENDPOINTS if e["name"] == endpoint)["required"]
            if req and not ok:
                host = next(e for e in ENDPOINTS if e["name"] == endpoint)["host"]
                print(f"       - {host}")
        print("    3. Pokud nelze — použij alternativní workflow:")
        print("       - Exportuj data jako CSV")
        print("       - Pošli je přes email/cloud na počítač s Claude")
        print("       - Analyzuj tam")

    print()
    print("=" * 64)


def main():
    print_header()

    results = {}
    for endpoint in ENDPOINTS:
        ok, detail = test_endpoint(endpoint)
        results[endpoint["name"]] = (ok, detail)

    # Latency test (only if API is reachable)
    api_ok = results.get("Anthropic API", (False,))[0]
    if api_ok:
        test_api_latency()

    # Tool check
    test_tools()

    # Summary
    print_summary(results)


if __name__ == "__main__":
    main()
