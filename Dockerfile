# Geek Content Creator — Next.js standalone for Railway / containers
ARG NODE_VERSION=22-slim

FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
# Public env vars must be present at build for Next inlining
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_GEEK_API_URL
ARG NEXT_PUBLIC_OAUTH_CLIENT_ID=geek-content-creator
ARG NEXT_PUBLIC_OAUTH_REDIRECT_URI
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_GEEK_API_URL=$NEXT_PUBLIC_GEEK_API_URL \
    NEXT_PUBLIC_OAUTH_CLIENT_ID=$NEXT_PUBLIC_OAUTH_CLIENT_ID \
    NEXT_PUBLIC_OAUTH_REDIRECT_URI=$NEXT_PUBLIC_OAUTH_REDIRECT_URI
RUN npm run build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3003
ENV HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir .next && chown node:node .next
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3003
CMD ["node", "server.js"]
