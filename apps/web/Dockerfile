FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --no-frozen-lockfile --filter ./apps/web...

COPY apps/web/ apps/web/

WORKDIR /app/apps/web
RUN pnpm run build

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/web/package.json apps/web/package.json

RUN pnpm install --no-frozen-lockfile --prod --filter ./apps/web...

COPY --from=builder /app/apps/web/dist/ apps/web/dist/

EXPOSE 5001
ENV NODE_ENV=production PORT=5001
WORKDIR /app/apps/web
CMD ["node", "dist/index.cjs"]
