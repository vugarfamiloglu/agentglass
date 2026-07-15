# ---- build: compile the SPA and the server ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Server deps (dev deps included — needed for tsc).
COPY package.json package-lock.json ./
RUN npm ci

# Web deps.
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci

# Build both: Vite SPA -> web/dist, TypeScript server -> dist.
COPY . .
RUN npm --prefix web run build && npx tsc -p tsconfig.json

# ---- runtime: production deps + built artifacts only ----
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV AGENTGLASS_PORT=4319

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist

EXPOSE 4319
VOLUME /app/data
CMD ["node", "dist/index.js"]
