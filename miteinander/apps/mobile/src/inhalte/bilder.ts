/**
 * Bilder der App.
 *
 * Jedes Bild braucht eine Beschreibung. Sie steht hier neben der Datei und
 * nicht verstreut in den Bildschirmen -- so faellt auf, wenn eine fehlt.
 *
 * Vor dem Produktivstart: fuer jedes Foto muss die Einwilligung der
 * abgebildeten Personen und die Nutzungslizenz dokumentiert sein
 * (siehe LAUNCH_CHECKLIST.md).
 */
export const startbildVideo = {
  source: require('../../assets/bilder/startbild.webm') as number,
};

export const heroStartseite = {
  // Das Standbild zeigt das Ende der Animation, mit Logo.
  source: require('../../assets/bilder/startbild.jpg') as number,
  altText:
    'Sieben Menschen tanzen bei Sonnenuntergang auf einer Wiese. Im Hintergrund spielt eine Band auf einer kleinen Bühne mit Lichterkette. Vorn hält eine Frau im Rollstuhl lachend die Hand einer Frau im roten Kleid. Daneben tanzen weitere Menschen, eine Person stützt sich auf einen Rollator.',
  seitenverhaeltnis: 900 / 600,
};
