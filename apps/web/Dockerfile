FROM node:20-slim AS builder

WORKDIR /usr/src/app
ENV NODE_OPTIONS=--max-old-space-size=1536

COPY apps/web/package.json ./
RUN npm install --legacy-peer-deps

COPY apps/web/ ./
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-slim AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/next.config.js ./next.config.js
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/node_modules ./node_modules

EXPOSE 3005

CMD ["npm", "run", "start", "--", "-p", "3005"]