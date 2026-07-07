const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/users — list all users (认证后返回脱敏数据)
router.get('/', requireAuth, (req, res) => {
  try {
    const users = db.prepare(
      'SELECT id, name, role, location, company, is_admin, status, created_at, avatar_url AS avatar FROM users ORDER BY id DESC'
    ).all();
    res.json({ success: true, users });
  } catch (err) {
    console.error('[users] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:id — 单个用户（认证后返回脱敏数据）
router.get('/:id', requireAuth, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, name, role, location, company, is_admin, status, created_at, avatar_url AS avatar FROM users WHERE id = ?'
    ).get(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error('[users] get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
