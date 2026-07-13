/**
 * JWT Authentication Middleware
 * 再塑通 RePlasMatch — v7.0 双 Token 认证 + 刷新
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// 密钥管理：优先使用环境变量，云托管环境自动生成（容器重启后所有 token 失效）
let JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
let REFRESH_SECRET = process.env.REFRESH_SECRET;
const REFRESH_EXPIRES_IN = '30d';

if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(64).toString('hex');
  console.warn('');
  console.warn('⚠️  JWT_SECRET 未设置，已自动生成临时密钥（容器重启后所有 token 将失效）');
  console.warn('   请在云托管控制台设置 JWT_SECRET 环境变量以持久化密钥');
  console.warn('');
}
if (!REFRESH_SECRET) {
  REFRESH_SECRET = crypto.randomBytes(64).toString('hex');
  console.warn('⚠️  REFRESH_SECRET 未设置，已自动生成临时密钥');
}

// ---- Access Token ----

/**
 * 签发 Access Token（短时效，15分钟）
 * @param {Object} payload — { userId, name, role, isAdmin }
 * @returns {string} signed JWT token
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证 Access Token
 * @param {string} token
 * @returns {Object|null} decoded payload or null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// ---- Refresh Token (database-backed) ----

/**
 * 签发 Refresh Token（30天有效，存储在数据库中以支持吊销）
 * @param {number} userId
 * @param {string} family — token family for rotation detection
 * @returns {string} refresh token
 */
function signRefreshToken(userId, family) {
  // 引入 db（延迟 require 避免循环依赖）
  const db = require('../db');

  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token, family, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, token, family, expiresAt);

  return token;
}

/**
 * 验证 Refresh Token（查DB）
 * @param {string} token
 * @returns {Object|null} { userId, family } or null
 */
function verifyRefreshToken(token) {
  const db = require('../db');
  const stored = db.prepare(
    'SELECT user_id, family FROM refresh_tokens WHERE token = ? AND revoked = 0 AND expires_at > datetime(\'now\')'
  ).get(token);

  if (!stored) return null;
  return { userId: stored.user_id, family: stored.family };
}

// ---- Auth Middleware ----

/**
 * 强制认证中间件 — 未认证返回 401
 * 从 Authorization: Bearer <token> 头提取 token
 * 验证通过后注入 req.user = { userId, name, role, isAdmin }
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: '请先登录' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
  }

  req.user = decoded;
  next();
}

/**
 * 可选认证中间件 — 有 token 就解析，没有也放行
 * 用于公开接口但需要区分登录用户的场景
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  next();
}

module.exports = {
  signToken,
  verifyToken,
  signRefreshToken,
  verifyRefreshToken,
  requireAuth,
  optionalAuth,
  JWT_SECRET,
  JWT_EXPIRES_IN,
};
