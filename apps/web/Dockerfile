FROM node:20-slim AS builder

WORKDIR /usr/src/app
ENV NODE_OPTIONS=--max-old-space-size=1536

COPY apps/web/package.json ./
RUN npm install --legacy-peer-deps

COPY apps/web/ ./
RUN npm run build

FROM node:20-slim AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY apps/web/package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/next.config.js ./next.config.js

EXPOSE 3005

CMD ["npm", "run", "start", "--", "-p", "3005"]