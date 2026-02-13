#!/usr/bin/env bash
set -e

BASE="http://localhost:3000"
EMAIL="shaan@sahwa.dev"
PASS="password123"

echo "Logging in..."
LOGIN_JSON=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

TOKEN=$(echo "$LOGIN_JSON" | jq -r '.accessToken')
echo "TOKEN: ${TOKEN:0:20}..."

echo "Getting circles..."
CIRCLE_ID=$(curl -s "$BASE/circles" -H "Authorization: Bearer $TOKEN" | jq -r '.circles[0].id')
echo "CIRCLE_ID: $CIRCLE_ID"

echo "Posting journal..."
curl -s -X POST "$BASE/circles/$CIRCLE_ID/journals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Dev test","content":"Hello from dev.sh","pillar":"body"}' | jq

echo "Done."
