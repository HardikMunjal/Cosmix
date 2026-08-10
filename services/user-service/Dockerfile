FROM node:20-slim AS builder

WORKDIR /usr/src/app

COPY services/user-service/package*.json ./
RUN npm install --legacy-peer-deps \
  && npm install --save-dev --legacy-peer-deps @types/node@20.17.30 typescript@4.9.5

COPY services/user-service/ ./
RUN npm run build

FROM node:20-slim AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY services/user-service/package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3003

CMD ["npm", "run", "start"]