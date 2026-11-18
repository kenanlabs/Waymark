# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force \
  && mkdir -p /app/data && chown -R node:node /app/data

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/utils/userscript.ts ./src/utils/userscript.ts
COPY --from=builder /app/src/utils/extension.ts ./src/utils/extension.ts
COPY --from=builder /app/src/utils/extensionMeta.ts ./src/utils/extensionMeta.ts
COPY --from=builder /app/src/types/panel.ts ./src/types/panel.ts

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]
