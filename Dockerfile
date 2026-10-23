# Production image for the Custom Activity service.
# Build: docker build -t sfmc-custom-activity .
# Run:   docker run --env-file <secrets-file> -p 3000:3000 sfmc-custom-activity
# Secrets are supplied at runtime. This image contains no .env file.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY server ./server
COPY public ./public
RUN chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
