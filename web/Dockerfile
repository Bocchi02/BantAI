FROM node:22-alpine AS dependencies

WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_BANTAI_API_URL=/api/v1
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_BANTAI_API_URL=${NEXT_PUBLIC_BANTAI_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
COPY --from=dependencies /app/node_modules ./node_modules
COPY web ./
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

RUN addgroup --system --gid 10001 signalam \
    && adduser --system --uid 10001 --ingroup signalam signalam

COPY --from=builder --chown=signalam:signalam /app/public ./public
COPY --from=builder --chown=signalam:signalam /app/.next/standalone ./
COPY --from=builder --chown=signalam:signalam /app/.next/static ./.next/static

USER signalam
EXPOSE 3000
CMD ["node", "server.js"]
