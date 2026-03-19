FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate \
    && pnpm install --frozen-lockfile

COPY packages/types/ packages/types/
COPY apps/api/ apps/api/

RUN pnpm --filter @okiru/types build \
    && pnpm --filter @okiru/api build

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /build/package.json /build/pnpm-lock.yaml /build/pnpm-workspace.yaml ./
COPY --from=builder /build/packages/types/ packages/types/
COPY --from=builder /build/apps/api/dist/ apps/api/dist/
COPY --from=builder /build/apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --prod

EXPOSE 5000
ENV NODE_ENV=production PORT=5000
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
