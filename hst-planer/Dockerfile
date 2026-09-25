# ---------------------------------------------------------------- Abhaengigkeiten
FROM node:22-alpine AS deps
WORKDIR /app
# OpenSSL wird von Prisma benoetigt.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------- Bauen
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Der Build braucht eine DATABASE_URL nur als Platzhalter – es wird nicht verbunden.
ENV DATABASE_URL="postgresql://platzhalter:platzhalter@localhost:5432/platzhalter"
ENV AUTH_SECRET="build-platzhalter-mindestens-zweiunddreissig-zeichen"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------- Betrieb
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV STORAGE_PATH=/app/storage

# Nicht als root laufen lassen.
RUN addgroup -g 1001 -S hst && adduser -u 1001 -S hst -G hst

# Die Standalone-Ausgabe enthaelt bereits alle benoetigten Pakete samt
# erzeugtem Prisma-Client – deshalb bleibt das Abbild klein.
COPY --from=builder --chown=hst:hst /app/.next/standalone ./
COPY --from=builder --chown=hst:hst /app/.next/static ./.next/static
COPY --from=builder --chown=hst:hst /app/public ./public
# Schema und Migrationen liegen bei, damit im Zweifel nachvollziehbar ist,
# welcher Stand im Abbild steckt. Ausgefuehrt werden sie vom Dienst
# "werkzeuge" aus docker-compose.yml, der die Entwicklungswerkzeuge mitbringt.
COPY --from=builder --chown=hst:hst /app/prisma ./prisma

RUN mkdir -p /app/storage && chown -R hst:hst /app/storage
VOLUME ["/app/storage"]

USER hst
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/anmelden >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
