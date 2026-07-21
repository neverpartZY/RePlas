#!/bin/bash
# ============================================================
# 再塑通 RePlasMatch — 每日数据库备份脚本
# 运行位置: ECS (47.108.178.124)
# 备份来源: 云托管 API https://replas1-280446-9-1452497195.sh.run.tcloudbase.com
# 触发方式: crontab 每天凌晨 3:00
#   0 3 * * * /opt/replas-match/backend/scripts/backup-db.sh >> /var/log/replas-backup.log 2>&1
# ============================================================

set -e

BACKUP_DIR="/opt/backups/replas-match"
API_BASE="https://replas1-280446-9-1452497195.sh.run.tcloudbase.com"
TOKEN="${MIGRATION_TOKEN:-replas_migrate_2026_5a7b9c}"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_TAG="[backup-${TIMESTAMP}]"

mkdir -p "$BACKUP_DIR"

echo "$LOG_TAG 开始备份..."

# 1. 调用云托管备份 API
BACKUP_FILE="$BACKUP_DIR/zaisutong_${TIMESTAMP}.db"
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$BACKUP_FILE" \
  -H "Authorization: Bearer ${TOKEN}" \
  --connect-timeout 30 --max-time 120 \
  "$API_BASE/api/admin/backup")

if [ "$HTTP_CODE" != "200" ]; then
  echo "$LOG_TAG 备份失败! HTTP $HTTP_CODE"
  # 打印响应内容（可能是 JSON 错误消息）
  cat "$BACKUP_FILE" 2>/dev/null
  rm -f "$BACKUP_FILE"
  exit 1
fi

# 2. 验证文件
FILE_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)
if [ "$FILE_SIZE" -lt 1024 ]; then
  echo "$LOG_TAG 备份文件异常（${FILE_SIZE} bytes），可能是错误响应"
  rm -f "$BACKUP_FILE"
  exit 1
fi

echo "$LOG_TAG 备份成功: ${BACKUP_FILE} ($(numfmt --to=iec $FILE_SIZE 2>/dev/null || echo ${FILE_SIZE} bytes))"

# 3. 清理 7 天前的旧备份
DELETED=$(find "$BACKUP_DIR" -name "zaisutong_*.db" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "$LOG_TAG 清理了 ${DELETED} 个过期备份（>${RETENTION_DAYS}天）"
fi

# 4. 显示当前备份清单
echo "$LOG_TAG 当前备份文件:"
ls -lh "$BACKUP_DIR"/zaisutong_*.db 2>/dev/null | tail -5

echo "$LOG_TAG 完成"
