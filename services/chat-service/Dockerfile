FROM node:20-slim AS builder

WORKDIR /usr/src/app

COPY services/chat-service/package*.json ./
RUN npm install --legacy-peer-deps

COPY services/chat-service/ ./
RUN npm run build

FROM node:20-slim AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY services/chat-service/package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3002

CMD ["npm", "run", "start"]