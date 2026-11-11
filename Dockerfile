# syntax=docker/dockerfile:1.7
FROM node:24.15.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --prefix /pnpm pnpm@10.6.1
ENV PATH="/pnpm/node_modules/.bin:${PATH}"
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    --mount=type=cache,id=heirloom-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY . .
ARG SOURCE_REVISION
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ARG NEXT_PUBLIC_CLOUDINARY_API_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV OUTPUT_STANDALONE=1
RUN --mount=type=secret,id=actions_key,required=true \
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/actions_key)" pnpm build

FROM node:24.15.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    APP_ENV=production \
    HOST_PROVIDER=node \
    CRON_OWNER=none \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.hosting-build.json ./
COPY --chown=node:node scripts/container-start.mjs scripts/container-cache.cjs scripts/cron-runner.mjs ./scripts/
COPY --chown=node:node src/config/deployment.js ./src/config/deployment.js
COPY --chown=node:node vercel.json ./
USER node
EXPOSE 3000
CMD ["node", "scripts/container-start.mjs"]
