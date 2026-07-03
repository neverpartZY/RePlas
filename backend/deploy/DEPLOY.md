# 再塑通 RePlasMatch — 生产部署手册

---

## 前置条件（约需 2-4 周）

| 步骤 | 说明 | 耗时 |
|------|------|------|
| 购买云服务器 | 腾讯云轻量 2核4G Ubuntu 22.04 | 即时 |
| 购买域名 | 如 `zaisutong.cn`，完成实名认证 | 1-3 天 |
| ICP 备案 | 在服务器提供商提交，小程序强制要求 | 7-20 工作日 |
| 微信小程序后台配置 | 添加服务器域名白名单 | 即时 |

---

## 一、服务器初始化

```bash
# SSH 登录服务器
ssh root@你的服务器IP

# 更新系统
apt update && apt upgrade -y

# 安装基础工具
apt install -y curl git build-essential sqlite3 nginx certbot python3-certbot-nginx

# 安装 Node.js 22（使用 NodeSource）
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v   # 确认 v22.x

# 安装 PM2
npm install -g pm2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5
```

## 二、部署项目

```bash
# 创建项目目录
mkdir -p /opt/zaisutong
cd /opt/zaisutong

# 上传代码（方式一：git clone）
git clone <你的仓库地址> .

# 上传代码（方式二：scp 从本地上传）
# 在本地执行：scp -r 撮合小程序/backend/* root@服务器IP:/opt/zaisutong/

# 创建必要目录
cd /opt/zaisutong/backend
mkdir -p logs data

# 配置生产环境
cp deploy/.env.production .env
nano .env   # 修改 JWT_SECRET、WX_APPID 等

# 生成 JWT_SECRET（复制输出，填入 .env）
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 安装依赖
npm install --production

# 启动服务
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # 设置开机自启（按提示执行输出的命令）
```

## 三、配置 Nginx + HTTPS

```bash
# 复制 Nginx 配置
cp /opt/zaisutong/backend/deploy/nginx.conf /etc/nginx/sites-available/zaisutong

# 替换域名占位符（手动改或 sed）
nano /etc/nginx/sites-available/zaisutong
# 将所有 api.zaisutong.cn 改为你的实际域名

# 启用站点
ln -s /etc/nginx/sites-available/zaisutong /etc/nginx/sites-enabled/
nginx -t          # 检查语法
systemctl reload nginx

# 申请 Let's Encrypt 免费 SSL 证书
certbot --nginx -d api.zaisutong.cn

# 设置证书自动续期
echo "0 3 * * * root certbot renew --quiet && systemctl reload nginx" >> /etc/crontab
```

## 四、配置备份任务

```bash
# 给予执行权限
chmod +x /opt/zaisutong/backend/deploy/backup.sh

# 添加 crontab（每天凌晨 3 点备份）
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/zaisutong/backend/deploy/backup.sh >> /var/log/zaisutong-backup.log 2>&1") | crontab -

# 手动执行一次测试
/opt/zaisutong/backend/deploy/backup.sh
ls -la /opt/zaisutong/backend/data/backups/
```

## 五、验证部署

```bash
# 1. 检查 PM2 状态
pm2 status
# 应显示 zaisutong: online

# 2. 检查端口
ss -tlnp | grep 3456
# 应显示 127.0.0.1:3456（Nginx 反向代理，不对外暴露）

# 3. 健康检查
curl http://127.0.0.1:3456/api/health
# 应返回 {"status":"ok","timestamp":"..."}

# 4. HTTPS 测试
curl https://api.zaisutong.cn/api/health
# 应返回同样内容

# 5. 管理后台
# 浏览器打开 https://api.zaisutong.cn/admin
# 用 admin / admin123 登录
```

## 六、微信小程序上线

1. 在 [mp.weixin.qq.com](https://mp.weixin.qq.com) → 开发 → 开发管理 → 服务器域名：
   - request 合法域名：`https://api.zaisutong.cn`
   - socket 合法域名：`wss://api.zaisutong.cn`

2. 在 HBuilder X 中打开 `rematch-miniapp` 项目
3. 修改 `utils/api.js` 中的 `BASE_URL` 为 `https://api.zaisutong.cn`
4. 编译 → 上传 → 微信公众平台提交审核

## 七、日常运维

### 更新部署
```bash
cd /opt/zaisutong/backend
bash deploy/deploy.sh
```

### 查看日志
```bash
pm2 logs zaisutong --lines 100          # 最近 100 行
pm2 logs zaisutong --err --lines 50     # 错误日志
tail -f /var/log/nginx/zaisutong-access.log  # Nginx 访问日志
```

### 监控
```bash
pm2 monit                    # 实时 CPU/内存/请求
pm2 status                   # 进程状态
df -h                        # 磁盘空间
free -h                      # 内存使用
```

### 恢复数据库
```bash
# 停止服务
pm2 stop zaisutong

# 解压备份并替换
BACKUP_FILE=$(ls -t /opt/zaisutong/backend/data/backups/*.db.gz | head -1)
gunzip -c "$BACKUP_FILE" > /opt/zaisutong/backend/data/zaisutong.db

# 重启服务
pm2 start zaisutong
```

## 八、安全清单

| 检查项 | 状态 |
|--------|------|
| JWT_SECRET 已更换为随机字符串 | □ |
| .env 中的 WX_APPSECRET 已填写 | □ |
| Nginx HTTPS 已启用，HTTP 自动跳转 | □ |
| Express `trust proxy` 已开启 | □ |
| `ALLOWED_ORIGIN` 已限制为实际域名 | □ |
| 数据库备份 cron 已配置 | □ |
| SSH 密钥登录（禁用密码登录） | □ |
| 防火墙仅开放 80/443/22 | □ |
| PM2 开机自启已设置 | □ |
| Let's Encrypt 自动续期已配置 | □ |

---

## 文件索引

| 文件 | 用途 |
|------|------|
| `deploy/nginx.conf` | Nginx 配置文件 |
| `deploy/.env.production` | 生产环境变量模板 |
| `deploy/backup.sh` | 数据库备份脚本 |
| `deploy/deploy.sh` | 一键部署脚本 |
| `ecosystem.config.js` | PM2 进程管理配置 |
| `server.js` | 已添加 `trust proxy` |
