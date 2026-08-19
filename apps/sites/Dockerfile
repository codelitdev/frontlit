# Multi-arch:
# docker buildx build --platform linux/amd64,linux/arm64 \
#   -f apps/sites/Dockerfile -t codelit/frontlit-sites:k3s --push .
FROM node:24-alpine AS base
RUN corepack enable pnpm

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY apps/sites ./apps/sites
COPY packages/api-contract ./packages/api-contract
COPY packages/page-builder ./packages/page-builder
COPY packages/text-editor ./packages/text-editor

RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/ ./

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter=@frontlit/api-contract build
RUN pnpm --filter=@frontlit/text-editor build
RUN pnpm --filter=@frontlit/page-builder build
RUN pnpm --filter=@frontlit/sites build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3002

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/sites/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/sites/.next/static ./apps/sites/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/sites/public ./apps/sites/public

USER nextjs

EXPOSE 3002

CMD ["node", "apps/sites/server.js"]
