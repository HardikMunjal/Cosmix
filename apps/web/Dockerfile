FROM node:20-slim

WORKDIR /usr/src/app
ENV NODE_OPTIONS=--max-old-space-size=1536
ENV NODE_ENV=production

COPY apps/web/package.json ./
RUN npm install --legacy-peer-deps

COPY apps/web/ ./
RUN npm run build

EXPOSE 3005

CMD ["npm", "run", "start", "--", "-p", "3005"]