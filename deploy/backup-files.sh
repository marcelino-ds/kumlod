#!/usr/bin/env bash
# Copies Kumlod material files to object storage. Run daily by kumlod-backup-files.timer.
# Files are named by UUID and never change, so "copy" (never delete) is safe and keeps
# files of deleted materials as a safety net.
set -euo pipefail

: "${KUMLOD_S3_BUCKET:?KUMLOD_S3_BUCKET belum diisi di /etc/kumlod/storage.env}"
FILES_DIR="${KUMLOD_FILES_DIR:-/var/lib/kumlod/data/files}"

export RCLONE_CONFIG_KUMLODS3_TYPE=s3
export RCLONE_CONFIG_KUMLODS3_PROVIDER="${KUMLOD_S3_PROVIDER:-Other}"
export RCLONE_CONFIG_KUMLODS3_ACCESS_KEY_ID="${KUMLOD_S3_ACCESS_KEY_ID:-}"
export RCLONE_CONFIG_KUMLODS3_SECRET_ACCESS_KEY="${KUMLOD_S3_SECRET_ACCESS_KEY:-}"
export RCLONE_CONFIG_KUMLODS3_ENDPOINT="${KUMLOD_S3_ENDPOINT:-}"
export RCLONE_CONFIG_KUMLODS3_REGION="${KUMLOD_S3_REGION:-}"
export RCLONE_CONFIG_KUMLODS3_NO_CHECK_BUCKET=true

if [ ! -d "$FILES_DIR" ]; then
  echo "Folder $FILES_DIR belum ada, tidak ada yang di-backup."
  exit 0
fi

exec rclone copy "$FILES_DIR" "kumlods3:${KUMLOD_S3_BUCKET}/kumlod/files" \
  --exclude "tmp/**" \
  --transfers 4 \
  --checkers 8 \
  --log-level INFO \
  --stats-one-line \
  --stats 0
