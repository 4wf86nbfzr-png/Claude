/**
 * HST Planer – Anfrage-Widget für hermserviceteam.com (Spec 43)
 *
 * Einbindung auf der Website:
 *
 *   <div data-hst-anfrage data-hst-url="https://planer.hermserviceteam.com"></div>
 *   <script src="https://planer.hermserviceteam.com/anfrage-widget.js" defer></script>
 *
 * Das Widget bringt bewusst KEIN eigenes Design mit: Es erzeugt schlichtes,
 * semantisches HTML mit den Klassen der Zielseite (Vorgabe: die Klassen der
 * HST-Website – `feld`, `knopf`). So fügt es sich ein, statt sich
 * durchzusetzen. Mit `data-hst-klassen` lässt sich das anpassen.
 *
 * Datenschutz: Es werden keine Cookies gesetzt, nichts nachgeladen und nichts
 * protokolliert. Abgeschickt wird ausschließlich das, was im Formular steht.
 */
(function () {
  'use strict';

  var BEREICHE = [
    ['SICHERHEIT', 'Sicherheit & Ordnungsdienst'],
    ['GASTRO', 'Gastro- & Servicepersonal'],
    ['PROMOTION', 'Promotion & Hostessen'],
    ['LOGISTIK', 'Logistik & Auf-/Abbau'],
    ['FAHRSERVICE', 'Fahrservice'],
    ['REINIGUNG', 'Reinigung'],
  ];

  var FELDER = [
    { name: 'company', label: 'Firma', typ: 'text' },
    { name: 'contactPerson', label: 'Ansprechpartner', typ: 'text' },
    { name: 'email', label: 'E-Mail', typ: 'email', pflicht: true },
    { name: 'phone', label: 'Telefon', typ: 'tel' },
    { name: 'eventName', label: 'Anlass', typ: 'text' },
    { name: 'eventDate', label: 'Datum', typ: 'date' },
    { name: 'startTime', label: 'Beginn', typ: 'time' },
    { name: 'endTime', label: 'Ende', typ: 'time' },
    { name: 'location', label: 'Veranstaltungsort', typ: 'text' },
    { name: 'employeesNeeded', label: 'Benötigte Mitarbeiter', typ: 'number' },
  ];

  function element(tag, attribute, text) {
    var knoten = document.createElement(tag);
    for (var schluessel in attribute) {
      if (Object.prototype.hasOwnProperty.call(attribute, schluessel)) {
        knoten.setAttribute(schluessel, attribute[schluessel]);
      }
    }
    if (text) knoten.textContent = text;
    return knoten;
  }

  function aufbauen(behaelter) {
    var basis = (behaelter.getAttribute('data-hst-url') || '').replace(/\/$/, '');
    var klassen = (behaelter.getAttribute('data-hst-klassen') || 'feld|knopf').split('|');
    var feldKlasse = klassen[0] || 'feld';
    var knopfKlasse = klassen[1] || 'knopf';

    var formular = element('form', { novalidate: 'novalidate' });
    var meldung = element('p', { role: 'status', 'aria-live': 'polite' });
    meldung.style.display = 'none';

    FELDER.forEach(function (feld) {
      var id = 'hst-' + feld.name;
      var gruppe = element('p');
      var beschriftung = element('label', { for: id }, feld.label + (feld.pflicht ? ' *' : ''));
      var eingabe = element('input', { id: id, name: feld.name, type: feld.typ, class: feldKlasse });
      if (feld.pflicht) eingabe.required = true;
      if (feld.typ === 'number') { eingabe.min = '1'; eingabe.max = '999'; }
      gruppe.appendChild(beschriftung);
      gruppe.appendChild(eingabe);
      formular.appendChild(gruppe);
    });

    var bereichGruppe = element('p');
    bereichGruppe.appendChild(element('label', { for: 'hst-serviceType' }, 'Leistungsbereich'));
    var auswahl = element('select', { id: 'hst-serviceType', name: 'serviceType', class: feldKlasse });
    auswahl.appendChild(element('option', { value: '' }, 'bitte wählen'));
    BEREICHE.forEach(function (bereich) {
      auswahl.appendChild(element('option', { value: bereich[0] }, bereich[1]));
    });
    bereichGruppe.appendChild(auswahl);
    formular.appendChild(bereichGruppe);

    var textGruppe = element('p');
    textGruppe.appendChild(element('label', { for: 'hst-message' }, 'Ihre Nachricht'));
    var textfeld = element('textarea', { id: 'hst-message', name: 'message', rows: '5', class: feldKlasse });
    textGruppe.appendChild(textfeld);
    formular.appendChild(textGruppe);

    // Honigtopf: für Menschen unsichtbar, für Maschinen verlockend.
    var falle = element('div', { 'aria-hidden': 'true' });
    falle.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';
    var fallenFeld = element('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
    falle.appendChild(element('label', { for: 'hst-website' }, 'Bitte frei lassen'));
    falle.appendChild(fallenFeld);
    formular.appendChild(falle);

    var knopf = element('button', { type: 'submit', class: knopfKlasse }, 'Anfrage senden');
    formular.appendChild(knopf);
    formular.appendChild(meldung);

    formular.addEventListener('submit', function (ereignis) {
      ereignis.preventDefault();
      meldung.style.display = 'none';

      var daten = {};
      new FormData(formular).forEach(function (wert, schluessel) {
        if (typeof wert === 'string' && wert.trim() !== '') daten[schluessel] = wert.trim();
      });
      if (!daten.email) {
        zeigen(meldung, 'Bitte geben Sie eine E-Mail-Adresse an, damit wir antworten können.', true);
        return;
      }

      knopf.disabled = true;
      knopf.textContent = 'Wird gesendet …';

      fetch(basis + '/api/public/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(daten),
      })
        .then(function (antwort) {
          return antwort.json().then(function (rumpf) { return { ok: antwort.ok, rumpf: rumpf }; });
        })
        .then(function (ergebnis) {
          if (!ergebnis.ok) {
            zeigen(meldung, ergebnis.rumpf.error || 'Die Anfrage konnte nicht übermittelt werden.', true);
            return;
          }
          formular.reset();
          var text = 'Vielen Dank, Ihre Anfrage ist eingegangen';
          if (ergebnis.rumpf.anfrageNummer) text += ' (' + ergebnis.rumpf.anfrageNummer + ')';
          text += '. Unsere Disposition meldet sich zeitnah bei Ihnen.';
          zeigen(meldung, text, false);
        })
        .catch(function () {
          zeigen(meldung, 'Die Verbindung ist fehlgeschlagen. Bitte rufen Sie uns an oder versuchen Sie es später erneut.', true);
        })
        .finally(function () {
          knopf.disabled = false;
          knopf.textContent = 'Anfrage senden';
        });
    });

    behaelter.appendChild(formular);
  }

  function zeigen(knoten, text, fehler) {
    knoten.textContent = text;
    knoten.style.display = 'block';
    knoten.style.color = fehler ? '#B91C1C' : '#15803D';
  }

  function start() {
    var behaelter = document.querySelectorAll('[data-hst-anfrage]');
    for (var i = 0; i < behaelter.length; i++) {
      if (!behaelter[i].getAttribute('data-hst-bereit')) {
        behaelter[i].setAttribute('data-hst-bereit', 'ja');
        aufbauen(behaelter[i]);
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
