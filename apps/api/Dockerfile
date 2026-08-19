# Multi-arch:
# docker buildx build --platform linux/amd64,linux/arm64 \
#   -f apps/api/Dockerfile -t codelit/frontlit-api:k3s --push .
FROM node:24-alpine AS base
RUN corepack enable pnpm

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY apps/api ./apps/api
COPY packages/api-contract ./packages/api-contract

# better-auth declares next/react/drizzle-kit as optional peers. pnpm would
# otherwise auto-install them (and @next/swc) into this Node API image.
# Only install this package's workspace graph, not web/sites.
RUN printf 'auto-install-peers=false\n' > .npmrc \
 && pnpm install --filter=@frontlit/api... --no-frozen-lockfile

FROM deps AS builder
WORKDIR /app
RUN pnpm --filter=@frontlit/api-contract build
RUN pnpm --filter=@frontlit/api build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY --from=builder /app/packages/api-contract/package.json ./packages/api-contract/package.json
COPY --from=builder /app/packages/api-contract/dist ./packages/api-contract/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle

RUN printf 'auto-install-peers=false\nstore-dir=/tmp/pnpm-store\n' > .npmrc \
 && pnpm install --prod --filter=@frontlit/api... --no-frozen-lockfile --ignore-scripts \
 && rm -rf /tmp/pnpm-store /root/.local /root/.cache \
 && chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
