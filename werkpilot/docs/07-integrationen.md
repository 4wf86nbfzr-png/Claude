# Integrationen einrichten

## Website-Kontaktformular → WerkPilot

Im Dashboard unter Integrationen → Kontaktformular aktivieren. Sie erhalten eine URL und ein
Secret (nur einmal sichtbar). Das Formular Ihrer Website sendet per POST dorthin.

Felder (JSON oder klassisches Formular): `name`, `email`, `telefon`/`phone`, `betreff`/`subject`,
`nachricht`/`message`, Honeypot `website` (leer lassen).

```html
<form id="anfrage">
  <input name="name" placeholder="Name">
  <input name="email" type="email" placeholder="E-Mail">
  <input name="telefon" placeholder="Telefon">
  <textarea name="nachricht" required></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <button>Senden</button>
</form>
<script>
document.getElementById("anfrage").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("https://werkpilot.de/api/public/forms/<TENANT_ID>", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Form-Secret": "<SECRET>" },
    body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
  });
  alert(r.ok ? "Danke, wir melden uns." : "Senden fehlgeschlagen.");
});
</script>
```

Hinweis: Das Secret ist im Browser sichtbar; es verhindert Spam-Fluten, ist aber kein
Geheimnis im strengen Sinn. Bei Missbrauch im Dashboard neu erzeugen. Rate-Limit: 20/min je IP.
Bei einem serverseitigen Formular (PHP, Netlify Functions) das Secret dort hinterlegen.

## E-Mail-Eingang → WerkPilot

Der Betrieb richtet in seinem Mailprogramm eine Weiterleitung an `anfragen+<slug>@<inbound-domain>`
ein (Slug = Betriebs-Kurzname aus dem Dashboard). Der Betreiber verbindet die Inbound-Domain mit
einem Mail-Anbieter, der eingehende Mails per Webhook liefert, und übersetzt dessen Format in das
WerkPilot-Format:

```
POST {BASE_URL}/api/public/inbound-email
X-Inbound-Signature: HMAC-SHA256(secret=INBOUND_EMAIL_WEBHOOK_SECRET, body)
{"to": "anfragen+muster-shk@mail.werkpilot.de", "from": "kunde@example.org",
 "from_name": "Kunde", "subject": "Heizung", "text": "…", "message_id": "<id>"}
```

Adapter-Beispiele (als kleine Funktion beim Anbieter oder als Cloudflare Worker):

- **Resend Inbound**: Webhook `email.received` → Felder `to[0]`, `from`, `subject`, `text`, `message_id`.
- **Postmark Inbound**: JSON mit `ToFull[0].Email`, `FromFull.Email`, `FromFull.Name`, `Subject`, `TextBody`, `MessageID`.
- **Mailgun Routes**: `store()`-Route, Felder `recipient`, `sender`, `subject`, `body-plain`, `Message-Id`.

Der Adapter signiert den normalisierten JSON-Body mit dem gemeinsamen Secret. Dubletten werden
über `message_id` erkannt. MX-Einträge der Inbound-Domain auf den Anbieter zeigen lassen.

## Google Kalender

1. Google Cloud Console → Projekt → „OAuth-Zustimmungsbildschirm“ (extern), Scopes
   `https://www.googleapis.com/auth/calendar.events` und `calendar.readonly`.
2. Anmeldedaten → OAuth-Client „Webanwendung“, Redirect-URI `{BASE_URL}/api/integrations/google-calendar/callback`.
3. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env`. Solange die App nicht verifiziert ist,
   Testnutzer eintragen (max. 100) – vor Produktivstart Verifizierung beantragen.
4. Der Kunde klickt im Dashboard „Mit Google verbinden“. Tokens liegen verschlüsselt in `integrations`.
   Trennen löscht sie.

## Stripe

1. Produkte Starter/Business/Pro mit monatlichem Preis anlegen (Testmodus zuerst).
2. `price_...`-IDs unter `/admin/tarife` eintragen.
3. Webhook-Endpoint `{BASE_URL}/api/billing/webhook` mit Ereignissen
   `checkout.session.completed`, `customer.subscription.created/updated/deleted`,
   `invoice.paid`, `invoice.payment_failed`. Signing-Secret → `STRIPE_WEBHOOK_SECRET`.
4. Kundenportal aktivieren (Einstellungen → Billing → Customer portal): Tarifwechsel, Zahlungsmittel, Kündigung.
5. Lokal testen: `stripe listen --forward-to localhost:8000/api/billing/webhook`.
6. Live-Schaltung: Live-Schlüssel, Live-Webhook, Live-Preis-IDs; Testkunden im Testmodus bleiben.

## CRM-Webhook (ausgehend, Tarif Pro)

Im Dashboard URL (https) hinterlegen. WerkPilot sendet `inquiry.created` und
`inquiry.status_changed` als JSON mit Header `X-WerkPilot-Signature`
(HMAC-SHA256 des Bodys mit dem angezeigten Signing-Secret) und `X-WerkPilot-Event`.
Antwortet das Zielsystem nicht mit 2xx, wird bis zu fünfmal mit Backoff wiederholt.
