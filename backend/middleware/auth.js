/**
 * JWT Authentication Middleware
 * 再塑通 RePlasMatch — 生产级认证中间件
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'zaisutong_jwt_secret_2026_prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * 签发 JWT Token
 * @param {Object} payload — { userId, name, role }
 * @returns {string} signed JWT token
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证 JWT Token
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

/**
 * 强制认证中间件 — 未认证返回 401
 * 从 Authorization: Bearer <token> 头提取 token
 * 验证通过后注入 req.user = { userId, name, role }
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
  requireAuth,
  optionalAuth,
  JWT_SECRET,
  JWT_EXPIRES_IN,
};
