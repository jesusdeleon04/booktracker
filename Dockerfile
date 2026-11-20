# Booktracker: React frontend built once, served by the Flask API (one service).
FROM node:24-slim AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Public values (safe in the browser). Render passes its environment variables as build args.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/ backend/
COPY --from=web /app/frontend/dist frontend/dist
ENV BOOKTRACKER_DATA_DIR=/tmp/booktracker-data
EXPOSE 10000
# Render sets $PORT. Threads, not processes: one process keeps the in-memory caches shared.
CMD ["sh", "-c", "exec gunicorn --chdir backend --bind 0.0.0.0:${PORT:-10000} --workers 1 --threads 8 --timeout 90 app:app"]
