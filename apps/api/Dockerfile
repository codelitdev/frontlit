# Multi-arch:
# docker buildx build --platform linux/amd64,linux/arm64 \
#   -f apps/api/Dockerfile -t codelit/frontlit-api:k3s --push .
FROM oven/bun:1.4.1-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json bun.lock ./
COPY patches ./patches
COPY packages/api-contract ./packages/api-contract
COPY packages/text-editor ./packages/text-editor
COPY apps/api ./apps/api

RUN bun install --frozen-lockfile --filter=@frontlit/api --filter=@frontlit/api-contract --filter=@frontlit/text-editor

FROM deps AS builder
WORKDIR /app
RUN bun run --filter @frontlit/api-contract build
RUN bun run --filter @frontlit/text-editor build
RUN bun run --filter @frontlit/api build

FROM base AS prod-deps
WORKDIR /app

COPY package.json bun.lock ./
COPY patches ./patches
COPY --from=builder /app/packages/api-contract/package.json ./packages/api-contract/package.json
COPY --from=builder /app/packages/api-contract/dist ./packages/api-contract/dist
COPY --from=builder /app/packages/text-editor/package.json ./packages/text-editor/package.json
COPY --from=builder /app/packages/text-editor/dist ./packages/text-editor/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle

RUN bun install --production --frozen-lockfile --filter=@frontlit/api --filter=@frontlit/api-contract --filter=@frontlit/text-editor

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser

COPY --from=prod-deps --chown=nodeuser:nodejs /app ./

USER nodeuser

EXPOSE 4000

CMD ["sh", "-c", "node apps/api/dist/db/migrate.js && exec node apps/api/dist/index.js"]
