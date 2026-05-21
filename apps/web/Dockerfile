FROM node:20-slim

WORKDIR /usr/src/app
ENV NODE_OPTIONS=--max-old-space-size=1536
ENV NODE_ENV=production

COPY apps/web/package.json ./
RUN npm pkg set dependencies.next=14.2.5
RUN npm install --legacy-peer-deps --include=dev --no-audit --no-fund

COPY apps/web/ ./
RUN mkdir -p /usr/src/app/node_modules/next/next-swc-fallback/@next
RUN npm run build

EXPOSE 3005

CMD ["npm", "run", "start", "--", "-p", "3005"]