# Asterisk fuer die lokale Entwicklung.
#
# Zweck: eine Telefonanlage zum Ausprobieren, ohne den Entwicklungsrechner
# umzubauen. NICHT fuer den Dauerbetrieb gedacht - dort gehoert Asterisk als
# Paket auf den Linux-Host, damit Updates ueber die Paketverwaltung kommen.
#
# Bauen:   docker build -f infra/docker/asterisk.Dockerfile -t jarvis-asterisk .
# Starten: docker compose -f infra/docker/compose.yml up
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      asterisk \
      asterisk-modules \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Die Konfiguration wird beim Start eingehaengt, nicht ins Abbild gebacken -
# sonst landen Zugangsdaten in einer Ebene des Abbilds.
VOLUME ["/etc/asterisk"]

EXPOSE 5060/udp 8088/tcp 10000-10100/udp

# Im Vordergrund, damit Docker den Prozess ueberwacht.
CMD ["asterisk", "-f", "-vvv"]
