/**
 * Auth Routes — 注册/登录/JWT认证
 * 再塑通 RePlasMatch v5.0
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const {
  sanitizeObject,
  findSQLInjection,
  checkLengthLimits,
  validateEmail,
  validatePhone,
} = require('../helpers');

const router = express.Router();

const SALT_ROUNDS = 10;
const VALID_ROLES = ['打包站', '再生工厂', '制品·改性·色母', '贸易商'];

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
      INSERT INTO users (name, role, location, password_hash, phone, email, company)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, role, location || '', passwordHash, phone, email || '', company || '');

    const user = db.prepare('SELECT id, name, role, location, phone, email, company, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    // 签发 JWT
    const token = signToken({ userId: user.id, name: user.name, role: user.role });

    res.status(201).json({
      success: true,
      user,
      token,
    });
  } catch (err) {
    console.error('[auth] register error:', err.message);
    res.status(500).json({ success: false, error: '注册失败，请重试' });
  }
});

// ================================================================
// POST /api/auth/login — 登录
// ================================================================
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({
        success: false,
        error: '请输入用户名/手机号和密码',
      });
    }

    // 查找用户（支持用户名或手机号登录）
    const user = db.prepare('SELECT * FROM users WHERE name = ? OR phone = ?').get(name, name);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: '用户名/手机号或密码错误',
      });
    }

    // 兼容旧用户（无密码）—— 允许无密码登录但提示设置密码
    if (!user.password_hash) {
      const token = signToken({ userId: user.id, name: user.name, role: user.role, isAdmin: !!user.is_admin });
      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            role: user.role,
            location: user.location,
            phone: user.phone,
            email: user.email,
            company: user.company,
            is_admin: !!user.is_admin,
            status: user.status || 'active',
            created_at: user.created_at,
          },
          token,
        },
        warning: '请尽快设置密码以保护账号安全',
      });
    }

    // 验证密码
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: '用户名/手机号或密码错误',
      });
    }

    const token = signToken({ userId: user.id, name: user.name, role: user.role, isAdmin: !!user.is_admin });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          location: user.location,
          phone: user.phone,
          email: user.email,
          company: user.company,
          is_admin: !!user.is_admin,
          status: user.status || 'active',
          created_at: user.created_at,
        },
        token,
      },
    });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ success: false, error: '登录失败，请重试' });
  }
});

// ================================================================
// GET /api/auth/me — 获取当前用户信息
// ================================================================
router.get('/me', requireAuth, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, name, role, location, phone, email, company, avatar_url, created_at FROM users WHERE id = ?'
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
      return res.json({ success: true, user, token, devMode: true });
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

    res.json({ success: true, user, token });
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

    // 手机号格式校验
    if (phone !== undefined) {
      if (!validatePhone(phone)) {
        return res.status(400).json({ success: false, error: '手机号格式不正确' });
      }
      // 检查重复
      const phoneDup = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone, req.user.userId);
      if (phoneDup) {
        return res.status(409).json({ success: false, error: '该手机号已被其他用户使用' });
      }
      updates.push('phone = ?'); params.push(phone);
    }

    // 邮箱格式校验
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
      'SELECT id, name, role, location, phone, email, company, avatar_url, created_at FROM users WHERE id = ?'
    ).get(req.user.userId);

    res.json({ success: true, user });
  } catch (err) {
    console.error('[auth] profile error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 辅助函数：开发模式下查找或创建微信用户 ----
function findOrCreateWechatUser(openid, nickname, avatarUrl) {
  let user = db.prepare('SELECT id, name, role, location, phone, email, company, avatar_url, openid, created_at FROM users WHERE openid = ?').get(openid);
  if (user) return user;

  const result = db.prepare(
    'INSERT INTO users (name, role, location, openid, avatar_url) VALUES (?, ?, ?, ?, ?)'
  ).run(nickname, '打包站', '', openid, avatarUrl || '');
  return db.prepare('SELECT id, name, role, location, phone, email, company, avatar_url, openid, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = router;
