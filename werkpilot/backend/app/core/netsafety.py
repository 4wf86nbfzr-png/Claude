"""Prüfung ausgehender URLs gegen SSRF: nur https, Port 443, kein IP-Literal, keine privaten/lokalen Ziele."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeUrl(ValueError):
    pass


def _resolve(host: str) -> list[str]:
    """Alle IP-Adressen eines Hostnamens (in Tests ersetzbar, ohne das globale socket-Modul anzufassen)."""
    return [info[4][0] for info in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)]


def _is_forbidden(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified or ip in ipaddress.ip_network("100.64.0.0/10")


def validate_outbound_url(url: str) -> str:
    """Gibt die bereinigte URL zurück oder wirft UnsafeUrl. Löst den Hostnamen auf und prüft alle Adressen."""
    p = urlparse(url.strip())
    if p.scheme != "https" or not p.hostname:
        raise UnsafeUrl("Nur https-URLs mit Hostnamen sind erlaubt.")
    if p.port not in (None, 443):
        raise UnsafeUrl("Nur Port 443 ist erlaubt.")
    if p.username or p.password:
        raise UnsafeUrl("Zugangsdaten in der URL sind nicht erlaubt.")
    host = p.hostname.lower()
    is_ip = True
    try:
        ipaddress.ip_address(host)
    except ValueError:
        is_ip = False
    if is_ip:
        raise UnsafeUrl("IP-Adressen sind nicht erlaubt, bitte einen Hostnamen verwenden.")
    if host in ("localhost",) or host.endswith((".local", ".internal", ".localhost")):
        raise UnsafeUrl("Lokale Hostnamen sind nicht erlaubt.")
    try:
        addresses = _resolve(host)
    except socket.gaierror as e:
        raise UnsafeUrl("Hostname konnte nicht aufgelöst werden.") from e
    for addr in addresses:
        if _is_forbidden(ipaddress.ip_address(addr)):
            raise UnsafeUrl("Ziel liegt in einem privaten oder lokalen Netz.")
    return p.geturl()
