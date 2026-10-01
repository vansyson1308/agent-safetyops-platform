FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/safetyops.db

COPY package*.json ./
COPY prisma ./prisma
# Generate the Prisma client after `npm ci`, which wipes node_modules.
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000
# Create/update the schema on start, then run the server.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.cjs"]
