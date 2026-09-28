#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI was not found. Install or start Docker Desktop first." >&2
  exit 1
fi

build_args=()
if [[ "${1:-}" == "--build" ]]; then
  build_args=(--build)
elif [[ -n "${1:-}" ]]; then
  echo "Usage: bash ./start.sh [--build]" >&2
  exit 1
fi

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnH | awk '{print $4}' | grep -Eq "(^|:)$port$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -E "[.:]$port[[:space:]].*LISTEN" >/dev/null
  else
    echo "Port detection needs lsof, ss, or netstat." >&2
    exit 1
  fi
}

find_free_port() {
  local port="$1"
  while (( port <= 65535 )); do
    if ! port_in_use "$port"; then
      printf '%s\n' "$port"
      return
    fi
    ((port += 1))
  done
  echo "No free TCP port was found." >&2
  exit 1
}

current_project_port() {
  local service="$1"
  local container_port="$2"
  local address
  address="$(docker compose port "$service" "$container_port" 2>/dev/null | head -n 1 || true)"
  if [[ "$address" =~ :([0-9]+)$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  fi
}

web_port="$(current_project_port web 3000)"
api_port="$(current_project_port api 8080)"
web_port="${web_port:-$(find_free_port 3000)}"
api_port="${api_port:-$(find_free_port 8080)}"

export WEB_PORT="$web_port"
export API_PORT="$api_port"
export PUBLIC_WEB_URL="http://localhost:$web_port"
export PUBLIC_API_URL="http://localhost:$api_port"

printf 'Web: %s\n' "$PUBLIC_WEB_URL"
printf 'API: %s\n' "$PUBLIC_API_URL"
docker compose up -d "${build_args[@]}"
if ! docker buildx prune --force --max-used-space 8GB; then
  echo "Warning: the website started, but Docker build-cache maintenance failed." >&2
fi
