'use strict';

/* ---------------------------------------------------------------------------
   Die Personalarten — eine Quelle, zwei Verwender
   ---------------------------------------------------------------------------
   Der Kunde waehlt in der Schnell-Anfrage aus diesen Arten aus. Dieselbe
   Liste braucht die Oberflaeche (um die Zeilen zu bauen) und der Server (um
   zu pruefen, dass niemand eine erfundene Art einreicht).

   Sie steht deshalb HIER und nirgendwo sonst. Die Oberflaeche holt sie beim
   Oeffnen des Bereichs vom Server; im Markup steht keine einzige Kategorie.
   Wer eine Art umbenennt oder eine siebte dazunimmt, aendert diese Datei —
   und nichts weiter.

   Die sechs Arten sind die sechs Bereiche der Website, in derselben Nummern-
   folge und mit denselben Namen. Etwas anderes waere eine zweite Wahrheit
   darueber, was der Betrieb anbietet.

   `art_name` wird bei jeder Anfrage MITGESPEICHERT (siehe
   anfrage_positionen). Wird eine Art spaeter umbenannt, steht in einer alten
   Anfrage weiterhin der Name, unter dem sie bestellt wurde — sonst aendert
   sich rueckwirkend, was der Kunde angefragt hat.
--------------------------------------------------------------------------- */

const ARTEN = [
  { schluessel: 'gastro',     nr: '01', name: 'Gastro-Personal',
    hinweis: 'Service, Bar, Küche, Spüle' },
  { schluessel: 'sicherheit', nr: '02', name: 'Sicherheit',
    hinweis: 'Einlass, Ordnungsdienst, Crowdmanagement' },
  { schluessel: 'promotion',  nr: '03', name: 'Promotion & Hostess',
    hinweis: 'Empfang, Standbetreuung, Garderobe' },
  { schluessel: 'logistik',   nr: '04', name: 'Logistik',
    hinweis: 'Auf- und Abbau, Transport, Lager' },
  { schluessel: 'fahrservice',nr: '05', name: 'Fahrservice',
    hinweis: 'Shuttle, Gäste- und Künstlerfahrten' },
  { schluessel: 'reinigung',  nr: '06', name: 'Reinigung',
    hinweis: 'Veranstaltungs- und Bauendreinigung' },
  /* Die Einsatzleitung ist keiner der sechs Bereiche, sondern eine Rolle
     darueber: ein Ansprechpartner vor Ort, der die Positionen einteilt und
     ueber Funk mit jedem Posten verbunden ist. Sie steht auf der
     Sicherheitsseite unter „Ein Ansprechpartner vor Ort" und wird deshalb
     auch hier angeboten — nicht erfunden, sondern uebernommen. */
  { schluessel: 'einsatzleitung', nr: '07', name: 'Einsatzleitung',
    hinweis: 'ein Ansprechpartner vor Ort, führt das Briefing' }
];

const NACH_SCHLUESSEL = new Map(ARTEN.map(a => [a.schluessel, a]));

function kennt(schluessel){
  return NACH_SCHLUESSEL.has(String(schluessel));
}

function name(schluessel){
  const a = NACH_SCHLUESSEL.get(String(schluessel));
  return a ? a.name : '';
}

/** Was die Oberflaeche bekommt. Bewusst dieselbe Form wie oben — es gibt
 *  keinen Grund, fuer den Browser etwas umzubauen. */
function fuerDieSeite(){
  return ARTEN.map(a => ({ schluessel: a.schluessel, nr: a.nr, name: a.name, hinweis: a.hinweis }));
}

module.exports = { ARTEN, kennt, name, fuerDieSeite };
