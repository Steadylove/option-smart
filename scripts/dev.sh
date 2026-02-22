#!/bin/bash
# Start both backend and frontend for local development

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load env vars
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

B_PORT="${BACKEND_PORT:-8000}"
F_PORT="${FRONTEND_PORT:-3000}"

# Kill processes occupying required ports
for port in "$B_PORT" "$F_PORT"; do
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Port $port in use, killing pid(s): $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

# Activate Python venv
if [ -d "$PROJECT_ROOT/.venv" ]; then
  source "$PROJECT_ROOT/.venv/bin/activate"
fi

echo "Starting backend..."
cd "$PROJECT_ROOT"
python -m uvicorn backend.main:app --reload --port "$B_PORT" &
BACKEND_PID=$!

echo "Starting frontend..."
cd "$PROJECT_ROOT/frontend"
npm run dev -- --port "$F_PORT" &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:${BACKEND_PORT:-8000}"
echo "Frontend: http://localhost:${FRONTEND_PORT:-3000}"
echo "API docs: http://localhost:${BACKEND_PORT:-8000}/docs"
echo ""
echo "Press Ctrl+C to stop both"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
