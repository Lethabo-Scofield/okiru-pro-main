FROM node:20-alpine AS builder
WORKDIR /app

# Copy package.json and package-lock.json for the specific app
# This allows npm ci to leverage Docker's layer caching
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

# Copy the rest of the application code for the 'web' app
# Assuming .dockerignore handles excluding node_modules from the root context,
# or that there are no pre-existing node_modules in apps/web/
COPY apps/web/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# Copy only necessary package files from the builder stage
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev

# Copy the built application from the builder stage
COPY --from=builder /app/dist/ ./dist/

EXPOSE 5001
ENV NODE_ENV=production PORT=5001

CMD ["node", "dist/index.cjs"]
