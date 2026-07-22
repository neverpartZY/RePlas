/**
 * 再塑通 RePlasMatch — 主服务入口 v5.0
 * Express + WebSocket 后端
 */

// 加载环境变量（必须在最前面）
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch (e) { /* dotenv optional */ }

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const rateLimit = require('express-rate-limit');

const { verifyToken } = require('./middleware/auth');
const { requireAuth } = require('./middleware/auth');
const { optionalAuth } = require('./middleware/auth');

// 数据库 — 根据 DB_TYPE 自动选择 SQLite 或 MySQL
const db = require('./db/index');
const DB_TYPE = db.DB_TYPE;

// 存储 — 根据 STORAGE_TYPE 自动选择本地或 COS
const storage = require('./storage/index');

// ---- Routes ----------------------------------------------------------------
const authRouter        = require('./routes/auth');
const usersRouter       = require('./routes/users');
const listingsRouter    = require('./routes/listings');
const matchesRouter     = require('./routes/matches');
const pricesRouter      = require('./routes/prices');
const statsRouter       = require('./routes/stats');
const messagesRouter    = require('./routes/messages');
const notificationsRouter = require('./routes/notifications');
const aiRouter            = require('./routes/ai');
const adminRouter         = require('./routes/admin');
// P0 新增路由
const visionRouter        = require('./routes/vision');
const pricingRouter       = require('./routes/pricing');
const externalRouter      = require('./routes/external');
const enterpriseRouter    = require('./routes/enterprise');
const dealIntentsRouter   = require('./routes/deal-intents');
const terminologyRouter   = require('./routes/terminology');
const reportsRouter       = require('./routes/reports');
const migrateRouter       = require('./routes/migrate');
const scraperManager      = require('./scrapers/manager');

// ---- App Setup -------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3456;

// 信任 Nginx 反向代理（生产环境必须，确保 req.ip 和 rate-limit 正确）
app.set('trust proxy', 1);

// ---- Middleware -------------------------------------------------------------

// CORS
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin }));

// Security headers
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '请求过于频繁，请稍后再试' },
});
app.use(generalLimiter);

// 登录/注册接口独立限流 — 5次/分钟防止暴力破解
const authLimiter = rateLimit({
  windowMs: 60000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '登录尝试过于频繁，请1分钟后再试' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Content-Type check (skip for image upload routes)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/vision/')) return next();
  if (req.path.startsWith('/api/backup/db')) return next();
  if (req.path.startsWith('/uploads/')) return next();
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('application/json')) {
      return res.status(415).json({ success: false, error: 'Content-Type 必须为 application/json' });
    }
  }
  next();
});

// ---- 数据库恢复上传（MIGRATION_TOKEN 鉴权）-----------------------------------
// 必须在 express.json() 之前注册，使用 express.raw() 接收二进制数据
app.put('/api/backup/db', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || '';
  if (!MIGRATION_TOKEN) {
    return res.status(500).json({ success: false, error: 'MIGRATION_TOKEN 未配置' });
  }
  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (auth !== MIGRATION_TOKEN) {
    return res.status(401).json({ success: false, error: '无效的恢复令牌' });
  }

  if (DB_TYPE !== 'sqlite') {
    return res.status(400).json({ success: false, error: '仅 SQLite 模式支持在线恢复' });
  }

  const buffer = req.body;
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 16) {
    return res.status(400).json({ success: false, error: '请上传有效的数据库文件 (application/octet-stream)' });
  }

  // 验证 SQLite 文件头
  if (buffer.toString('utf8', 0, 16) !== 'SQLite format 3\x00') {
    return res.status(400).json({ success: false, error: '无效的 SQLite 数据库文件' });
  }

  const dbPath = db.name;
  const backupPath = dbPath + '.backup.' + Date.now();

  // 先备份当前文件（如果存在）
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log('[restore] 当前数据库已备份到:', backupPath);
  }

  // 写入新文件
  fs.writeFileSync(dbPath, buffer);
  console.log(`[restore] 数据库已恢复，大小: ${(buffer.length / 1024).toFixed(1)} KB`);

  // 验证新文件可打开
  try {
    const testDb = require('better-sqlite3')(dbPath, { readonly: true });
    const tables = testDb.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table'").get();
    testDb.close();
    console.log(`[restore] 验证通过，${tables.n} 个表`);

    // 恢复成功后删除临时备份
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }

    res.json({
      success: true,
      message: '数据库恢复成功，请重启容器生效',
      size: buffer.length,
      tables: tables.n,
      needRestart: true,
    });
  } catch (verifyErr) {
    // 验证失败，回滚
    console.error('[restore] 新数据库验证失败，回滚:', verifyErr.message);
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, dbPath);
      fs.unlinkSync(backupPath);
    }
    res.status(400).json({ success: false, error: '数据库文件损坏，已自动回滚' });
  }
});

