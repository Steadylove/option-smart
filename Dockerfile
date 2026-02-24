# ── Stage 1: Build frontend ──────────────────────────────
FROM node:20-slim AS frontend-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

# ── Stage 2: Install backend deps ────────────────────────
FROM python:3.12-slim AS backend-builder

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --target=/deps -r requirements.txt

# ── Stage 3: Production image ────────────────────────────
FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl supervisor && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend
COPY --from=backend-builder /deps /usr/local/lib/python3.12/site-packages
COPY backend/ ./backend/

# Frontend (built output + node_modules for next start)
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-builder /app/frontend/package.json ./frontend/package.json
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/next.config.ts ./frontend/next.config.ts
COPY --from=frontend-builder /app/frontend/messages ./frontend/messages

# Supervisor config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Data directory for SQLite
RUN mkdir -p /app/data

ENV PYTHONPATH=/app
ENV NODE_ENV=production

EXPOSE 3000

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
