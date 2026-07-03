/**
 * Admin API Routes
 * 再塑通 RePlasMatch — 管理后台接口
 *
 * 所有接口需要 requireAuth + requireAdmin 双重认证
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin, logAudit, getClientIP } = require('../middleware/admin');

// ============================================================
// 所有 admin 路由强制管理员认证
// ============================================================
router.use(requireAuth);
router.use(requireAdmin);

// ============================================================
// 1. 仪表盘统计
// ============================================================
router.get('/dashboard', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
    const activeUsers = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE status = 'active'").get().cnt;
    const suspendedUsers = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE status = 'suspended'").get().cnt;
    const totalListings = db.prepare('SELECT COUNT(*) AS cnt FROM listings').get().cnt;
    const activeListings = db.prepare("SELECT COUNT(*) AS cnt FROM listings WHERE status = 'active'").get().cnt;
    const supplyCount = db.prepare("SELECT COUNT(*) AS cnt FROM listings WHERE type = 'supply' AND status = 'active'").get().cnt;
    const demandCount = db.prepare("SELECT COUNT(*) AS cnt FROM listings WHERE type = 'demand' AND status = 'active'").get().cnt;
    const totalMatches = db.prepare('SELECT COUNT(*) AS cnt FROM matches').get().cnt;
    const dealMatches = db.prepare("SELECT COUNT(*) AS cnt FROM matches WHERE status = 'deal'").get().cnt;
    const pendingReports = db.prepare("SELECT COUNT(*) AS cnt FROM reports WHERE status = 'pending'").get().cnt;
    const pendingReviews = db.prepare("SELECT COUNT(*) AS cnt FROM listings WHERE review_status = 'pending'").get().cnt;

    // 最近7天趋势
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dailyStats = db.prepare(`
      SELECT date(created_at) AS day,
        COUNT(*) AS new_users,
        SUM(CASE WHEN type = 'supply' THEN 1 ELSE 0 END) AS new_supplies,
        SUM(CASE WHEN type = 'demand' THEN 1 ELSE 0 END) AS new_demands
      FROM (
        SELECT created_at, NULL AS type FROM users WHERE date(created_at) >= ?
        UNION ALL
        SELECT created_at, type FROM listings WHERE date(created_at) >= ?
      )
      GROUP BY day ORDER BY day
    `).all(sevenDaysAgo, sevenDaysAgo);

    // 角色分布
    const roleDistribution = db.prepare(`
      SELECT role, COUNT(*) AS cnt FROM users WHERE status = 'active' GROUP BY role
    `).all();

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers },
        listings: { total: totalListings, active: activeListings, supply: supplyCount, demand: demandCount },
        matches: { total: totalMatches, deals: dealMatches },
        moderation: { pendingReports, pendingReviews },
        dailyStats,
        roleDistribution,
      }
    });
  } catch (err) {
    console.error('[Admin] Dashboard error:', err);
    res.status(500).json({ success: false, error: '获取仪表盘数据失败' });
  }
});

// ============================================================
// 2. 用户管理
// ============================================================

// 用户列表（分页 + 筛选）
router.get('/users', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { role, status, keyword } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (role) { where += ' AND role = ?'; params.push(role); }
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (keyword) {
      where += ' AND (name LIKE ? OR company LIKE ? OR phone LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }

    const total = db.prepare(`SELECT COUNT(*) AS cnt FROM users ${where}`).get(...params).cnt;

    const users = db.prepare(`
      SELECT u.id, u.name, u.role, u.company, u.location, u.phone,
             u.is_admin, u.status, u.created_at,
             (SELECT COUNT(*) FROM listings WHERE user_id = u.id) AS listing_count
      FROM users u
      ${where}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      success: true,
      data: {
        items: users,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (err) {
    console.error('[Admin] Users list error:', err);
    res.status(500).json({ success: false, error: '获取用户列表失败' });
  }
});

// 单个用户详情
router.get('/users/:id', (req, res) => {
  try {
    const user = db.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM listings WHERE user_id = u.id) AS listing_count,
        (SELECT COUNT(*) FROM listings WHERE user_id = u.id AND status = 'active') AS active_listings
      FROM users u WHERE u.id = ?
    `).get(req.params.id);

    if (!user) return res.status(404).json({ success: false, error: '用户不存在' });

    // 用户的发布列表
    const listings = db.prepare(`
      SELECT id, type, material, quantity, price, location, status, review_status, created_at
      FROM listings WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
    `).all(user.id);

    // 用户的举报记录
    const reports = db.prepare(`
      SELECT r.*, reporter.name AS reporter_name
      FROM reports r LEFT JOIN users reporter ON r.reporter_id = reporter.id
      WHERE r.target_type = 'user' AND r.target_id = ?
      ORDER BY r.created_at DESC
    `).all(user.id);

    res.json({
      success: true,
      data: { ...user, listings, reports }
    });
  } catch (err) {
    console.error('[Admin] User detail error:', err);
    res.status(500).json({ success: false, error: '获取用户详情失败' });
  }
});

// 封禁/解封用户
router.patch('/users/:id/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, error: '无效的状态值' });
    }

    const target = db.prepare('SELECT id, name, is_admin FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ success: false, error: '用户不存在' });
    if (target.is_admin && status === 'suspended') {
      return res.status(400).json({ success: false, error: '不能封禁管理员账号' });
    }

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, target.id);

    const action = status === 'suspended' ? 'ban_user' : 'unban_user';
    logAudit(req.adminId, action, 'user', target.id, { reason, targetName: target.name }, getClientIP(req));

    res.json({ success: true, message: status === 'suspended' ? '用户已封禁' : '用户已解封' });
  } catch (err) {
    console.error('[Admin] User status error:', err);
    res.status(500).json({ success: false, error: '操作失败' });
  }
});

// 设置/取消管理员
router.patch('/users/:id/admin', (req, res) => {
  try {
    const { is_admin } = req.body;
    if (typeof is_admin !== 'number' || ![0, 1].includes(is_admin)) {
      return res.status(400).json({ success: false, error: '无效的管理员状态' });
    }

    const target = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ success: false, error: '用户不存在' });

    // 不能取消自己的管理员权限
    if (target.id === req.adminId && is_admin === 0) {
      return res.status(400).json({ success: false, error: '不能取消自己的管理员权限' });
    }

    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(is_admin, target.id);

    const action = is_admin ? 'set_admin' : 'unset_admin';
    logAudit(req.adminId, action, 'user', target.id, { targetName: target.name }, getClientIP(req));

    res.json({ success: true, message: is_admin ? '已设为管理员' : '已取消管理员权限' });
  } catch (err) {
    console.error('[Admin] Set admin error:', err);
    res.status(500).json({ success: false, error: '操作失败' });
  }
});

// ============================================================
// 3. 内容审核
// ============================================================

// 供需列表（管理视图，含所有状态）
router.get('/listings', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { type, status, review_status, keyword } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (type) { where += ' AND l.type = ?'; params.push(type); }
    if (status) { where += ' AND l.status = ?'; params.push(status); }
    if (review_status) { where += ' AND l.review_status = ?'; params.push(review_status); }
    if (keyword) {
      where += ' AND (l.material LIKE ? OR l.notes LIKE ? OR u.name LIKE ? OR u.company LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }

    const total = db.prepare(`
      SELECT COUNT(*) AS cnt FROM listings l LEFT JOIN users u ON l.user_id = u.id ${where}
    `).get(...params).cnt;

    const listings = db.prepare(`
      SELECT l.*, u.name AS user_name, u.company AS user_company, u.role AS user_role
      FROM listings l
      LEFT JOIN users u ON l.user_id = u.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      success: true,
      data: {
        items: listings,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (err) {
    console.error('[Admin] Listings error:', err);
    res.status(500).json({ success: false, error: '获取列表失败' });
  }
});

// 审核供需
router.patch('/listings/:id/review', (req, res) => {
  try {
    const { review_status, note } = req.body;
    if (!['approved', 'rejected'].includes(review_status)) {
      return res.status(400).json({ success: false, error: '审核状态必须是 approved 或 rejected' });
    }

    const listing = db.prepare('SELECT id, material, user_id FROM listings WHERE id = ?').get(req.params.id);
    if (!listing) return res.status(404).json({ success: false, error: '供需信息不存在' });

    db.prepare(`
      UPDATE listings SET review_status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?
      WHERE id = ?
    `).run(review_status, req.adminId, note || '', listing.id);

    // 如果是驳回，同时把 listing 状态改为 closed
    if (review_status === 'rejected') {
      db.prepare("UPDATE listings SET status = 'closed' WHERE id = ?").run(listing.id);
    }

    logAudit(req.adminId, 'review_listing', 'listing', listing.id,
      { action: review_status, note, material: listing.material }, getClientIP(req));

    res.json({ success: true, message: review_status === 'approved' ? '已审核通过' : '已驳回' });
  } catch (err) {
    console.error('[Admin] Review error:', err);
    res.status(500).json({ success: false, error: '审核失败' });
  }
});

// 删除供需
router.delete('/listings/:id', (req, res) => {
  try {
    const listing = db.prepare('SELECT id, material, user_id FROM listings WHERE id = ?').get(req.params.id);
    if (!listing) return res.status(404).json({ success: false, error: '供需信息不存在' });

    db.prepare('DELETE FROM listings WHERE id = ?').run(listing.id);
    db.prepare('DELETE FROM matches WHERE supply_id = ? OR demand_id = ?').run(listing.id, listing.id);

    logAudit(req.adminId, 'delete_listing', 'listing', listing.id,
      { material: listing.material }, getClientIP(req));

    res.json({ success: true, message: '已删除' });
  } catch (err) {
    console.error('[Admin] Delete listing error:', err);
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// ============================================================
// 4. 举报管理
// ============================================================

// 举报列表
router.get('/reports', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { status, target_type } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (status) { where += ' AND r.status = ?'; params.push(status); }
    if (target_type) { where += ' AND r.target_type = ?'; params.push(target_type); }

    const total = db.prepare(`SELECT COUNT(*) AS cnt FROM reports r ${where}`).get(...params).cnt;

    const reports = db.prepare(`
      SELECT r.*,
        reporter.name AS reporter_name,
        handler.name AS handler_name,
        CASE
          WHEN r.target_type = 'listing' THEN (SELECT material FROM listings WHERE id = r.target_id)
          WHEN r.target_type = 'user' THEN (SELECT name FROM users WHERE id = r.target_id)
          ELSE ''
        END AS target_label
      FROM reports r
      LEFT JOIN users reporter ON r.reporter_id = reporter.id
      LEFT JOIN users handler ON r.handled_by = handler.id
      ${where}
      ORDER BY
        CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
        r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      success: true,
      data: {
        items: reports,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (err) {
    console.error('[Admin] Reports error:', err);
    res.status(500).json({ success: false, error: '获取举报列表失败' });
  }
});

// 处理举报
router.patch('/reports/:id', (req, res) => {
  try {
    const { status, note } = req.body;
    if (!['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, error: '处理状态必须是 resolved 或 dismissed' });
    }

    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ success: false, error: '举报不存在' });
    if (report.status !== 'pending') {
      return res.status(400).json({ success: false, error: '该举报已被处理' });
    }

    db.prepare(`
      UPDATE reports SET status = ?, handled_by = ?, handle_note = ?, handled_at = datetime('now')
      WHERE id = ?
    `).run(status, req.adminId, note || '', report.id);

    logAudit(req.adminId, 'handle_report', 'report', report.id,
      { action: status, note, targetType: report.target_type, targetId: report.target_id }, getClientIP(req));

    res.json({ success: true, message: status === 'resolved' ? '已处理' : '已驳回' });
  } catch (err) {
    console.error('[Admin] Handle report error:', err);
    res.status(500).json({ success: false, error: '处理失败' });
  }
});

// ============================================================
// 5. 操作日志
// ============================================================

router.get('/logs', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const { action, admin_id, start, end } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (action) { where += ' AND a.action = ?'; params.push(action); }
    if (admin_id) { where += ' AND a.admin_id = ?'; params.push(parseInt(admin_id)); }
    if (start) { where += ' AND a.created_at >= ?'; params.push(start); }
    if (end) { where += ' AND a.created_at <= ?'; params.push(end); }

    const total = db.prepare(`SELECT COUNT(*) AS cnt FROM audit_logs a ${where}`).get(...params).cnt;

    const logs = db.prepare(`
      SELECT a.*, u.name AS admin_name
      FROM audit_logs a
      LEFT JOIN users u ON a.admin_id = u.id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      success: true,
      data: {
        items: logs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      }
    });
  } catch (err) {
    console.error('[Admin] Logs error:', err);
    res.status(500).json({ success: false, error: '获取日志失败' });
  }
});

// 操作类型列表（用于筛选下拉）
router.get('/logs/actions', (req, res) => {
  try {
    const actions = db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action').all();
    res.json({ success: true, data: actions.map(a => a.action) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 6. 数据导出
// ============================================================
router.get('/export/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, name, role, company, location, phone, is_admin, status, created_at
      FROM users ORDER BY created_at DESC
    `).all();

    logAudit(req.adminId, 'export_data', 'user', null,
      { count: users.length, type: 'csv' }, getClientIP(req));

    // 生成 CSV
    const header = 'ID,姓名,角色,公司,地区,手机,管理员,状态,注册时间';
    const rows = users.map(u =>
      `${u.id},"${u.name}","${u.role}","${u.company || ''}","${u.location || ''}","${u.phone || ''}",${u.is_admin},"${u.status}","${u.created_at}"`
    );
    const csv = '\uFEFF' + [header, ...rows].join('\n');  // BOM for Excel Chinese support

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=users_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/export/listings', (req, res) => {
  try {
    const listings = db.prepare(`
      SELECT l.id, l.type, l.waste_or_recycled, l.material, l.form, l.quantity, l.price,
             l.location, l.specs, l.status, l.review_status, l.created_at,
             u.name AS user_name, u.company AS user_company
      FROM listings l LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC
    `).all();

    logAudit(req.adminId, 'export_data', 'listing', null,
      { count: listings.length, type: 'csv' }, getClientIP(req));

    const header = 'ID,类型,废塑料/再生料,品类,形态,数量(吨),价格(元/吨),地区,规格,状态,审核状态,发布时间,发布者,发布公司';
    const rows = listings.map(l =>
      `${l.id},"${l.type === 'supply' ? '供应' : '需求'}","${l.waste_or_recycled}","${l.material}","${l.form || ''}",${l.quantity},${l.price},"${l.location || ''}","${(l.specs || '').replace(/"/g, '""')}","${l.status}","${l.review_status || 'auto'}","${l.created_at}","${l.user_name}","${l.user_company || ''}"`
    );
    const csv = '\uFEFF' + [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=listings_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
