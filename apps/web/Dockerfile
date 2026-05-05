FROM node:20-alpine AS builder

WORKDIR /app

ENV NO_COLOR=1 PNPM_NO_PROGRESS=1 NPM_CONFIG_FUND=false NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev libjpeg-turbo-dev giflib-dev

RUN npm install -g pnpm@10.26.1 --no-fund --no-update-notifier --quiet

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/data-layer/package.json packages/data-layer/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN mkdir -p apps/Computation-Engine && echo '{"name":"computation-engine","version":"1.0.0","private":true}' > apps/Computation-Engine/package.json

RUN pnpm install --no-frozen-lockfile --reporter=append-only \
    && npm rebuild esbuild

COPY packages/types/ packages/types/
COPY apps/api/src/ apps/api/src/
COPY apps/api/pipeline/ apps/api/pipeline/
COPY apps/api/arango/ apps/api/arango/
COPY apps/api/models.ts apps/api/models.ts
COPY apps/api/schema.ts apps/api/schema.ts
COPY apps/api/db.ts apps/api/db.ts
COPY apps/web/ apps/web/

WORKDIR /app/packages/types
RUN pnpm run build

WORKDIR /app/apps/web
ENV VITE_API_URL=
RUN pnpm run build

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev libjpeg-turbo-dev giflib-dev

RUN npm install -g pnpm@10.26.1

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/types/package.json packages/types/
COPY --from=builder /app/packages/data-layer/package.json packages/data-layer/
COPY --from=builder /app/apps/web/package.json apps/web/
COPY --from=builder /app/apps/api/package.json apps/api/
RUN mkdir -p apps/Computation-Engine && echo '{"name":"computation-engine","version":"1.0.0","private":true}' > apps/Computation-Engine/package.json

ENV NO_COLOR=1 NPM_CONFIG_FUND=false NPM_CONFIG_UPDATE_NOTIFIER=false
RUN pnpm install --no-frozen-lockfile --prod

RUN apk del python3 make g++ pkgconfig

COPY --from=builder /app/apps/web/dist/ apps/web/dist/

EXPOSE 5001
ENV NODE_ENV=production PORT=5001
WORKDIR /app/apps/web
CMD ["node", "dist/index.cjs"]
