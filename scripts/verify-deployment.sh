#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://127.0.0.1:8787}"

health_json="$(curl --fail --silent --show-error --max-time 10 "${base_url}/api/health")"
printf '%s\n' "$health_json" | grep -q '"ok":true'

status_code="$(
  curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 \
    "${base_url}/api/me"
)"
test "$status_code" = "401"

index_html="$(curl --fail --silent --show-error --max-time 10 "${base_url}/")"
printf '%s\n' "$index_html" | grep -q '<div id="root"></div>'

printf 'Deployment verification passed: %s\n' "$base_url"
