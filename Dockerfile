# Creates a minimal docker container that only contains production pnpm dependencies
# and production code artifacts

# Builder stage
FROM node:23.6.0-alpine3.21 as base

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY ./.nvmrc ./.nvmrc
COPY ./package.json ./package.json
COPY ./pnpm-lock.yaml ./pnpm-lock.yaml

# Installer stage
FROM base as installer
# TODO: we don't need these yet
# Install native build dependencies
#   - better-sqlite3 (?todo?)
#   - bcrypt (todo)
#   - pg-native (todo)
RUN apk add --no-cache python3 make g++

FROM installer as prod-deps
WORKDIR /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# Compiler stage
# Reuse prod dependency installer stage so that we don't have to install build dependencies again
# (pnpm store caches deps, otherwise it can take a while to build native deps)
FROM prod-deps as build
WORKDIR /app
# Install all deps (including dev deps) - prod deps will already be installed
# from the prod-deps stage
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY ./src ./src
COPY ./tsconfig.json ./tsconfig.json
COPY ./config ./config
COPY ./public ./public
COPY ./openapi.yaml ./openapi.yaml
RUN pnpm run build

# Final stage
FROM base
WORKDIR /app
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app/build
COPY --from=build /app/public /app/public
COPY --from=build /app/openapi.yaml /app/openapi.yaml
EXPOSE 8080
EXPOSE 9110
CMD ["node", "./build/main.js", "api"]

