#!/bin/bash
# ============================================================
# 再塑通 RePlasMatch — 一键部署脚本
# 用法：./deploy.sh
# ============================================================

set -e

PROJECT_DIR="/opt/zaisutong/backend"
BRANCH="${1:-main}"

echo "========================================="
echo "  再塑通 生产部署"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

# ---- 1. 拉取最新代码 --------------------------------------------
echo ""
echo "[1/5] 拉取代码..."
cd "$PROJECT_DIR"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# ---- 2. 安装依赖 -----------------------------------------------
echo ""
echo "[2/5] 安装依赖..."
npm ci --production 2>/dev/null || npm install --production

# ---- 3. 数据库迁移检查 -----------------------------------------
echo ""
echo "[3/5] 检查数据库..."
DB_FILE="${PROJECT_DIR}/data/zaisutong.db"
if [ -f "$DB_FILE" ]; then
    echo "  数据库状态: 正常 ($(du -h "$DB_FILE" | cut -f1))"
else
    echo "  [警告] 数据库文件不存在，首次启动时会自动创建"
fi

# ---- 4. 重启服务 -----------------------------------------------
echo ""
echo "[4/5] 重启服务..."
pm2 reload ecosystem.config.js --update-env

# ---- 5. 健康检查 -----------------------------------------------
echo ""
echo "[5/5] 健康检查..."

sleep 3  # 等待服务启动

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3456/api/health 2>/dev/null || echo "000")

if [ "$HEALTH" = "200" ]; then
    echo "  ✓ 健康检查通过 (HTTP $HEALTH)"
    pm2 status zaisutong
else
    echo "  ✗ 健康检查失败 (HTTP $HEALTH)！请检查日志：pm2 logs zaisutong --err --lines 50"
    exit 1
fi

echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