app.use(express.json({ limit: '10mb' }));

// Static file serving for uploaded images（本地模式；云托管模式走 COS URL）
if (storage.STORAGE_TYPE !== 'cos') {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

// Request logging
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.url}`);
  next();
});

// ---- Static files ----------------------------------------------------------
const STATIC_DIR = path.join(__dirname, '..');
app.use(express.static(STATIC_DIR));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, '前端_app_v5.html'));
});

// ---- API Routes ------------------------------------------------------------

// 公开路由（无需认证）
app.use('/api/auth',      authRouter);
app.use('/api/users',     usersRouter);   // 保留旧版兼容
app.use('/api/prices',    optionalAuth, pricesRouter);
app.use('/api/stats',     optionalAuth, statsRouter);
app.use('/api/ai',        optionalAuth, aiRouter);
app.use('/api/enterprise', optionalAuth, enterpriseRouter);
app.use('/api/health',    (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: DB_TYPE,
    storage: storage.STORAGE_TYPE,
  };
  res.json(health);
});

// ---- 数据库备份导出（MIGRATION_TOKEN 鉴权）-----------------------------------
// 注意：放在 /api/backup/db 而非 /api/admin/backup，避免被 requireAuth 拦截
const fs = require('fs');
const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || '';
app.get('/api/backup/db', (req, res) => {
  // 鉴权
  if (!MIGRATION_TOKEN) {
    return res.status(403).json({ success: false, error: '备份功能未启用（需设置 MIGRATION_TOKEN）' });
  }
  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (auth !== MIGRATION_TOKEN) {
    return res.status(401).json({ success: false, error: '无效的备份令牌' });
  }

  try {
    if (DB_TYPE === 'sqlite') {
      const dbPath = db.name; // better-sqlite3 Database.name 返回文件路径
      if (!fs.existsSync(dbPath)) {
        return res.status(500).json({ success: false, error: '数据库文件不存在' });
      }
      const stat = fs.statSync(dbPath);
      const fileName = `zaisutong_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('X-Backup-Size', stat.size);
      res.setHeader('X-Backup-Timestamp', new Date().toISOString());
      const readStream = fs.createReadStream(dbPath);
      readStream.pipe(res);
      readStream.on('error', (err) => {
        console.error('[backup] Stream error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: '备份文件读取失败' });
        }
      });
    } else {
      // MySQL 模式：导出 SQL dump
      res.status(501).json({ success: false, error: 'MySQL 备份暂不支持，请使用控制台自动备份' });
    }
  } catch (err) {
    console.error('[backup] Error:', err.message);
    res.status(500).json({ success: false, error: '备份失败: ' + err.message });
  }
});

// P0 新路由 — 图片上传需支持 multipart，单独放开 Content-Type 限制
app.use('/api/vision', (req, res, next) => {
  // vision 路由内部使用 multer，需要跳过 JSON-only 检查
  if (req.path === '/analyze' || req.path === '/upload') return next();
  next();
}, optionalAuth, visionRouter);
app.use('/api/pricing',   optionalAuth, pricingRouter);
app.use('/api/external',  optionalAuth, externalRouter);
app.use('/api/deal-intents', optionalAuth, dealIntentsRouter);
app.use('/api/terminology',  terminologyRouter);

