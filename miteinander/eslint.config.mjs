import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Linting für das gesamte Monorepo.
 *
 * Die Regeln unten sind keine Stilfragen: sie fangen Muster ab, die in
 * diesem Produkt konkret schaden können.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/webexport/**',
      // Von Next.js erzeugt, wird nicht von Hand gepflegt.
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Ein ungenutzter Parameter ist erlaubt, wenn er mit _ beginnt.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` hebelt genau die Typsicherheit aus, die hier Regeln absichert.
      '@typescript-eslint/no-explicit-any': 'error',
      // Ein verschlucktes Promise heißt hier: eine Buchung wird still nicht gespeichert.
      '@typescript-eslint/no-floating-promises': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    // In Tests und Werkzeugskripten ist console erwünscht. Diese Dateien
    // laufen in Node, nicht im Gerät oder im Browser.
    files: ['**/test/**', '**/e2e/**', '**/*.config.{js,mjs,ts}', '**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'writable',
        require: 'readonly',
        setTimeout: 'readonly',
        // page.evaluate() laeuft im Browser, nicht in Node.
        document: 'readonly',
        getComputedStyle: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
