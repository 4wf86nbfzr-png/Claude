// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lint-Regeln.
 *
 * Der Schwerpunkt liegt nicht auf Formatierung, sondern auf den Fehlern, die
 * in diesem Projekt teuer waeren: verschluckte Promises (ein nicht
 * abgewarteter Audit-Eintrag reisst die Kette), unbeabsichtigte
 * Typunsicherheit an Providergrenzen, und alles, was aus Versehen ein
 * Geheimnis ins Log traegt.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'vendor/**',
      'models/**',
      'infra/asterisk/erzeugt/**',
      // Die Lint-Konfiguration selbst steht nicht im TypeScript-Projekt und
      // laesst sich deshalb nicht typgeprueft linten.
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Ein vergessenes await bei audit.record() bricht die Hash-Kette.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // An Providergrenzen kommt `any` herein. Es soll dort auch bleiben und
      // nicht unbemerkt durch das System wandern.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',

      // Aus: fast alle Treffer sind Implementierungen eines asynchronen
      // Interfaces, die zufaellig ohne await auskommen (etwa ein
      // Mock-Connector oder ein Healthcheck ohne Netzaufruf). Die Signatur
      // ist durch das Interface vorgegeben und richtig - die Regel wuerde
      // dazu verleiten, sie zu verbiegen.
      '@typescript-eslint/require-await': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',

      // console gehoert in Skripte, nicht in die Anwendung - dort ist der
      // Logger zustaendig, weil er redigiert.
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-param-reassign': 'error',
    },
  },
  {
    // In Tests darf mehr, damit sich auch unsinnige Eingaben pruefen lassen.
    files: ['**/*.test.ts', 'packages/testkit/**', 'tests/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['scripts/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
