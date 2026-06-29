# Veyr proxy — production image
# ─────────────────────────────────────────────────────────────────────────────
# Boring on purpose. Mirrors the install + build sequence that already works
# in render.yaml so behaviour is identical across deploy targets.
#
# Multi-stage so the runtime image doesn't ship build tools or dev deps.

# ── 1. Build stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Build tools for better-sqlite3 in case the musl prebuild is unavailable.
RUN apk add --no-cache python3 make g++

WORKDIR /repo

# Manifests first → dependency layer is cacheable. npm ci validates the
# lockfile against every workspace, so all workspace manifests must be present.
COPY package.json package-lock.json ./
COPY packages/proxy/package.json packages/proxy/package.json
COPY packages/dashboard/package.json packages/dashboard/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/desktop/package.json packages/desktop/package.json
COPY packages/vscode-extension/package.json packages/vscode-extension/package.json
COPY packages/browser-extension/package.json packages/browser-extension/package.json

# The desktop workspace depends on electron; skip its ~100MB binary download —
# only the proxy runs in this image.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --workspaces --include-workspace-root

COPY packages/proxy ./packages/proxy
RUN npm run build --workspace=@promptlens/proxy


# ── 2. Runtime stage ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# tini reaps zombies and forwards signals — important on Fly.
RUN apk add --no-cache tini

WORKDIR /app

# We carry the full node_modules forward (the build is small enough that a
# proper `npm prune` per-workspace adds complexity for little win). Better
# safe than mysteriously broken at 3am.
# npm workspaces hoist all deps into the root node_modules — there is no
# packages/proxy/node_modules to copy.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/package-lock.json ./package-lock.json
COPY --from=builder /repo/packages/proxy/package.json ./packages/proxy/package.json
COPY --from=builder /repo/packages/proxy/dist ./packages/proxy/dist

# SQLite lives on a mounted volume so data survives redeploys.
ENV VEYR_DB_PATH=/data/promptlens.db
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "packages/proxy/dist/index.js"]