// 业务路由（可选认证 — 有 token 则注入 req.user，兼容未登录浏览）
app.use('/api/listings',      optionalAuth, listingsRouter);
app.use('/api/matches',       optionalAuth, matchesRouter);
app.use('/api/messages',      requireAuth, messagesRouter);
app.use('/api/notifications', requireAuth, notificationsRouter);
app.use('/api/admin',         adminRouter);     // 管理后台（内部 requireAdmin）
app.use('/api/reports',       reportsRouter);   // 公开举报提交
app.use('/api/migrate',       migrateRouter);   // 数据迁移（MIGRATION_TOKEN 鉴权）

// ---- 404 -------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.url}` });
});

// ---- Error handler ---------------------------------------------------------
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

// ---- WebSocket -------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });

// 存储 userId -> ws 映射
const wsClients = new Map();

wss.on('connection', (ws, req) => {
  // Origin 校验 — 防止跨站 WebSocket 攻击
  // WS_ALLOWED_ORIGINS=* 允许所有（测试/ngrok），正式上线改为具体域名
  const wsOriginsRaw = process.env.WS_ALLOWED_ORIGINS || 'http://localhost:3456,http://localhost:8080,http://127.0.0.1:3456';
  const wsAllowAll = wsOriginsRaw === '*';
  const allowedOrigins = wsAllowAll ? [] : wsOriginsRaw.split(',').map(s => s.trim());
  const origin = req.headers.origin || '';
  if (origin && !wsAllowAll && !allowedOrigins.includes(origin)) {
    console.warn('[WS] Rejected connection from untrusted origin:', origin);
    ws.close(4001, 'Untrusted origin');
    return;
  }

  console.log('[WS] New connection');

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // 认证消息：客户端发送 token 绑定身份
      if (data.type === 'auth') {
        const decoded = verifyToken(data.token);
        if (decoded) {
          ws.userId = decoded.userId;
          ws.userName = decoded.name;
          wsClients.set(decoded.userId, ws);
          ws.send(JSON.stringify({ type: 'auth_ok', userId: decoded.userId }));
          console.log(`[WS] User ${decoded.userId} (${decoded.name}) authenticated`);
        } else {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Token 无效或已过期' }));
        }
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
    }
  });

  ws.on('close', () => {
    if (ws.userId) {
      wsClients.delete(ws.userId);
      console.log(`[WS] User ${ws.userId} disconnected`);
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
  });
});

// 心跳检测
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      if (ws.userId) wsClients.delete(ws.userId);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// 暴露 wss 给路由使用
app.set('wss', wss);
app.set('wsClients', wsClients);

// ---- Start -----------------------------------------------------------------
server.listen(PORT, () => {
  const isProd = process.env.NODE_ENV === 'production';
  console.log(`[server] 再塑通 backend v7.0 已启动 (${isProd ? '生产' : '开发'}模式)`);
  console.log(`[server] HTTP:  http://0.0.0.0:${PORT}`);
  console.log(`[server] WS:    ws://0.0.0.0:${PORT}/ws`);
  console.log(`[server] DB:    ${DB_TYPE} | Storage: ${storage.STORAGE_TYPE}`);

  // 启动外部数据采集定时调度
  try {
    scraperManager.startScheduler(30); // 每30分钟采集一次
    console.log(`[server] Scraper scheduler started`);
  } catch (e) {
    console.warn(`[server] Scraper scheduler failed to start: ${e.message}`);
  }
});

// ---- Graceful Shutdown ------------------------------------------------------
function shutdown(signal) {
  console.log(`\n[server] Received ${signal}, shutting down gracefully...`);
  clearInterval(heartbeat);
  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });
  server.close(() => {
    console.log('[server] HTTP server closed');
    try { db.close(); console.log('[server] Database closed'); } catch (e) {}
    process.exit(0);
  });
  // 强制退出保护
  setTimeout(() => {
    console.error('[server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
