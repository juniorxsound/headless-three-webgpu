# Install deps and build the CLI
FROM node:24-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
RUN corepack enable pnpm && corepack prepare pnpm@11.5.2 --activate \
    && pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm exec turbo build

# Extract SwiftShader Vulkan libs for CPU rendering
FROM node:24-bookworm-slim AS swiftshader
ARG SWIFTSHADER_ARCHIVE=android-emulator-bbe98768a47ce9166f768e791768ae5f066c04df-linux-x86_64-lib64-vulkan.tar.gz
ARG SWIFTSHADER_SHA256=1eb8190ecfcde5af12004c67ca2ff29a398c623b37b537030d1a4c2b4f753d98
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tar \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/swiftshader/lib
COPY ext/swiftshader/${SWIFTSHADER_ARCHIVE} /tmp/swiftshader.tar.gz
RUN echo "${SWIFTSHADER_SHA256}  /tmp/swiftshader.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/swiftshader.tar.gz \
    && rm /tmp/swiftshader.tar.gz

# E2E target: headless rendering via SwiftShader (no GPU required)
FROM node:24-bookworm-slim AS e2e
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production
# Dawn uses Vulkan backend, SwiftShader provides the ICD
ENV RGL_DAWN_FLAGS=backend=vulkan
ENV SWIFTSHADER_ROOT=/opt/swiftshader
ENV LD_LIBRARY_PATH=/opt/swiftshader/lib
ENV VK_ICD_FILENAMES=/opt/swiftshader/lib/vk_swiftshader_icd.json
ENV XDG_RUNTIME_DIR=/tmp

COPY --from=swiftshader /opt/swiftshader/lib /opt/swiftshader/lib
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/turbo.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

ENTRYPOINT ["node", "packages/cli/dist/index.js"]
