# okiru-ai-parser — standalone document→calculator intelligence service.
# Multi-stage build: compile TypeScript, then run a slim production image.

FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ── Build stage: install all deps and compile ──
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY src ./src
COPY parser ./parser
COPY graph ./graph
COPY schemas ./schemas
RUN pnpm build

# ── Runtime stage: production deps + compiled output + ontology matrix ──
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3200
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY ontology ./ontology
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3200)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
