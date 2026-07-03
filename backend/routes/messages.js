/**
 * Messages Routes — 站内消息系统
 * 再塑通 RePlasMatch v5.0
 */

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ================================================================
// GET /api/messages/conversations — 获取会话列表
// ================================================================
router.get('/conversations', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;

    const conversations = db.prepare(`
      SELECT
        m.conversation_id,
        CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS other_user_id,
        u.name AS other_user_name,
        u.role AS other_user_role,
        u.avatar_url AS other_user_avatar,
        m.content AS last_message,
        m.created_at AS last_time,
        SUM(CASE WHEN m.receiver_id = ? AND m.is_read = 0 THEN 1 ELSE 0 END) AS unread
      FROM messages m
      JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
      WHERE m.sender_id = ? OR m.receiver_id = ?
      GROUP BY m.conversation_id
      HAVING m.created_at = MAX(m.created_at)
      ORDER BY m.created_at DESC
    `).all(userId, userId, userId, userId, userId);

    res.json({ success: true, conversations });
  } catch (err) {
    console.error('[messages] conversations error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================================
// GET /api/messages/:conversationId — 获取某个会话的消息列表
// ================================================================
router.get('/:conversationId', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;

    // 标记已读
    db.prepare(`
      UPDATE messages SET is_read = 1
      WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0
    `).run(conversationId, userId);

    const messages = db.prepare(`
      SELECT m.*, u.name AS sender_name, u.role AS sender_role
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(conversationId, limit, offset);

    const total = db.prepare(
      'SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = ?'
    ).get(conversationId).cnt;

    res.json({ success: true, messages: messages.reverse(), total, page, limit });
  } catch (err) {
    console.error('[messages] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================================
// POST /api/messages/send — 发送消息
// ================================================================
router.post('/send', requireAuth, (req, res) => {
  try {
    const senderId = req.user.userId;
    const { receiverId, content, matchId } = req.body;

    if (!receiverId || !content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'receiverId 和 content 为必填项',
      });
    }

    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        error: '不能给自己发消息',
      });
    }

    // 验证接收者存在
    const receiver = db.prepare('SELECT id FROM users WHERE id = ?').get(receiverId);
    if (!receiver) {
      return res.status(404).json({ success: false, error: '接收用户不存在' });
    }

    // 生成会话 ID（双方 userId 排序后拼接，确保唯一性）
    const ids = [senderId, receiverId].sort((a, b) => a - b);
    const conversationId = `conv_${ids[0]}_${ids[1]}`;

    const result = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, receiver_id, content)
      VALUES (?, ?, ?, ?)
    `).run(conversationId, senderId, receiverId, content.trim());

    const message = db.prepare(
      'SELECT * FROM messages WHERE id = ?'
    ).get(result.lastInsertRowid);

    // 创建通知
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, body, link_type, link_id)
      VALUES (?, 'message', '新消息', ?, 'message', ?)
    `).run(
      receiverId,
      content.trim().substring(0, 100),
      senderId,
    );

    // WebSocket 广播（如果 wss 可用）
    const wss = req.app.get('wss');
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.userId === receiverId && client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'new_message',
            message,
          }));
        }
      });
    }

    res.status(201).json({ success: true, message });
  } catch (err) {
    console.error('[messages] send error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================================
// GET /api/messages/unread/count — 获取未读消息数
// ================================================================
router.get('/unread/count', requireAuth, (req, res) => {
  try {
    const count = db.prepare(
      'SELECT COUNT(*) AS cnt FROM messages WHERE receiver_id = ? AND is_read = 0'
    ).get(req.user.userId).cnt;

    // 加上未读通知数
    const notifCount = db.prepare(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(req.user.userId).cnt;

    res.json({ success: true, unreadMessages: count, unreadNotifications: notifCount });
  } catch (err) {
    console.error('[messages] unread error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
