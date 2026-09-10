FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Standalone runtime image for Cloud Run: only the files next.config.mjs's
# `output: 'standalone'` traces as needed are copied, no dev dependencies.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Cloud Run sets PORT (default 8080) and expects the container to listen on it.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
