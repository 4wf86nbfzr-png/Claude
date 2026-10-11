import pino from "pino";

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info");

/**
 * Strukturierte Protokollierung. Sensible Felder werden maskiert.
 * In Produktion JSON (für Log-Aggregation), in Entwicklung lesbar.
 */
export const logger = pino({
  level,
  base: { service: "disporex" },
  redact: {
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "token",
      "*.token",
      "secret",
      "*.secret",
      "authorization",
      "*.authorization",
      "headers.cookie",
      "headers.authorization",
      "apiKey",
      "*.apiKey",
    ],
    censor: "[maskiert]",
  },
  ...(process.env.NODE_ENV !== "production" && process.env.LOG_PRETTY !== "false"
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,service" } } }
    : {}),
});

export type Logger = typeof logger;
