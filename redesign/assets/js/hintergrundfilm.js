/* ============================================================
   Der Hintergrundfilm
   ------------------------------------------------------------
   Haengt die richtige Quelle in den <video> der festen Lage und startet
   ihn. Laeuft NACH main.js und motion.js und fasst von beiden nichts an:
   diese Datei und `hintergrundfilm.css` sind der ganze Zusatz.

   Warum die Quellen nicht im Markup stehen
   ------------------------------------------------------------
   `<source media="(max-width:900px)">` steht zwar in der Norm, wird in
   einem <video> aber weder von Chromium noch von Safari ausgewertet —
   nur das <picture> kennt es. Der Browser nimmt schlicht die erste
   Quelle, die er abspielen kann, und das Telefon bekaeme den Querschnitt:
   in einem 390 x 844 grossen Fenster ist das bei dreifacher Dichte eine
   3,5-fache Hochrechnung. Deshalb steht der <video> ohne jede Quelle da,
   die vier Adressen haengen als `data-`Attribute daran, und hier wird die
   passende eingehaengt.

   Das hat einen zweiten Ertrag: bei reduzierter Bewegung und im
   Datensparmodus wird gar keine eingehaengt. Es laedt also kein Geraet
   eine Datei, die es gleich wieder verwirft.
   ============================================================ */
(function () {
  const film = document.querySelector('.filmgrund video');
  if (!film) return;

  const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const knausrig = navigator.connection && (navigator.connection.saveData ||
                   /2g/.test(navigator.connection.effectiveType || ''));

  if (ruhig || knausrig) {
    /* Die ganze Lage geht, nicht nur der Film: sie traegt denselben
       Schwarzton wie die Seite und stuende sonst als zweite, gleichfarbige
       Flaeche dahinter. Stehen bleibt genau das, was ohne den Film dort
       stuende. */
    const lage = film.closest('.filmgrund');
    (lage || film).remove();
    return;
  }

  /* Der Zuschnitt: hochkant unter 901 px, sonst quer. Gemessen einmal,
     beim Laden — den Schnitt mitten im Betrieb zu tauschen hiesse, den
     Film neu zu laden, und das sieht man. */
  const hoch = window.matchMedia('(max-width:900px)').matches;
  const mp4  = film.getAttribute(hoch ? 'data-hoch-mp4'  : 'data-quer-mp4');
  const webm = film.getAttribute(hoch ? 'data-hoch-webm' : 'data-quer-webm');

  /* H.264 zuerst: wo beides geht, ist es das Format mit der
     Hardware-Dekodierung, und ein Hintergrundfilm laeuft dauernd — auf
     einem Akku ist das der Unterschied zwischen warm und heiss. VP9 steht
     daneben fuer die Chromium-Baureihen ohne H.264 (jede
     Linux-Distribution, die die patentbehafteten Codecs auslaesst); ohne
     diese Zeile saehen die nur eine schwarze Flaeche. */
  for (const [adresse, typ] of [[mp4, 'video/mp4'], [webm, 'video/webm']]) {
    if (!adresse) continue;
    const q = document.createElement('source');
    q.src = adresse;
    q.type = typ;
    film.appendChild(q);
  }
  film.load();

  /* `.laeuft` blendet den Film auf. Davor steht der Seitengrund, und das
     ist keine Gestaltung, sondern eine Versicherung: laedt der Film
     langsam oder gar nicht, sieht die Seite aus wie vorher, statt eine
     halbe Sekunde lang in ein leeres Rechteck zu schauen. */
  const sichtbar = () => film.classList.add('laeuft');
  if (film.readyState >= 2) sichtbar();
  film.addEventListener('loadeddata', sichtbar, { once: true });
  film.addEventListener('playing', sichtbar);

  const los = () => { const v = film.play(); if (v && v.catch) v.catch(() => {}); };
  los();

  /* Manche Browser brechen ein Autoplay ab, wenn der Reiter im Hintergrund
     geoeffnet wurde. Beim Zurueckkommen noch einmal anstossen. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && film.paused) los();
  });
})();
