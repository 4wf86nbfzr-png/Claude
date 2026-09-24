import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const konfiguration = [
  {
    ignores: ['.next/**', 'node_modules/**', 'storage/**', 'beispiele/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Die Oberflaeche ist durchgaengig deutsch; Apostrophe und Anfuehrungszeichen
      // im Text sind Absicht und keine Fehler.
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];

export default konfiguration;
