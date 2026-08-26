import React, { useEffect } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { startbildVideo } from '../inhalte/bilder';

/**
 * Die bewegte Fassung des Startbildes.
 *
 * Das Foto fährt langsam heran, dann blendet das Logo auf. Danach bleibt es
 * stehen -- die Animation läuft nicht in einer Schleife. Etwas, das sich ohne
 * Zutun dauernd bewegt, ist für viele Menschen anstrengend und für manche
 * gefährlich.
 *
 * Ton gibt es keinen. Bei „Bewegung reduzieren" wird diese Komponente gar
 * nicht erst eingesetzt; dann steht das Standbild dort, das ohnehin das Ende
 * der Animation zeigt.
 */
export function Startbild() {
  const player = useVideoPlayer(startbildVideo.source, (p) => {
    p.loop = false;
    p.muted = true;
  });

  useEffect(() => {
    player.play();
    // Beim Verlassen anhalten. Sonst laeuft der Abspielwunsch noch, waehrend
    // das Element schon aus der Seite genommen ist -- im Web quittiert der
    // Browser das mit einem AbortError in der Konsole.
    return () => {
      try {
        player.pause();
      } catch {
        // Der Spieler ist bereits abgeraeumt. Nichts zu tun.
      }
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      nativeControls={false}
      allowsPictureInPicture={false}
      // Die Beschreibung sitzt am Rahmen in Screen -- hier wäre sie doppelt.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
