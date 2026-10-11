# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------------------------
# DispoRex – ein Image für Web, Worker und Migrationen.
#   docker build -t disporex .
#   docker run --env-file .env -p 3000:3000 disporex                 # Web
#   docker run --env-file .env disporex pnpm worker                  # Worker
#   docker run --env-file .env disporex pnpm db:migrate              # Migrationen (Eigentümerrolle)
# Das Image enthält bewusst die Entwicklungsabhängigkeiten (tsx, drizzle-kit),
# damit Migrationen und der Worker aus demselben Artefakt laufen. Kein Build-Step
# berührt die Datenbank; Migrationen laufen nur über `pnpm db:migrate`.
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Der Build liest keine .env (ist per .dockerignore ausgeschlossen) und braucht keine Datenbank.
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
ENV APP_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV STORAGE_LOCAL_PATH=/data/storage
RUN groupadd --system app && useradd --system --gid app --home-dir /app app \
  && mkdir -p /data/storage && chown -R app:app /data
COPY --from=build --chown=app:app /app /app
USER app
EXPOSE 3000
VOLUME ["/data/storage"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
