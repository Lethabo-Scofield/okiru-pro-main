FROM node:20-alpine AS builder
WORKDIR /build

RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev libjpeg-turbo-dev giflib-dev

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

ENV NO_COLOR=1 PNPM_NO_PROGRESS=1
RUN npm install -g pnpm@10.26.1 \
    && pnpm install --no-frozen-lockfile --reporter=append-only \
    && npm rebuild esbuild

COPY packages/types/ packages/types/
COPY apps/api/ apps/api/

RUN pnpm --filter @okiru/types build \
    && cd apps/api && node build.js

ENV CI=true
RUN pnpm install --no-frozen-lockfile --prod

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev libjpeg-turbo-dev giflib-dev \
    && npm install -g pnpm@10.26.1

COPY --from=builder /build/package.json /build/pnpm-lock.yaml /build/pnpm-workspace.yaml ./
COPY --from=builder /build/packages/types/ packages/types/
COPY --from=builder /build/apps/api/dist/ apps/api/dist/
COPY --from=builder /build/apps/api/package.json apps/api/

RUN pnpm install --no-frozen-lockfile --prod \
    && apk del python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev libjpeg-turbo-dev giflib-dev \
    && apk add --no-cache pixman cairo pango libjpeg-turbo giflib

EXPOSE 5000
ENV NODE_ENV=production PORT=5000
WORKDIR /app/apps/api
CMD ["node", "dist/index.cjs"]
