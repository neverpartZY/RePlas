# 绿塑通 (RePlasMatch) Docker 镜像
# 构建: docker build -t replas-match .
# 运行: docker run -d -p 3456:3456 --name replas replas-match

FROM node:22-alpine

# 安装必要工具 + 时区
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# 复制依赖文件先安装（利用 Docker 缓存层）
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --production

# 复制全部代码
COPY . .

# 暴露端口
EXPOSE 3456

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3456/api/health',r=>{process.exit(r.statusCode===200?0:1)})"

# 启动
CMD ["node", "backend/server.js"]
