#!/bin/bash
# Watch ECS Fargate logs in real-time
# Usage: ./watch-logs.sh [filter-pattern] [since]
#
# Note: This script works with AWS CLI v2. For v1, use watch-logs-v1.sh

ENVIRONMENT="${ENVIRONMENT:-staging}"
LOG_GROUP="/ecs/paya-${ENVIRONMENT}"
FILTER_PATTERN="${1:-}"
SINCE="${2:-10m}"

echo "Watching logs from: ${LOG_GROUP}"
echo "Since: ${SINCE}"
if [ -n "$FILTER_PATTERN" ]; then
  echo "Filter: ${FILTER_PATTERN}"
  aws logs tail "${LOG_GROUP}" --follow --since "${SINCE}" --filter-pattern "${FILTER_PATTERN}" --format short
else
  aws logs tail "${LOG_GROUP}" --follow --since "${SINCE}" --format short
fi
