# syntax=docker/dockerfile:1.7
# Talk Club API — build from the repository root:
#   docker build -f apps/api/Dockerfile -t talkclub-api .
# Targets: runtime (default, lean), migrate (applies Prisma migrations), tools (seed / CLI).

FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ─── Dependencies (all, incl. dev — needed to build) ───
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/api --include-workspace-root=false --no-audit --no-fund

# ─── Build ───
FROM deps AS build
COPY apps/api apps/api
RUN npm exec --workspace apps/api -- prisma generate \
  && npm run build --workspace apps/api \
  && mkdir -p apps/api/node_modules

# ─── Tools: migrations, seed, Prisma CLI (has dev dependencies) ───
FROM build AS tools
WORKDIR /app/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

FROM tools AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# ─── Production dependencies only ───
FROM build AS prod-deps
RUN npm prune --omit=dev --workspace apps/api --include-workspace-root=false --no-audit --no-fund \
  && npm exec --workspace apps/api -- node -e "require('@prisma/client')"

# ─── Runtime ───
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    STORAGE_LOCAL_DIR=/app/apps/api/uploads
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
RUN mkdir -p uploads && chown -R node:node uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
