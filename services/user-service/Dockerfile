FROM node:20-slim AS builder

WORKDIR /usr/src/app

COPY services/user-service/package*.json ./
RUN npm install

COPY services/user-service/ ./
RUN npm run build

FROM node:20-slim AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY services/user-service/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3003

CMD ["npm", "run", "start"]