FROM node:20-slim AS builder

WORKDIR /usr/src/app

COPY apps/api-gateway/package*.json ./
RUN npm install

COPY tsconfig.base.json ./
COPY services ./services
COPY apps/api-gateway ./apps/api-gateway

RUN npx tsc -p apps/api-gateway/tsconfig.json

FROM node:20-slim AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY apps/api-gateway/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /usr/src/app/apps/api-gateway/dist ./apps/api-gateway/dist

EXPOSE 3000

CMD ["node", "apps/api-gateway/dist/apps/api-gateway/src/main.js"]