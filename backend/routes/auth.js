/**
 * Auth Routes — 注册/登录/JWT认证/密码重置/短信验证/Token管理
 * 再塑通 RePlasMatch v7.0
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { signToken, verifyToken, signRefreshToken, verifyRefreshToken, requireAuth } = require('../middleware/auth');
const {
  sanitizeObject,
  findSQLInjection,
  checkLengthLimits,
  validateEmail,
  validatePhone,
} = require('../helpers');
const { sendVerificationCode } = require('../services/email');

const router = express.Router();

const SALT_ROUNDS = 10;
const VALID_ROLES = ['打包站', '再生工厂', '制品·改性·色母', '贸易商'];
const MAX_LOGIN_ATTEMPTS = 5;        // 连续失败5次
const LOCK_DURATION_MINUTES = 15;     // 锁定15分钟
const ATTEMPT_WINDOW_MINUTES = 15;    // 统计最近15分钟的尝试
const SMS_CODE_LENGTH = 6;            // 6位验证码
const SMS_EXPIRE_MINUTES = 5;        // 验证码5分钟有效
const SMS_RESEND_SECONDS = 60;       // 60秒后才能重发
const ACCESS_TOKEN_EXPIRES = '15m';  // 访问令牌15分钟
const REFRESH_TOKEN_DAYS = 30;       // 刷新令牌30天

// ================================================================
// SMS 验证码发送（开发模式：输出到日志 + 存入DB）
// ================================================================
function sendSMS(phone, code, purpose) {
  const purposeLabel = {
    register: '注册',
    reset_password: '密码重置',
    login: '登录',
    bind_phone: '绑定手机号',
  };
  const label = purposeLabel[purpose] || purpose;

  // 开发/生产模式都存储到DB
  db.prepare(`
    INSERT INTO sms_codes (phone, code, purpose, expires_at)
    VALUES (?, ?, ?, datetime('now', '+${SMS_EXPIRE_MINUTES} minutes'))
  `).run(phone, code, purpose);

  // 生产环境接入阿里云短信
  if (process.env.SMS_PROVIDER === 'aliyun' && process.env.ALIYUN_ACCESS_KEY) {
    console.log(`[SMS] 生产模式 — 发送短信到 ${phone}: 【再塑通】您的${label}验证码是 ${code}，${SMS_EXPIRE_MINUTES}分钟内有效。`);
    // TODO: 集成阿里云短信SDK
    // const AliyunSMS = require('../services/aliyun-sms');
    // await AliyunSMS.send(phone, { code, purpose: label });
    return true;
  }

  // 开发模式：打印到控制台
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log(`  📱 SMS 验证码 (${label})`);
  console.log(`  手机号: ${phone}`);
  console.log(`  验证码: ${code}`);
  console.log(`  有效期: ${SMS_EXPIRE_MINUTES} 分钟`);
  console.log('══════════════════════════════════════════════');
  console.log('');
  return true;
}

// 生成6位数字验证码
function generateSMSCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 验证短信验证码
function verifySMSCode(phone, code, purpose) {
  const record = db.prepare(`
    SELECT * FROM sms_codes
    WHERE phone = ? AND code = ? AND purpose = ? AND used = 0
    AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(phone, code, purpose);

  if (!record) return { valid: false, error: '验证码错误或已过期' };

  // 标记为已使用
  db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(record.id);
  return { valid: true };
}

// 检查短信重发间隔
function canResendSMS(phone, purpose) {
  const latest = db.prepare(`
    SELECT created_at FROM sms_codes
    WHERE phone = ? AND purpose = ? AND created_at > datetime('now', ?)
    ORDER BY created_at DESC LIMIT 1
  `).get(phone, purpose, `-${SMS_RESEND_SECONDS} seconds`);

  if (latest) {
    const elapsed = Math.floor((Date.now() - new Date(latest.created_at + 'Z').getTime()) / 1000);
    return { allowed: false, retryAfter: SMS_RESEND_SECONDS - elapsed };
  }
  return { allowed: true, retryAfter: 0 };
}

// ================================================================
// 登录频控检查
// ================================================================
function checkLoginRateLimit(identifier, type, ip) {
  const now = new Date().toISOString();

  // 1. 检查用户是否被锁定
  if (type === 'user') {
    const user = db.prepare('SELECT locked_until, failed_login_attempts FROM users WHERE (name = ? OR phone = ?)').get(identifier, identifier);
    if (user && user.locked_until) {
      const lockUntil = new Date(user.locked_until + 'Z');
      if (lockUntil > new Date()) {
        const remaining = Math.ceil((lockUntil - new Date()) / 60000);
        return { blocked: true, reason: `账号已被锁定，请${remaining}分钟后重试` };
      }
    }
  }

  // 2. 检查最近失败次数
  const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60000).toISOString();
  const failedCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM login_attempts
    WHERE identifier = ? AND attempt_type = ? AND success = 0
    AND created_at > ?
  `).get(identifier, type, windowStart);

  if (failedCount && failedCount.cnt >= MAX_LOGIN_ATTEMPTS) {
    // 锁定用户账号
    if (type === 'user') {
      const lockUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60000).toISOString();
      db.prepare('UPDATE users SET locked_until = ? WHERE name = ? OR phone = ?').run(lockUntil, identifier, identifier);
    }
    return { blocked: true, reason: `登录失败次数过多，请${LOCK_DURATION_MINUTES}分钟后再试` };
  }

  return { blocked: false };
}

function recordLoginAttempt(identifier, type, success, ip) {
  db.prepare(`
    INSERT INTO login_attempts (identifier, attempt_type, success, ip)
    VALUES (?, ?, ?, ?)
  `).run(identifier, type, success ? 1 : 0, ip || '');
}

// ================================================================
// 生成 Refresh Token（crypto随机 + 家族标识用于轮换检测）
// ================================================================
function generateRefreshTokenFamily() {
  return crypto.randomBytes(32).toString('hex');
}

// ================================================================
// POST /api/auth/register — 注册新用户（带密码）
// ================================================================
router.post('/register', async (req, res) => {
  try {
    const { name, role, location, password, phone, email, company } = req.body;

    if (!name || !role || !password || !phone) {
      return res.status(400).json({
        success: false,
        error: 'name、role、password、phone 为必填项',
      });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `role 必须为: ${VALID_ROLES.join(', ')}`,
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: '密码长度不能少于6位',
      });
    }

    // 密码强度检查（建议至少8位含数字和字母）
    if (password.length < 8) {
      console.log('[auth] Weak password detected for user:', name);
    }

    // 手机号格式校验
    if (!validatePhone(phone)) {
      return res.status(400).json({
        success: false,
        error: '手机号格式不正确，请输入11位中国大陆手机号',
      });
    }

    // 邮箱格式校验（选填）
    if (email && !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: '邮箱格式不正确',
      });
    }

    // 安全检查
    const dangerousField = findSQLInjection(req.body);
    if (dangerousField) {
      return res.status(400).json({ success: false, error: '输入包含非法字符' });
    }
    sanitizeObject(req.body);

    const lengthErr = checkLengthLimits(req.body);
    if (lengthErr) {
      return res.status(400).json({
        success: false,
        error: `${lengthErr.field} 不能超过 ${lengthErr.limit} 个字符`,
      });
    }

    // 检查是否已注册（按 name 去重）
    const existing = db.prepare('SELECT id FROM users WHERE name = ?').get(name);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: '该用户名已被注册',
      });
    }

    // 检查手机号是否已注册
    const phoneExisting = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (phoneExisting) {
      return res.status(409).json({
        success: false,
        error: '该手机号已被注册',
      });
    }

    // 哈希密码
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = db.prepare(`
      INSERT INTO users (name, role, location, password_hash, phone, email, company, phone_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(name, role, location || '', passwordHash, phone, email || '', company || '');

    const user = db.prepare(
      'SELECT id, name, role, location, phone, email, company, phone_verified, created_at FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);

    // 签发 JWT（短时效） + Refresh Token
    const token = signToken({ userId: user.id, name: user.name, role: user.role });
    const family = generateRefreshTokenFamily();
    const refreshToken = signRefreshToken(user.id, family);

    res.status(201).json({
      success: true,
      user,
      token,
      refreshToken,
      expiresIn: 900, // 15分钟
    });
  } catch (err) {
    console.error('[auth] register error:', err.message);
    res.status(500).json({ success: false, error: '注册失败，请重试' });
  }
});

// ================================================================
// POST /api/auth/login — 登录（增强：频控 + 刷新令牌 + 最后登录）
// ================================================================
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || '';

    if (!name || !password) {
      return res.status(400).json({
        success: false,
        error: '请输入用户名/手机号和密码',
      });
    }

    // 频控检查 — 按用户名
    const rateCheck = checkLoginRateLimit(name, 'user', clientIp);
    if (rateCheck.blocked) {
      return res.status(429).json({ success: false, error: rateCheck.reason });
    }

    // 查找用户（支持用户名或手机号登录）
    const user = db.prepare('SELECT * FROM users WHERE name = ? OR phone = ?').get(name, name);
    if (!user) {
      recordLoginAttempt(name, 'user', false, clientIp);
      return res.status(401).json({
        success: false,
        error: '用户名/手机号或密码错误',
      });
    }

    // 检查用户状态
    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: '账号已被暂停使用，请联系管理员',
      });
    }

    // 兼容旧用户（无密码）—— 允许无密码登录但提示设置密码
    if (!user.password_hash) {
      recordLoginAttempt(name, 'user', true, clientIp);
      db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime(\'now\') WHERE id = ?').run(user.id);
      const token = signToken({ userId: user.id, name: user.name, role: user.role, isAdmin: !!user.is_admin });
      const family = generateRefreshTokenFamily();
      const refreshToken = signRefreshToken(user.id, family);
      return res.json({
        success: true,
        data: {
          user: sanitizeUser(user),
          token,
          refreshToken,
          expiresIn: 900,
        },
        warning: '请尽快设置密码以保护账号安全',
      });
    }

    // 验证密码
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      recordLoginAttempt(name, 'user', false, clientIp);

      // 递增失败次数
      const newFails = (user.failed_login_attempts || 0) + 1;
      db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(newFails, user.id);

      const remaining = MAX_LOGIN_ATTEMPTS - newFails;
      const remainMsg = remaining > 0 ? `，还剩${remaining}次机会` : '，账号已锁定15分钟';

      return res.status(401).json({
        success: false,
        error: `用户名/手机号或密码错误${remainMsg}`,
      });
    }

    // 登录成功 — 清空失败计数 + 更新最后登录时间
    recordLoginAttempt(name, 'user', true, clientIp);
    db.prepare(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime(\'now\') WHERE id = ?'
    ).run(user.id);

    const token = signToken({ userId: user.id, name: user.name, role: user.role, isAdmin: !!user.is_admin });
    const family = generateRefreshTokenFamily();
    const refreshToken = signRefreshToken(user.id, family);

    res.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        token,
        refreshToken,
        expiresIn: 900, // 15分钟
      },
    });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ success: false, error: '登录失败，请重试' });
  }
});

// ================================================================
// POST /api/auth/refresh — 刷新 Access Token
// ================================================================
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: '缺少 refreshToken' });
    }

    const stored = db.prepare(
      'SELECT * FROM refresh_tokens WHERE token = ? AND revoked = 0 AND expires_at > datetime(\'now\')'
    ).get(refreshToken);

    if (!stored) {
      return res.status(401).json({ success: false, error: 'Refresh token 无效或已过期，请重新登录' });
    }

    // Token 轮换：撤销旧的 family，签发新 family
    // 如果某个 family 中已有被撤销的 token（可能是被盗用），则撤销整个 family
    const revokedInFamily = db.prepare(
      'SELECT COUNT(*) as cnt FROM refresh_tokens WHERE family = ? AND revoked = 1'
    ).get(stored.family);

    if (revokedInFamily && revokedInFamily.cnt > 0) {
      // 检测到 token 被盗用，吊销该家族所有 token，强制重新登录
      db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE family = ?').run(stored.family);
      return res.status(401).json({ success: false, error: '检测到安全风险，请重新登录' });
    }

    // 吊销当前 token
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(stored.id);

    // 签发新 token（同一 family）
    const user = db.prepare('SELECT id, name, role, is_admin FROM users WHERE id = ?').get(stored.user_id);
    if (!user) {
      return res.status(401).json({ success: false, error: '用户不存在' });
    }

    const newToken = signToken({ userId: user.id, name: user.name, role: user.role, isAdmin: !!user.is_admin });
    const newRefreshToken = signRefreshToken(user.id, stored.family);

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    });
  } catch (err) {
    console.error('[auth] refresh error:', err.message);
    res.status(500).json({ success: false, error: '刷新失败，请重试' });
  }
});

// ================================================================
// POST /api/auth/logout — 登出（吊销 Refresh Token）
// ================================================================
router.post('/logout', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      // 吊销该 token（以及同 family 的所有 token，防止 token 残留）
      const stored = db.prepare('SELECT family FROM refresh_tokens WHERE token = ?').get(refreshToken);
      if (stored) {
        db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE family = ?').run(stored.family);
      }
    }
    res.json({ success: true, message: '已退出登录' });
  } catch (err) {
    console.error('[auth] logout error:', err.message);
    res.status(500).json({ success: false, error: '退出失败' });
  }
});

// ================================================================
// POST /api/auth/send-sms — 发送短信验证码
// ================================================================
router.post('/send-sms', (req, res) => {
  try {
    const { phone, purpose } = req.body;

    if (!phone || !purpose) {
      return res.status(400).json({ success: false, error: 'phone 和 purpose 为必填项' });
    }

    if (!['register', 'reset_password', 'login', 'bind_phone'].includes(purpose)) {
      return res.status(400).json({ success: false, error: '无效的 purpose' });
    }

    if (!validatePhone(phone)) {
      return res.status(400).json({ success: false, error: '手机号格式不正确' });
    }

    // 检查重发间隔
    const resendCheck = canResendSMS(phone, purpose);
    if (!resendCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `发送过于频繁，请${resendCheck.retryAfter}秒后再试`,
        retryAfter: resendCheck.retryAfter,
      });
    }

    // 注册场景检查手机号是否已注册
    if (purpose === 'register') {
      const phoneExisting = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
      if (phoneExisting) {
        return res.status(409).json({ success: false, error: '该手机号已被注册' });
      }
    }

    // 密码重置场景检查手机号是否存在
    if (purpose === 'reset_password') {
      const phoneExisting = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
      if (!phoneExisting) {
        // 不暴露手机号是否已注册，统一返回成功
        return res.json({ success: true, message: '验证码已发送', retryAfter: SMS_RESEND_SECONDS });
      }
    }

    // 生成并发送验证码
    const code = generateSMSCode();
    sendSMS(phone, code, purpose);

    res.json({
      success: true,
      message: '验证码已发送',
      retryAfter: SMS_RESEND_SECONDS,
      // 开发模式下返回验证码（仅非生产环境）
      ...(process.env.NODE_ENV !== 'production' && { devCode: code }),
    });
  } catch (err) {
    console.error('[auth] send-sms error:', err.message);
    res.status(500).json({ success: false, error: '发送失败，请重试' });
  }
});

// ================================================================
// POST /api/auth/forgot-password — 忘记密码（发送邮箱验证码）
// ================================================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: '请输入手机号' });
    }

    if (!validatePhone(phone)) {
      return res.status(400).json({ success: false, error: '手机号格式不正确' });
    }

    // 查找用户及其绑定邮箱
    const user = db.prepare('SELECT id, email FROM users WHERE phone = ?').get(phone);

    // 安全：无论用户是否存在，统一返回相同提示
    const genericMsg = '如果该手机号已注册且绑定了邮箱，验证码将发送到您的注册邮箱';

    if (!user || !user.email) {
      return res.json({ success: true, message: genericMsg, retryAfter: SMS_RESEND_SECONDS });
    }

    // 检查重发间隔
    const resendCheck = canResendSMS(phone, 'reset_password');
    if (!resendCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `发送过于频繁，请${resendCheck.retryAfter}秒后再试`,
        retryAfter: resendCheck.retryAfter,
      });
    }

    const code = generateSMSCode();

    // 验证码存入DB
    db.prepare(`
      INSERT INTO sms_codes (phone, code, purpose, expires_at)
      VALUES (?, ?, 'reset_password', datetime('now', '+${SMS_EXPIRE_MINUTES} minutes'))
    `).run(phone, code);

    // 发送邮件
    try {
      await sendVerificationCode(user.email, code, 'reset_password');
      console.log(`[auth] 密码重置验证码已发送到 ${user.email}`);
    } catch (emailErr) {
      console.error('[auth] 邮件发送失败:', emailErr.message);
      return res.status(500).json({ success: false, error: '邮件发送失败，请稍后重试' });
    }

    res.json({
      success: true,
      message: '验证码已发送到您的注册邮箱',
      retryAfter: SMS_RESEND_SECONDS,
      ...(process.env.NODE_ENV !== 'production' && { devCode: code }),
    });
  } catch (err) {
    console.error('[auth] forgot-password error:', err.message);
    res.status(500).json({ success: false, error: '发送失败，请重试' });
  }
});

// ================================================================
// POST /api/auth/verify-reset-code — 验证重置密码的短信验证码
// ================================================================
router.post('/verify-reset-code', (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ success: false, error: 'phone 和 code 为必填项' });
    }

    const verify = verifySMSCode(phone, code, 'reset_password');
    if (!verify.valid) {
      return res.status(400).json({ success: false, error: verify.error });
    }

    // 生成一次性重置令牌（10分钟有效）
    const resetToken = crypto.randomBytes(32).toString('hex');
    db.prepare(`
      INSERT INTO sms_codes (phone, code, purpose, expires_at)
      VALUES (?, ?, 'reset_password', datetime('now', '+10 minutes'))
    `).run(phone, resetToken);

    res.json({
      success: true,
      message: '验证通过',
      resetToken,
    });
  } catch (err) {
    console.error('[auth] verify-reset-code error:', err.message);
    res.status(500).json({ success: false, error: '验证失败，请重试' });
  }
});

// ================================================================
// POST /api/auth/reset-password — 重置密码
// ================================================================
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, resetToken, newPassword } = req.body;

    if (!phone || !resetToken || !newPassword) {
      return res.status(400).json({ success: false, error: 'phone、resetToken、newPassword 为必填项' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: '新密码长度不能少于6位' });
    }

    // 验证重置令牌
    const resetRecord = db.prepare(`
      SELECT * FROM sms_codes
      WHERE phone = ? AND code = ? AND purpose = 'reset_password'
      AND used = 0 AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(phone, resetToken);

    if (!resetRecord) {
      return res.status(400).json({ success: false, error: '重置令牌无效或已过期' });
    }

    // 标记重置令牌为已使用
    db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(resetRecord.id);

    // 更新密码
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE phone = ?').run(passwordHash, phone);

    // 吊销该用户所有 refresh token（安全措施）
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = (SELECT id FROM users WHERE phone = ?)').run(phone);

    res.json({ success: true, message: '密码重置成功，请使用新密码登录' });
  } catch (err) {
    console.error('[auth] reset-password error:', err.message);
    res.status(500).json({ success: false, error: '重置失败，请重试' });
  }
});

// ================================================================
// GET /api/auth/me — 获取当前用户信息
// ================================================================
router.get('/me', requireAuth, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, name, role, location, phone, email, company, avatar_url, phone_verified, email_verified, last_login_at, created_at FROM users WHERE id = ?'
    ).get(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('[auth] me error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================================
// PATCH /api/auth/password — 修改密码
// ================================================================
router.patch('/password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, error: '请提供旧密码和新密码' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: '新密码长度不能少于6位' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.userId);

    if (user.password_hash) {
      const valid = await bcrypt.compare(oldPassword, user.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: '旧密码错误' });
      }
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.userId);

    res.json({ success: true, message: '密码修改成功' });
  } catch (err) {
    console.error('[auth] password error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================================
// POST /api/auth/wechat-login — 微信小程序登录
// 接收 wx.login() 返回的 code，换取 openid，创建/查找用户，返回 JWT
// ================================================================
router.post('/wechat-login', async (req, res) => {
  try {
    const { code, nickname, avatarUrl } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: '缺少微信登录 code' });
    }

    const appId = process.env.WX_APPID;
    const appSecret = process.env.WX_APPSECRET;

    if (!appId || !appSecret) {
      console.warn('[auth] 微信小程序 AppID/AppSecret 未配置，使用开发模式');
      // 开发模式：使用 code 的前8位作为 openid
      const devOpenid = 'dev_' + code.substring(0, 8);
      const user = findOrCreateWechatUser(devOpenid, nickname || '微信用户', avatarUrl || '');
      const token = signToken({ userId: user.id, name: user.name, role: user.role });
      const family = generateRefreshTokenFamily();
      const refreshToken = signRefreshToken(user.id, family);
      return res.json({ success: true, user, token, refreshToken, expiresIn: 900, devMode: true });
    }

    // 调用微信接口换取 openid
    const https = require('https');
    const wechatResult = await new Promise((resolve, reject) => {
      const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;
      https.get(url, (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      }).on('error', (err) => { reject(err); });
    });

    if (wechatResult.errcode) {
      console.error('[auth] 微信登录失败:', wechatResult);
      return res.status(400).json({
        success: false,
        error: `微信登录失败: ${wechatResult.errmsg || '未知错误'}`,
      });
    }

    const { openid, unionid } = wechatResult;

    // 查找或创建用户
    let user = db.prepare('SELECT id, name, role, location, phone, email, company, avatar_url, openid, created_at FROM users WHERE openid = ?').get(openid);

    if (!user && unionid) {
      user = db.prepare('SELECT id, name, role, location, phone, email, company, avatar_url, openid, created_at FROM users WHERE unionid = ?').get(unionid);
    }

    if (user) {
      // 已有用户：更新昵称头像（如果传入）
      if (nickname || avatarUrl) {
        const updates = [];
        const params = [];
        if (nickname) { updates.push('name = ?'); params.push(nickname); }
        if (avatarUrl) { updates.push('avatar_url = ?'); params.push(avatarUrl); }
        if (unionid && !user.unionid) { updates.push('unionid = ?'); params.push(unionid); }
        if (updates.length > 0) {
          params.push(user.id);
          db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
          user = db.prepare('SELECT id, name, role, location, phone, email, company, avatar_url, openid, created_at FROM users WHERE id = ?').get(user.id);
        }
      }
    } else {
      // 新用户
      const userName = nickname || '微信用户';
      const result = db.prepare(
        'INSERT INTO users (name, role, location, openid, unionid, avatar_url) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(userName, '打包站', '', openid, unionid || '', avatarUrl || '');
      user = db.prepare('SELECT id, name, role, location, phone, email, company, avatar_url, openid, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    const token = signToken({ userId: user.id, name: user.name, role: user.role });
    const family = generateRefreshTokenFamily();
    const refreshToken = signRefreshToken(user.id, family);

    res.json({ success: true, user, token, refreshToken, expiresIn: 900 });
  } catch (err) {
    console.error('[auth] wechat-login error:', err.message);
    res.status(500).json({ success: false, error: '微信登录失败，请重试' });
  }
});

// ================================================================
// PATCH /api/auth/profile — 更新个人信息
// ================================================================
router.patch('/profile', requireAuth, (req, res) => {
  try {
    const { location, phone, email, company } = req.body;

    const updates = [];
    const params = [];

    if (phone !== undefined) {
      if (!validatePhone(phone)) {
        return res.status(400).json({ success: false, error: '手机号格式不正确' });
      }
      const phoneDup = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone, req.user.userId);
      if (phoneDup) {
        return res.status(409).json({ success: false, error: '该手机号已被其他用户使用' });
      }
      updates.push('phone = ?'); params.push(phone);
    }

    if (email !== undefined) {
      if (email && !validateEmail(email)) {
        return res.status(400).json({ success: false, error: '邮箱格式不正确' });
      }
      updates.push('email = ?'); params.push(email);
    }

    if (location !== undefined) { updates.push('location = ?'); params.push(location); }
    if (company !== undefined) { updates.push('company = ?'); params.push(company); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: '没有可更新的字段' });
    }

    params.push(req.user.userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare(
      'SELECT id, name, role, location, phone, email, company, avatar_url, phone_verified, email_verified, created_at FROM users WHERE id = ?'
    ).get(req.user.userId);

    res.json({ success: true, user });
  } catch (err) {
    console.error('[auth] profile error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 辅助函数 ----

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    location: user.location,
    phone: user.phone,
    email: user.email,
    company: user.company,
    avatar_url: user.avatar_url,
    is_admin: !!user.is_admin,
    status: user.status || 'active',
    phone_verified: !!user.phone_verified,
    email_verified: !!user.email_verified,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
  };
}

function findOrCreateWechatUser(openid, nickname, avatarUrl) {
  let user = db.prepare('SELECT id, name, role, location, phone, email, company, avatar_url, openid, created_at FROM users WHERE openid = ?').get(openid);
  if (user) return user;

  const result = db.prepare(
    'INSERT INTO users (name, role, location, openid, avatar_url) VALUES (?, ?, ?, ?, ?)'
  ).run(nickname, '打包站', '', openid, avatarUrl || '');
  return db.prepare('SELECT id, name, role, location, phone, email, company, avatar_url, openid, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = router;
