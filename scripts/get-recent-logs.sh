#!/bin/bash
# Get recent logs from ECS Fargate (works with AWS CLI v1 and v2)
# Usage: ./get-recent-logs.sh [minutes-back] [filter-pattern]

ENVIRONMENT="${ENVIRONMENT:-staging}"
LOG_GROUP="/ecs/paya-${ENVIRONMENT}"
MINUTES_BACK="${1:-10}"
FILTER_PATTERN="${2:-}"

START_TIME=$(date -u -d "${MINUTES_BACK} minutes ago" +%s)000
END_TIME=$(date -u +%s)000

echo "Fetching logs from: ${LOG_GROUP}"
echo "Time range: Last ${MINUTES_BACK} minutes"
if [ -n "$FILTER_PATTERN" ]; then
  echo "Filter: ${FILTER_PATTERN}"
  aws logs filter-log-events \
    --log-group-name "${LOG_GROUP}" \
    --start-time "${START_TIME}" \
    --end-time "${END_TIME}" \
    --filter-pattern "${FILTER_PATTERN}" \
    --query 'events[*].[timestamp,message]' \
    --output text | while read timestamp message; do
      if [ -n "$timestamp" ]; then
        date_str=$(date -d "@$((timestamp/1000))" '+%Y-%m-%d %H:%M:%S')
        echo "[$date_str] $message"
      fi
    done
else
  aws logs filter-log-events \
    --log-group-name "${LOG_GROUP}" \
    --start-time "${START_TIME}" \
    --end-time "${END_TIME}" \
    --query 'events[*].[timestamp,message]' \
    --output text | while read timestamp message; do
      if [ -n "$timestamp" ]; then
        date_str=$(date -d "@$((timestamp/1000))" '+%Y-%m-%d %H:%M:%S')
        echo "[$date_str] $message"
      fi
    done
fi

