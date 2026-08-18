/**
 * Programmnamen auf Startbefehle abbilden.
 *
 * Der Benutzer sagt „öffne Excel" oder „mach den Browser auf". Was daraus
 * technisch wird, hängt am Betriebssystem: unter macOS `open -a "Microsoft
 * Excel"`, unter Windows `start excel`, unter Linux `libreoffice --calc`.
 *
 * Zwei Dinge sind hier bewusst so gebaut:
 *
 *  - **Mehrere Kandidaten je Programm.** „Browser" kann Chrome, Firefox oder
 *    Safari heißen. Wir probieren der Reihe nach und nehmen den ersten, der
 *    startet, statt zu raten.
 *  - **Kein Rückfall auf die Shell.** Die Kandidaten sind feste Zeichenketten
 *    aus dieser Tabelle bzw. der bereinigte Name des Benutzers; ausgeführt
 *    wird ohne Shell, damit aus einem Programmnamen keine Befehlskette wird.
 */

export type Betriebssystem = 'darwin' | 'win32' | 'linux';

export interface Startbefehl {
  befehl: string;
  args: string[];
  /** Was dem Benutzer gemeldet wird, wenn es klappt. */
  anzeige: string;
}

interface Eintrag {
  /** Wie der Benutzer es nennen könnte -- deutsch und englisch, kleingeschrieben. */
  namen: string[];
  darwin?: string[];
  win32?: string[];
  linux?: string[];
  /** Offizieller Deep-Link, falls es einen gibt (Windows-Systemapps). */
  win32DeepLink?: string;
}

/**
 * Die Tabelle ist absichtlich überschaubar: sie deckt ab, was im Büroalltag
 * vorkommt. Alles andere wird als Programmname durchgereicht -- wer „GIMP"
 * sagt, bekommt GIMP, auch wenn es hier nicht steht.
 */
const TABELLE: Eintrag[] = [
  {
    namen: ['browser', 'webbrowser', 'internet'],
    darwin: ['Google Chrome', 'Safari', 'Firefox', 'Microsoft Edge'],
    win32: ['chrome', 'msedge', 'firefox'],
    linux: ['google-chrome', 'chromium', 'chromium-browser', 'firefox'],
  },
  {
    namen: ['chrome', 'google chrome'],
    darwin: ['Google Chrome'],
    win32: ['chrome'],
    linux: ['google-chrome', 'google-chrome-stable', 'chromium'],
  },
  { namen: ['firefox'], darwin: ['Firefox'], win32: ['firefox'], linux: ['firefox'] },
  { namen: ['safari'], darwin: ['Safari'] },
  { namen: ['edge', 'microsoft edge'], darwin: ['Microsoft Edge'], win32: ['msedge'], linux: ['microsoft-edge'] },

  {
    namen: ['mail', 'e-mail', 'email', 'mailprogramm', 'postfach'],
    darwin: ['Mail'],
    win32: ['outlook'],
    linux: ['thunderbird', 'evolution'],
  },
  { namen: ['outlook'], darwin: ['Microsoft Outlook'], win32: ['outlook'], linux: ['thunderbird'] },
  { namen: ['thunderbird'], darwin: ['Thunderbird'], win32: ['thunderbird'], linux: ['thunderbird'] },

  {
    namen: ['kalender', 'calendar', 'termine'],
    darwin: ['Calendar'],
    win32DeepLink: 'outlookcal:',
    linux: ['gnome-calendar', 'evolution'],
  },
  {
    namen: ['kontakte', 'contacts', 'adressbuch'],
    darwin: ['Contacts'],
    win32DeepLink: 'ms-people:',
    linux: ['gnome-contacts'],
  },

  {
    namen: ['dateien', 'dateimanager', 'explorer', 'finder', 'ordner'],
    darwin: ['Finder'],
    win32: ['explorer'],
    linux: ['nautilus', 'dolphin', 'thunar', 'nemo', 'pcmanfm'],
  },
  {
    namen: ['terminal', 'konsole', 'eingabeaufforderung', 'shell'],
    darwin: ['Terminal'],
    win32: ['wt', 'cmd'],
    linux: ['gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'],
  },

  {
    namen: ['notizen', 'notes', 'notizblock', 'editor', 'texteditor'],
    darwin: ['Notes'],
    win32: ['notepad'],
    linux: ['gedit', 'kate', 'mousepad'],
  },
  {
    namen: ['excel', 'tabelle', 'tabellenkalkulation'],
    darwin: ['Microsoft Excel'],
    win32: ['excel'],
    linux: ['localc', 'libreoffice'],
  },
  {
    namen: ['word', 'textverarbeitung'],
    darwin: ['Microsoft Word'],
    win32: ['winword'],
    linux: ['lowriter', 'libreoffice'],
  },
  {
    namen: ['powerpoint', 'präsentation', 'praesentation'],
    darwin: ['Microsoft PowerPoint'],
    win32: ['powerpnt'],
    linux: ['loimpress', 'libreoffice'],
  },
  {
    namen: ['rechner', 'taschenrechner', 'calculator'],
    darwin: ['Calculator'],
    win32: ['calc'],
    linux: ['gnome-calculator', 'kcalc'],
  },
  {
    namen: ['vorschau', 'preview', 'pdf'],
    darwin: ['Preview'],
    win32DeepLink: 'ms-windows-store:',
    linux: ['evince', 'okular'],
  },

  { namen: ['spotify', 'musik'], darwin: ['Spotify', 'Music'], win32: ['spotify'], linux: ['spotify'] },
  { namen: ['slack'], darwin: ['Slack'], win32: ['slack'], linux: ['slack'] },
  { namen: ['teams', 'microsoft teams'], darwin: ['Microsoft Teams'], win32: ['teams'], linux: ['teams'] },
  { namen: ['zoom'], darwin: ['zoom.us'], win32: ['zoom'], linux: ['zoom'] },
  {
    namen: ['vscode', 'visual studio code', 'code', 'editor code'],
    darwin: ['Visual Studio Code'],
    win32: ['code'],
    linux: ['code', 'codium'],
  },
  {
    namen: ['einstellungen', 'systemeinstellungen', 'settings'],
    darwin: ['System Settings', 'System Preferences'],
    win32DeepLink: 'ms-settings:',
    linux: ['gnome-control-center', 'systemsettings'],
  },
];

