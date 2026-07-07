/**
 * 交易意向 & 流程追踪 (deal-intents)
 *
 * GET    /api/deal-intents              — 我的交易列表（支持 status 筛选）
 * GET    /api/deal-intents/:id          — 交易详情
 * POST   /api/deal-intents              — 发起交易意向（从匹配）
 * PATCH  /api/deal-intents/:id          — 更新交易状态/协商价格
 * GET    /api/deal-intents/stats        — 交易统计数据
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth, requireAuth } = require('../middleware/auth');

// 表结构及迁移逻辑已统一移至 db.js，此处不再重复定义

const VALID_STATUSES = ['intent', 'negotiating', 'deal', 'completed', 'cancelled'];

// ---- GET /api/deal-intents — 我的交易列表 ----
router.get('/', optionalAuth, (req, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const status = req.query.status || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (userId) {
      where += ' AND (d.initiator_id = ? OR d.counterparty_id = ?)';
      params.push(userId, userId);
    }
    if (status && VALID_STATUSES.includes(status)) {
      where += ' AND d.status = ?';
      params.push(status);
    }

    const countSql = `SELECT count(*) as total FROM deal_intents d ${where}`;
    const total = db.prepare(countSql).get(...params).total;

    const sql = `
      SELECT
        d.*,
        s.material AS supply_material, s.location AS supply_location, s.price AS supply_price, s.quantity AS supply_quantity, s.type AS supply_type,
        dm.material AS demand_material, dm.location AS demand_location, dm.price AS demand_price, dm.quantity AS demand_quantity,
        u.name AS initiator_name, u.role AS initiator_role,
        v.name AS counterparty_name, v.role AS counterparty_role,
        m.score AS match_score
      FROM deal_intents d
      LEFT JOIN listings s ON d.supply_id = s.id
      LEFT JOIN listings dm ON d.demand_id = dm.id
      LEFT JOIN users u ON d.initiator_id = u.id
      LEFT JOIN users v ON d.counterparty_id = v.id
      LEFT JOIN matches m ON d.match_id = m.id
      ${where}
      ORDER BY d.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const deals = db.prepare(sql).all(...params, limit, offset);

    res.json({ success: true, deals, total, page, limit });
  } catch (err) {
    console.error('[DealIntents] List error:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ---- GET /api/deal-intents/stats — 统计 ----
router.get('/stats', optionalAuth, (req, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    let params = [];
    let where = '';
    if (userId) {
      where = 'WHERE initiator_id = ? OR counterparty_id = ?';
      params = [userId, userId];
    }

    const total = db.prepare(`SELECT count(*) c FROM deal_intents ${where}`).get(...params).c;
    const byStatus = db.prepare(`
      SELECT status, count(*) c FROM deal_intents ${where} GROUP BY status
    `).all(...params);

    res.json({
      success: true,
      stats: { total, byStatus: byStatus.reduce((a, r) => { a[r.status] = r.c; return a; }, {}) }
    });
  } catch (err) {
    console.error('[DealIntents] Stats error:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ---- GET /api/deal-intents/:id — 详情 ----
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const deal = db.prepare(`
      SELECT
        d.*,
        s.material AS supply_material, s.location AS supply_location, s.price AS supply_price, s.quantity AS supply_quantity,
        dm.material AS demand_material, dm.location AS demand_location, dm.price AS demand_price, dm.quantity AS demand_quantity,
        u.name AS initiator_name, u.role AS initiator_role,
        v.name AS counterparty_name, v.role AS counterparty_role,
        m.score AS match_score, m.dimension_scores
      FROM deal_intents d
      LEFT JOIN listings s ON d.supply_id = s.id
      LEFT JOIN listings dm ON d.demand_id = dm.id
      LEFT JOIN users u ON d.initiator_id = u.id
      LEFT JOIN users v ON d.counterparty_id = v.id
      LEFT JOIN matches m ON d.match_id = m.id
      WHERE d.id = ?
    `).get(req.params.id);

    if (!deal) return res.status(404).json({ success: false, error: '交易不存在' });

    res.json({ success: true, deal });
  } catch (err) {
    console.error('[DealIntents] Detail error:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ---- POST /api/deal-intents — 发起交易意向 ----
router.post('/', requireAuth, (req, res) => {
  try {
    const { match_id, note } = req.body;
    if (!match_id) return res.status(400).json({ success: false, error: 'match_id 为必填' });

    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
    if (!match) return res.status(404).json({ success: false, error: '匹配不存在' });

    // 检查是否已有活跃交易
    const existing = db.prepare(
      "SELECT id FROM deal_intents WHERE match_id = ? AND status NOT IN ('cancelled','completed')"
    ).get(match_id);
    if (existing) return res.status(409).json({ success: false, error: '该匹配已有进行中的交易' });

    const supply = db.prepare('SELECT user_id FROM listings WHERE id = ?').get(match.supply_id);
    const demand = db.prepare('SELECT user_id FROM listings WHERE id = ?').get(match.demand_id);

    const initiatorId = req.user.userId;
    const counterpartyId = (initiatorId === supply?.user_id) ? demand?.user_id : supply?.user_id;

    const stmt = db.prepare(`
      INSERT INTO deal_intents (match_id, supply_id, demand_id, initiator_id, counterparty_id, status, note)
      VALUES (?, ?, ?, ?, ?, 'intent', ?)
    `);
    const result = stmt.run(match_id, match.supply_id, match.demand_id, initiatorId, counterpartyId, note || '');

    // 创建通知
    if (counterpartyId) {
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, body, link_type, link_id)
        VALUES (?, 'deal', '新交易意向', ?, 'deal', ?)
      `).run(counterpartyId, `${req.user.name || '对方'} 发起了交易意向，请查看并回复`, result.lastInsertRowid);
    }

    res.json({ success: true, dealId: result.lastInsertRowid });
  } catch (err) {
    console.error('[DealIntents] Create error:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ---- PATCH /api/deal-intents/:id — 更新交易状态 ----
router.patch('/:id', requireAuth, (req, res) => {
  try {
    const deal = db.prepare('SELECT * FROM deal_intents WHERE id = ?').get(req.params.id);
    if (!deal) return res.status(404).json({ success: false, error: '交易不存在' });

    const { status, price_agreed, quantity_agreed, delivery_date, note, status_note } = req.body;

    // 校验状态流转合法性
    const ALLOWED_TRANSITIONS = {
      'intent': ['negotiating', 'cancelled'],
      'negotiating': ['deal', 'cancelled', 'intent'],
      'deal': ['completed', 'cancelled'],
      'cancelled': [],       // 已取消不可恢复
      'completed': [],       // 已完成不可恢复
    };

    if (status && (!ALLOWED_TRANSITIONS[deal.status] || !ALLOWED_TRANSITIONS[deal.status].includes(status))) {
      return res.status(400).json({
        success: false,
        error: `不允许从「${deal.status}」变更为「${status}」`
      });
    }

    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (price_agreed !== undefined) { updates.push('price_agreed = ?'); params.push(price_agreed); }
    if (quantity_agreed !== undefined) { updates.push('quantity_agreed = ?'); params.push(quantity_agreed); }
    if (delivery_date !== undefined) { updates.push('delivery_date = ?'); params.push(delivery_date); }
    if (note !== undefined) { updates.push('note = ?'); params.push(note); }
    if (status_note !== undefined) { updates.push('status_note = ?'); params.push(status_note); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: '无更新内容' });

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE deal_intents SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // 通知对方
    const counterpartyId = (req.user.userId === deal.initiator_id) ? deal.counterparty_id : deal.initiator_id;
    if (status && counterpartyId) {
      const statusLabels = { intent: '意向确认', negotiating: '洽谈中', deal: '已成交', completed: '已完成', cancelled: '已取消' };
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, body, link_type, link_id)
        VALUES (?, 'deal', '交易状态更新', ?, 'deal', ?)
      `).run(counterpartyId, `交易已更新为「${statusLabels[status] || status}」`, req.params.id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[DealIntents] Update error:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

module.exports = router;
