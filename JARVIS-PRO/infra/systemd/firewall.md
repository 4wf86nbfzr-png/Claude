# Firewall auf dem Linux-Host

Grundhaltung: alles zu, ausser dem, was nachweislich gebraucht wird.
Jarvis selbst braucht **keinen** offenen Port von aussen.

## Was von aussen erreichbar sein muss

| Dienst | Port | Von wo | Warum |
|---|---|---|---|
| SIP | 5060/udp | **nur** vom GSM-Gateway im eigenen Netz | Anrufe |
| RTP | 10000–10100/udp | **nur** vom GSM-Gateway | Gesprächsaudio |
| SSH | 22/tcp | nur aus dem eigenen Netz | Wartung |

## Was ausdrücklich NICHT von außen erreichbar sein darf

| Dienst | Port | Grund |
|---|---|---|
| Asterisk ARI / HTTP | 8088 | Vollzugriff auf die Telefonanlage |
| AudioSocket | 41000 | roher Gesprächston |
| WhatsApp-Webhook | 8787 | nimmt nur Verbindungen vom Reverse Proxy an |

Alle drei lauschen bereits per Konfiguration auf `127.0.0.1`. Die Firewall ist
die zweite Sicherung — falls jemand eine Konfiguration ändert.

## ufw

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

# GATEWAY_IP durch die Adresse des GSM-Gateways ersetzen.
sudo ufw allow from GATEWAY_IP to any port 5060 proto udp comment 'SIP vom Gateway'
sudo ufw allow from GATEWAY_IP to any port 10000:10100 proto udp comment 'RTP vom Gateway'

# SSH nur aus dem eigenen Netz.
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp comment 'SSH lokal'

sudo ufw enable
sudo ufw status verbose
```

## Prüfen, dass wirklich nichts offen ist

```bash
# Von einem ANDEREN Rechner aus:
nmap -sT -p 8088,8787,41000 <host-ip>
# Erwartet: closed oder filtered. Steht dort "open", ist etwas falsch.

# Auf dem Host selbst:
ss -tlnp | grep -E '8088|8787|41000'
# Erwartet: ausschliesslich 127.0.0.1 als Adresse.
```

## WhatsApp-Webhook

Meta braucht eine öffentlich erreichbare HTTPS-Adresse. Der Webhook-Endpunkt
selbst lauscht trotzdem nur lokal — davor gehört ein Reverse Proxy mit gültigem
Zertifikat, der ausschließlich `/webhook/whatsapp` weiterreicht:

```nginx
location /webhook/whatsapp {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header X-Hub-Signature-256 $http_x_hub_signature_256;
    # Der Rohkoerper muss unveraendert durchkommen - sonst stimmt die
    # Signatur nicht mehr und Jarvis lehnt jeden Webhook ab.
    proxy_request_buffering on;
    client_max_body_size 1m;
}
```

Alles andere auf dieser Domain gehört auf 404. Der Endpunkt prüft die
Signatur selbst, aber eine offene Angriffsfläche bleibt eine offene
Angriffsfläche.