/** Zeichen, die in keinem Programmnamen etwas verloren haben. */
const VERBOTEN = /[;&|`$<>\n\r"'\\]/;

export function istUnbedenklicherName(name: string): boolean {
  return name.trim().length > 0 && name.length <= 80 && !VERBOTEN.test(name);
}

/**
 * Liefert die Startbefehle für einen gesprochenen Programmnamen, in der
 * Reihenfolge, in der sie probiert werden sollen.
 *
 * Gibt es keinen Tabelleneintrag, wird der Name selbst zum Kandidaten --
 * unter macOS und Windows kennt der Systemöffner die installierten Programme
 * ohnehin besser als jede Tabelle.
 */
export function startbefehle(name: string, os: Betriebssystem): Startbefehl[] {
  const gesucht = name.trim().toLowerCase();
  const eintrag = TABELLE.find((e) => e.namen.includes(gesucht));

  if (eintrag?.win32DeepLink && os === 'win32') {
    return [{ befehl: 'cmd', args: ['/c', 'start', '', eintrag.win32DeepLink], anzeige: name.trim() }];
  }

  const kandidaten = eintrag?.[os] ?? [];
  const namen = kandidaten.length > 0 ? kandidaten : [name.trim()];

  return namen.map((kandidat) => {
    switch (os) {
      case 'darwin':
        return { befehl: 'open', args: ['-a', kandidat], anzeige: kandidat };
      case 'win32':
        return { befehl: 'cmd', args: ['/c', 'start', '', kandidat], anzeige: kandidat };
      default:
        return { befehl: kandidat, args: [], anzeige: kandidat };
    }
  });
}

/** Alle Namen, die JARVIS ohne Umweg versteht -- für Hilfetexte. */
export function bekannteProgramme(): string[] {
  return TABELLE.map((e) => e.namen[0]!).sort((a, b) => a.localeCompare(b, 'de'));
}
