# Multi-arch:
# docker buildx build --platform linux/amd64,linux/arm64 \
#   -f apps/api/Dockerfile -t codelit/frontlit:k3s --push .
FROM oven/bun:1.4.1-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json bun.lock ./
COPY patches ./patches
COPY packages/api-contract ./packages/api-contract
COPY packages/text-editor ./packages/text-editor
COPY packages/page-builder ./packages/page-builder
COPY packages/media-uploader/package.json ./packages/media-uploader/package.json
COPY apps/api ./apps/api

RUN bun install --frozen-lockfile --filter=@frontlit/api --filter=@frontlit/api-contract --filter=@frontlit/text-editor --filter=@frontlit/page-builder

FROM deps AS builder
WORKDIR /app
RUN bun run --filter @frontlit/api-contract build
RUN bun run --filter @frontlit/text-editor build
# Only the React-free schema entry: page/site file validation and the
# canonical serializer (zod and jsonc-parser are bundled into it).
RUN bun run --filter @frontlit/page-builder build:schema
RUN bun run --filter @frontlit/api build

FROM base AS prod-deps
WORKDIR /app

COPY package.json bun.lock ./
COPY patches ./patches
COPY --from=builder /app/packages/api-contract/package.json ./packages/api-contract/package.json
COPY --from=builder /app/packages/api-contract/dist ./packages/api-contract/dist
COPY --from=builder /app/packages/text-editor/package.json ./packages/text-editor/package.json
COPY --from=builder /app/packages/text-editor/dist ./packages/text-editor/dist
COPY --from=builder /app/packages/page-builder/package.json ./packages/page-builder/package.json
COPY --from=builder /app/packages/page-builder/dist/server/schema.js ./packages/page-builder/dist/server/schema.js
COPY --from=builder /app/packages/media-uploader/package.json ./packages/media-uploader/package.json
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
