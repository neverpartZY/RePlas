/**
 * Admin Authorization Middleware
 * 再塑通 RePlasMatch — 管理员权限中间件
 *
 * 依赖 requireAuth 先执行，req.user 已就绪
 * 然后检查用户是否为管理员
 */

const db = require('../db');

/**
 * 强制管理员认证中间件
 * 必须在 requireAuth 之后使用
 * 检查当前用户的 is_admin 字段
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ success: false, error: '请先登录' });
  }

  const user = db.prepare('SELECT id, is_admin, status FROM users WHERE id = ?').get(req.user.userId);

  if (!user) {
    return res.status(401).json({ success: false, error: '用户不存在' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ success: false, error: '账号已被冻结' });
  }

  if (!user.is_admin) {
    return res.status(403).json({ success: false, error: '无管理员权限' });
  }

  // Store admin info for later use
  req.adminId = user.id;
  next();
}

/**
 * 记录操作日志
 * @param {number} adminId - 管理员ID
 * @param {string} action - 操作类型
 * @param {string} targetType - 目标类型
 * @param {number} targetId - 目标ID
 * @param {object} detail - 操作详情
 * @param {string} ip - 操作IP
 */
function logAudit(adminId, action, targetType, targetId, detail, ip) {
  try {
    db.prepare(
      'INSERT INTO audit_logs (admin_id, action, target_type, target_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(adminId, action, targetType || '', targetId || null, JSON.stringify(detail || {}), ip || '');
  } catch (e) {
    console.error('[AuditLog] Failed to write:', e.message);
  }
}

/**
 * 获取用户IP
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || req.socket?.remoteAddress
    || '';
}

module.exports = { requireAdmin, logAudit, getClientIP };
