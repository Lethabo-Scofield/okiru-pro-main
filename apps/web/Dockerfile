FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate \
    && pnpm install --frozen-lockfile

COPY packages/types/ packages/types/
COPY apps/web/ apps/web/

RUN pnpm --filter @okiru/types build \
    && pnpm --filter @okiru/web build

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /build/package.json /build/pnpm-lock.yaml /build/pnpm-workspace.yaml ./
COPY --from=builder /build/packages/types/ packages/types/
COPY --from=builder /build/apps/web/dist/ apps/web/dist/
COPY --from=builder /build/apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --prod

EXPOSE 5001
ENV NODE_ENV=production PORT=5001
WORKDIR /app/apps/web
CMD ["node", "dist/index.cjs"]
