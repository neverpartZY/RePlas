/**
 * 公开举报接口 — 用户提交举报（需登录，无需管理员权限）
 * 再塑通 RePlasMatch v5.1
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// POST /api/reports — 提交举报
router.post('/', requireAuth, (req, res) => {
  try {
    const { target_type, target_id, reason, detail } = req.body;
    if (!target_type || !target_id || !reason) {
      return res.status(400).json({ success: false, error: 'target_type, target_id, reason 为必填项' });
    }
    if (!['listing', 'user', 'message'].includes(target_type)) {
      return res.status(400).json({ success: false, error: 'target_type 无效' });
    }

    // 检查目标是否存在
    if (target_type === 'listing') {
      const listing = db.prepare('SELECT id FROM listings WHERE id = ?').get(target_id);
      if (!listing) return res.status(404).json({ success: false, error: '供需信息不存在' });
    } else if (target_type === 'user') {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(target_id);
      if (!user) return res.status(404).json({ success: false, error: '用户不存在' });
    }

    // 防止重复举报
    const existing = db.prepare(
      "SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'"
    ).get(req.user.userId, target_type, target_id);
    if (existing) {
      return res.status(400).json({ success: false, error: '您已举报过该内容，请等待处理' });
    }

    const result = db.prepare(
      'INSERT INTO reports (reporter_id, target_type, target_id, reason, detail) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.userId, target_type, target_id, reason, detail || '');

    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    console.error('[Reports] Submit error:', err);
    res.status(500).json({ success: false, error: '举报提交失败' });
  }
});

module.exports = router;
