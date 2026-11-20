# Multi-arch:
# docker buildx build --platform linux/amd64,linux/arm64 \
#   -f apps/sites/Dockerfile -t codelit/frontlit-sites:k3s --push .
# Install and build run on the build machine's own platform ($BUILDPLATFORM):
# the output is JavaScript, the same for every target, and emulating arm64 on
# an x86 builder (or the reverse) is several times slower. Only the runtime
# stage below is the target platform, with sharp's native binaries for it.
FROM --platform=$BUILDPLATFORM oven/bun:1.4.1-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json bun.lock ./
COPY patches ./patches
COPY apps/sites ./apps/sites
COPY packages/api-contract ./packages/api-contract
COPY packages/page-builder ./packages/page-builder
COPY packages/text-editor ./packages/text-editor
COPY packages/media-uploader ./packages/media-uploader

RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
# Read by `next build` (next.config.mjs), not at runtime.
ARG IMAGE_REMOTE_HOSTS
ARG DEPLOYMENT_ID
ARG ASSET_PREFIX
ENV IMAGE_REMOTE_HOSTS=$IMAGE_REMOTE_HOSTS DEPLOYMENT_ID=$DEPLOYMENT_ID ASSET_PREFIX=$ASSET_PREFIX

RUN bun run --filter @frontlit/api-contract build
RUN bun run --filter @frontlit/text-editor build
RUN bun run --filter @frontlit/media-uploader build
RUN bun run --filter @frontlit/page-builder build
RUN bun run --filter @frontlit/sites build

# sharp (Next.js image optimization) is the one native module traced into the
# standalone output. Fetch its binaries for the target platform, at the
# version the lockfile resolved, without running anything for that platform.
ARG TARGETARCH
RUN version=$(ls node_modules/.bun | sed -n 's/^sharp@\([0-9.]*\).*/\1/p' | head -n 1) \
    && test -n "$version" \
    && mkdir -p /target-sharp && cd /target-sharp \
    && printf '{"dependencies":{"sharp":"%s"}}' "$version" > package.json \
    && bun install --production --os=linux \
        --cpu=$([ "$TARGETARCH" = amd64 ] && echo x64 || echo "$TARGETARCH")

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
# Put the target platform's sharp binaries (@img/sharp-*, which include
# libvips) beside each traced copy of sharp. Packages already there (the
# build platform's, or JavaScript ones such as @img/colour) are left as is.
COPY --from=builder /target-sharp/node_modules/@img /tmp/target-img
RUN for dir in $(find node_modules -type d -path '*/node_modules/sharp'); do \
        mkdir -p "$dir/../@img"; \
        for pkg in /tmp/target-img/sharp-*; do \
            [ -e "$dir/../@img/${pkg##*/}" ] || cp -R "$pkg" "$dir/../@img/"; \
        done; \
    done \
    && rm -rf /tmp/target-img

USER nextjs

EXPOSE 3002

CMD ["node", "apps/sites/server.js"]
