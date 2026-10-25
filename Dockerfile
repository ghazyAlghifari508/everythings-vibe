FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
RUN corepack enable
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
    && mkdir -p /ms-playwright \
    && pnpm exec playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
