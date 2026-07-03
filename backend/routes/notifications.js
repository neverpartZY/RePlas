/**
 * Notifications Routes — 通知系统
 * 再塑通 RePlasMatch v5.0
 */

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ================================================================
// GET /api/notifications — 获取通知列表
// ================================================================
router.get('/', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;

    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset);

    const total = db.prepare(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ?'
    ).get(userId).cnt;

    const unread = db.prepare(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(userId).cnt;

    res.json({ success: true, notifications, total, unread, page, limit });
  } catch (err) {
    console.error('[notifications] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================================
// PATCH /api/notifications/:id/read — 标记已读
// ================================================================
router.patch('/:id/read', requireAuth, (req, res) => {
  try {
    const notif = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.userId);

    if (!notif) {
      return res.status(404).json({ success: false, error: '通知不存在' });
    }

    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('[notifications] read error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================================
// PATCH /api/notifications/read-all — 全部标记已读
// ================================================================
router.patch('/read-all', requireAuth, (req, res) => {
  try {
    db.prepare(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'
    ).run(req.user.userId);

    res.json({ success: true });
  } catch (err) {
    console.error('[notifications] readAll error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
