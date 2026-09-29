# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

ARG VITE_CHAT_REQUEST_TIMEOUT_MS=90000
ENV VITE_CHAT_REQUEST_TIMEOUT_MS=$VITE_CHAT_REQUEST_TIMEOUT_MS

# Production defaults — local Compose overrides via docker-compose.override.yml.
# Process ENV wins over .env.production so Compose can keep sources + Ollama-aware copy.
ARG VITE_SHOW_SOURCES=false
ENV VITE_SHOW_SOURCES=$VITE_SHOW_SOURCES

# Keep in sync with frontend/.env.production VITE_LOADING_MESSAGE.
ARG VITE_LOADING_MESSAGE="Searching and thinking — this can take a few moments, thanks for your patience."
ENV VITE_LOADING_MESSAGE=$VITE_LOADING_MESSAGE

# Public Supabase settings only. Compose reads these from the root .env.
# A production bundle throws in the browser when they are missing, which is a
# blank page, so the image build fails first.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_PUBLISHABLE_KEY" \
  || (echo "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the root .env" >&2 && exit 1)
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
