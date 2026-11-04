# syntax=docker/dockerfile:1.7

# ─────────────────────────────────────────────────────────────
# TurnoPro — imagen multi-etapa del monorrepositorio
#
# Objetivos disponibles:
#   api      → API NestJS (puerto 3001)
#   worker   → worker BullMQ + health server (puerto 3002)
#   web      → aplicación Next.js (puerto 3000)
#
# El objetivo `deps` instala una sola vez y `builder` compila todo el
# workspace. Las imágenes de ejecución conservan el workspace completo para
# que los enlaces de pnpm y el cliente generado de Prisma sigan resolviendo.
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@12.16.1 --activate

WORKDIR /app

# ─────────────────────────────────────────────────────────────
# Dependencias (capa cacheable)
# ─────────────────────────────────────────────────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/ai-core/package.json packages/ai-core/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Compilación de todo el workspace
# ─────────────────────────────────────────────────────────────
FROM deps AS builder

# Next.js inserta esta variable en el bundle del navegador en tiempo de build.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY . .

RUN pnpm --filter @turnopro/database generate
RUN NODE_OPTIONS=--max-old-space-size=1536 pnpm build

# ─────────────────────────────────────────────────────────────
# Base de ejecución
# ─────────────────────────────────────────────────────────────
FROM base AS runtime

ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app /app

USER node

# ─────────────────────────────────────────────────────────────
# API
# ─────────────────────────────────────────────────────────────
FROM runtime AS api

EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

# ─────────────────────────────────────────────────────────────
# Worker
# ─────────────────────────────────────────────────────────────
FROM runtime AS worker

EXPOSE 3002
CMD ["node", "apps/worker/dist/main.js"]

# ─────────────────────────────────────────────────────────────
# Web
# ─────────────────────────────────────────────────────────────
FROM runtime AS web

EXPOSE 3000
CMD ["pnpm", "--filter", "@turnopro/web", "start"]
