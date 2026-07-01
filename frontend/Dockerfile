# Build-only image: compiles the Vite SPA and carries the static output. It is
# NOT a web server — the built files are copied out onto the host's nginx web
# root by the pipeline (nginx is configured/served separately on the host).

# ---- Build stage ----
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* env vars at BUILD time, so the backend API base URL must be
# known here. Passed as a --build-arg from the pipeline. Empty by default -> the
# app falls back to same-origin '/api' (see src/lib/api.ts).
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# `npm run build` runs `tsc -b && vite build`, so a type error fails the image
# build (our compile gate, mirroring the backend Dockerfile).
RUN npm run build

# ---- Export stage ----
# Tiny image whose only job is to hold /dist so the pipeline can copy it to the
# host: `docker run --rm -v <nginx-root>:/out <image> ...`. Alpine gives us sh/cp.
FROM alpine AS export
COPY --from=builder /app/dist /dist
