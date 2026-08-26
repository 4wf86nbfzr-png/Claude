import React from 'react';
import { Image, View } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Text } from './Text';

/**
 * Profilbild.
 *
 * Ohne Bild erscheint ein neutraler Platzhalter mit den Anfangsbuchstaben --
 * keine erfundene Illustration und kein Symbol, das eine Person darstellt.
 * Ein Bild ohne Beschreibung wird nicht angezeigt.
 */
export function Avatar({
  name,
  uri,
  altText,
  size = 72,
}: {
  name: string;
  uri?: string | null;
  altText?: string | null;
  size?: number;
}) {
  const theme = useTheme();
  // Nur Wortanfaenge aus echten Buchstaben. Zusaetze wie "(Demo)" oder
  // Satzzeichen ergaeben sonst Initialen wie "M(".
  const initials =
    (name.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [])
      .slice(0, 2)
      .map((part) => part.charAt(0).toLocaleUpperCase('de-DE'))
      .join('') || '?';

  if (uri && altText) {
    return (
      <Image
        source={{ uri }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={altText}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: theme.colors.border,
        }}
      />
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Kein Foto vorhanden. Platzhalter mit den Buchstaben ${initials}.`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceRaised,
        borderWidth: 2,
        borderColor: theme.colors.border,
      }}
    >
      <Text variant="heading">{initials}</Text>
    </View>
  );
}
