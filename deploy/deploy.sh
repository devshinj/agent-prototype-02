#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== Stopping containers ==="
docker compose down

echo "=== Loading image ==="
docker load -i repo-reporter.tar.gz

echo "=== Starting containers ==="
docker compose up -d

echo "=== Done ==="
docker compose ps
