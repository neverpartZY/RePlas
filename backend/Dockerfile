# ============================================================
# 再塑通 RePlasMatch — 微信云托管 Dockerfile
# 构建上下文：仓库根目录（撮合小程序/）
# Dockerfile 位置：backend/Dockerfile
# ============================================================

FROM node:22-alpine

# 安装编译 native 模块所需的依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    tzdata \
    tini && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app/backend

# 先复制 package.json，利用 Docker 缓存层
COPY backend/package.json backend/package-lock.json* ./

# 安装依赖（含 better-sqlite3, sharp 等原生模块编译）
RUN npm install --production && npm cache clean --force

# 复制后端全部代码
COPY backend/ ./

# 创建数据目录（SQLite 模式用，挂载云硬盘保证持久化）
RUN mkdir -p data uploads logs

# 以非 root 用户运行
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3456)+'/api/health', r => {process.exit(r.statusCode===200?0:1)})"

EXPOSE 3456

# tini 作为 init 进程
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
