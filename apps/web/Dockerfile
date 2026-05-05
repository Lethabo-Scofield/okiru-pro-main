FROM node:20-alpine AS builder

WORKDIR /app

ENV NO_COLOR=1 PNPM_NO_PROGRESS=1

RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev libjpeg-turbo-dev giflib-dev

RUN npm install -g pnpm@10.26.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/

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
COPY --from=builder /app/apps/web/package.json apps/web/
COPY --from=builder /app/apps/api/package.json apps/api/

RUN pnpm install --no-frozen-lockfile --prod

RUN apk del python3 make g++ pkgconfig

COPY --from=builder /app/apps/web/dist/ apps/web/dist/

EXPOSE 5001
ENV NODE_ENV=production PORT=5001
WORKDIR /app/apps/web
CMD ["node", "dist/index.cjs"]
