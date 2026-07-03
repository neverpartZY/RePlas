#!/bin/bash
# ============================================================
# 再塑通 RePlasMatch — 数据库自动备份脚本
# 用法：./backup.sh
# 建议 crontab：0 3 * * * /opt/zaisutong/backend/deploy/backup.sh
# ============================================================

set -e

# ---- 配置 ------------------------------------------------------
PROJECT_DIR="/opt/zaisutong/backend"
DB_FILE="${PROJECT_DIR}/data/zaisutong.db"
BACKUP_DIR="${PROJECT_DIR}/data/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ---- 前置检查 --------------------------------------------------
if [ ! -f "$DB_FILE" ]; then
    echo "[ERROR] 数据库文件不存在: $DB_FILE"
    exit 1
fi

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# ---- 备份 ------------------------------------------------------
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始备份..."

# 使用 VACUUM INTO 在线备份（SQLite 3.27+）
BACKUP_FILE="${BACKUP_DIR}/zaisutong_${TIMESTAMP}.db"
BACKUP_ZIP="${BACKUP_DIR}/zaisutong_${TIMESTAMP}.db.gz"

# 方式一：SQLite 在线备份（不阻塞写入）
sqlite3 "$DB_FILE" "VACUUM INTO '${BACKUP_FILE}'"

# 压缩
gzip -c "$BACKUP_FILE" > "$BACKUP_ZIP"
rm -f "$BACKUP_FILE"

# 记录大小
SIZE=$(du -h "$BACKUP_ZIP" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份完成: $BACKUP_ZIP ($SIZE)"

# ---- 清理旧备份 ------------------------------------------------
DELETED=$(find "$BACKUP_DIR" -name "zaisutong_*.db.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 清理了 ${DELETED} 个旧备份"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份任务结束"
