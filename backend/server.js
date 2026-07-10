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
const db = require('./db');

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
  if (req.path.startsWith('/uploads/')) return next();
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('application/json')) {
      return res.status(415).json({ success: false, error: 'Content-Type 必须为 application/json' });
    }
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

// Static file serving for uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.use('/api/health',    (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
  console.log(`[server] 再塑通 backend v5.0 已启动 (${isProd ? '生产' : '开发'}模式)`);
  console.log(`[server] HTTP:  http://0.0.0.0:${PORT}`);
  console.log(`[server] WS:    ws://0.0.0.0:${PORT}/ws`);
  console.log('[server] DB:    ./data/zaisutong.db');

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
