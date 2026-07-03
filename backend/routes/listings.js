const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeMatches } = require('../match_engine');
const {
  sanitizeObject,
  findSQLInjection,
  checkLengthLimits,
  MAX_PRICE,
  MAX_QUANTITY,
  VALID_LISTING_STATUSES,
} = require('../helpers');

// 常量
const VALID_TYPES = ['supply', 'demand'];
const VALID_WASTE = ['废塑料', '再生料'];
const VALID_POLES = ['first_pole', 'second_pole', 'cross_pole'];
const VALID_GRADES = ['食品级', '工业级', '普通级', ''];
const VALID_DELIVERY = ['自提', '送货', '均可', ''];
const VALID_FORMS = ['瓶砖', '瓶片', '破碎料', '打包料', '再生颗粒', '改性料', '桶', '颗粒', '膜', '片材', ''];
const VALID_CATEGORIES = ['PET', 'PP', 'PE', 'HDPE', 'LDPE', 'ABS', 'PS', 'PC', 'PA', 'POM', 'PVC', 'PA6', 'PA66', 'EPS', 'PMMA', 'EVA', 'TPU', '其他'];

// ====================== 发布新供需 ======================
router.post('/', (req, res) => {
  try {
    const {
      userId, type, wasteOrRecycled, material, form,
      quantity, price, location, notes,
      // v6.0 新字段
      pole, grade, qualitySpecs, images,
      monthlyAvailable, delivery, purpose, sourceRegion,
      priceRangeMin, priceRangeMax,
    } = req.body;

    // 必填
    if (!userId || !type || !material) {
      return res.status(400).json({ success: false, error: 'userId, type, material 为必填项' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'type 必须为 supply 或 demand' });
    }

    // wasteOrRecycled 现在允许空（通过 pole 自动推断）
    const wasteValue = wasteOrRecycled || '';

    // pole 验证
    if (pole && !VALID_POLES.includes(pole)) {
      return res.status(400).json({ success: false, error: 'pole 必须为 first_pole / second_pole / cross_pole' });
    }
    if (grade && !VALID_GRADES.includes(grade)) {
      return res.status(400).json({ success: false, error: 'grade 必须为 食品级 / 工业级 / 普通级' });
    }
    if (delivery && !VALID_DELIVERY.includes(delivery)) {
      return res.status(400).json({ success: false, error: 'delivery 必须为 自提 / 送货 / 均可' });
    }

    // 数值校验
    if (quantity !== undefined && quantity !== null && (typeof quantity !== 'number' || quantity <= 0)) {
      return res.status(400).json({ success: false, error: 'quantity 必须为正数' });
    }
    if (price !== undefined && price !== null && typeof price !== 'number') {
      return res.status(400).json({ success: false, error: 'price 必须为数字' });
    }
    if (price !== undefined && price !== null && price < 0) {
      return res.status(400).json({ success: false, error: 'price 不能为负数' });
    }

    // 安全检查
    const dangerous = findSQLInjection(req.body);
    if (dangerous) {
      return res.status(400).json({ success: false, error: '输入包含不允许的字符' });
    }
    sanitizeObject(req.body);

    const lenErr = checkLengthLimits(req.body);
    if (lenErr) {
      return res.status(400).json({ success: false, error: `${lenErr.field} 不能超过 ${lenErr.limit} 个字符` });
    }

    // 用户验证
    const user = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在' });
    }

    // 价格处理
    let finalPrice, priceNegotiable;
    if (price === null || price === undefined) {
      finalPrice = 0;
      priceNegotiable = 1;
    } else {
      finalPrice = price;
      priceNegotiable = price === 0 ? 1 : 0;
    }

    // 品质规格 JSON 处理
    const specsJson = qualitySpecs ? (typeof qualitySpecs === 'string' ? qualitySpecs : JSON.stringify(qualitySpecs)) : '{}';

    // 图片 JSON 处理
    const imagesJson = images ? (typeof images === 'string' ? images : JSON.stringify(images)) : '[]';

    const result = db.prepare(`
      INSERT INTO listings (
        user_id, type, waste_or_recycled, material, form, quantity, price, price_negotiable,
        location, notes, pole, grade, quality_specs, images,
        monthly_available, delivery, purpose, source_region,
        price_range_min, price_range_max, transaction_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      userId, type, wasteValue, material,
      form || '', quantity || 0, finalPrice, priceNegotiable,
      location || '', notes || '',
      pole || '', grade || '', specsJson, imagesJson,
      monthlyAvailable || 0, delivery || '', purpose || '', sourceRegion || '',
      priceRangeMin || 0, priceRangeMax || 0
    );

    const listing = db.prepare(`
      SELECT l.*, u.name AS user_name, u.role AS user_role, u.location AS user_location,
             u.phone, u.company, u.certifications, u.business_scope, u.capacity
      FROM listings l JOIN users u ON l.user_id = u.id WHERE l.id = ?
    `).get(result.lastInsertRowid);

    // Auto-match
    const oppositeType = type === 'supply' ? 'demand' : 'supply';
    const candidates = db.prepare(
      `SELECT * FROM listings WHERE type = ? AND status = 'active' AND id != ?`
    ).all(oppositeType, listing.id);

    let matches = [];
    if (candidates.length > 0) {
      const matchResults = computeMatches(listing, candidates, 10);
      const insertMatch = db.prepare(
        'INSERT INTO matches (supply_id, demand_id, score, dimension_scores, status) VALUES (?, ?, ?, ?, ?)'
      );
      const persist = db.transaction((items) => {
        const saved = [];
        for (const m of matchResults) {
          const dimJson = JSON.stringify(m.dimensionScores);
          const existing = db.prepare('SELECT id FROM matches WHERE supply_id = ? AND demand_id = ?').get(m.supplyId, m.demandId);
          if (!existing) {
            const r = insertMatch.run(m.supplyId, m.demandId, m.score, dimJson, 'pending');
            saved.push({ id: r.lastInsertRowid, ...m, status: 'pending' });
          } else {
            saved.push({ id: existing.id, ...m, status: 'pending' });
          }
        }
        return saved;
      });
      matches = persist(matchResults);
      notifyMatchedUsers(listing, matches);
    }

    res.status(201).json({ success: true, listing, matches });
  } catch (err) {
    console.error('[listings] create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== 查询供需列表 ======================
router.get('/', (req, res) => {
  try {
    const { type, material, location, status, userId, pole,
            category, grade, form, transactionStatus, minPrice, maxPrice, sort } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];

    if (type)              { where += ' AND l.type = ?'; params.push(type); }
    if (material)          { where += ' AND l.material LIKE ?'; params.push('%'+material+'%'); }
    if (location)          { where += ' AND l.location LIKE ?'; params.push('%'+location+'%'); }
    if (status)            { where += ' AND l.status = ?'; params.push(status); }
    if (userId)            { where += ' AND l.user_id = ?'; params.push(Number(userId)); }
    if (pole)              { where += ' AND l.pole = ?'; params.push(pole); }
    if (grade)             { where += ' AND l.grade = ?'; params.push(grade); }
    if (form)              { where += ' AND l.form = ?'; params.push(form); }
    if (transactionStatus) { where += ' AND l.transaction_status = ?'; params.push(transactionStatus); }
    if (category)          { where += ' AND (l.material LIKE ? OR l.waste_or_recycled = ?)'; params.push(category+'%', category); }
    if (minPrice)          { where += ' AND l.price >= ?'; params.push(Number(minPrice)); }
    if (maxPrice)          { where += ' AND l.price <= ?'; params.push(Number(maxPrice)); }

    // 排序
    let orderBy = 'ORDER BY l.created_at DESC';
    if (sort === 'price_asc')  orderBy = 'ORDER BY l.price ASC';
    if (sort === 'price_desc') orderBy = 'ORDER BY l.price DESC';
    if (sort === 'newest')     orderBy = 'ORDER BY l.created_at DESC';

    const countSql = `SELECT COUNT(*) AS total FROM listings l ${where}`;
    const dataSql = `SELECT l.*, u.name AS user_name, u.role AS user_role, u.location AS user_location,
      u.phone, u.company, u.certifications, u.business_scope
      FROM listings l JOIN users u ON l.user_id = u.id ${where} ${orderBy} LIMIT ? OFFSET ?`;

    const totalRow = db.prepare(countSql).get(...params);
    const listings = db.prepare(dataSql).all(...params, limit, offset);

    // Parse JSON fields for each listing
    const enriched = listings.map(l => ({
      ...l,
      quality_specs: safeParseJSON(l.quality_specs, {}),
      images: safeParseJSON(l.images, []),
    }));

    res.json({ success: true, listings: enriched, total: totalRow.total, page, limit });
  } catch (err) {
    console.error('[listings] query error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== 获取单条供需 ======================
router.get('/:id', (req, res) => {
  try {
    const listing = db.prepare(`
      SELECT l.*, u.name AS user_name, u.role AS user_role, u.location AS user_location,
        u.phone, u.company, u.email, u.avatar_url, u.certifications, u.business_scope,
        u.capacity, u.process_type, u.dual_roles, u.wechat_id
      FROM listings l JOIN users u ON l.user_id = u.id WHERE l.id = ?
    `).get(req.params.id);

    if (!listing) {
      return res.status(404).json({ success: false, error: '供需不存在' });
    }

    listing.quality_specs = safeParseJSON(listing.quality_specs, {});
    listing.images = safeParseJSON(listing.images, []);
    listing.certifications = safeParseJSON(listing.certifications, []);
    listing.dual_roles = safeParseJSON(listing.dual_roles, []);

    // 获取该用户评价统计
    const evalStats = db.prepare(`
      SELECT
        COUNT(*) as eval_count,
        ROUND(AVG(rating_quality), 1) as avg_quality,
        ROUND(AVG(rating_integrity), 1) as avg_integrity,
        ROUND(AVG(rating_speed), 1) as avg_speed
      FROM evaluations WHERE target_user_id = ?
    `).get(listing.user_id) || {};
    listing.user_rating = evalStats;

    // 获取该供需的撮合进度
    const intents = db.prepare(
      'SELECT * FROM deal_intents WHERE listing_id = ? ORDER BY created_at DESC'
    ).all(listing.id);
    listing.deal_intents = intents;

    res.json({ success: true, listing });
  } catch (err) {
    console.error('[listings] get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== 更新供需 ======================
router.patch('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '供需不存在' });
    }
    if (req.body._userId && existing.user_id !== req.body._userId) {
      return res.status(403).json({ success: false, error: '无权修改' });
    }

    // 验证
    if (req.body.status && !VALID_LISTING_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ success: false, error: `status 必须为: ${VALID_LISTING_STATUSES.join(', ')}` });
    }
    if (req.body.type && !VALID_TYPES.includes(req.body.type)) {
      return res.status(400).json({ success: false, error: 'type 必须为 supply 或 demand' });
    }
    if (req.body.pole && !VALID_POLES.includes(req.body.pole)) {
      return res.status(400).json({ success: false, error: 'pole 无效' });
    }
    if (req.body.wasteOrRecycled && !VALID_WASTE.includes(req.body.wasteOrRecycled)) {
      return res.status(400).json({ success: false, error: 'wasteOrRecycled 必须为 "废塑料" 或 "再生料"' });
    }

    sanitizeObject(req.body);
    const dangerous = findSQLInjection(req.body);
    if (dangerous) return res.status(400).json({ success: false, error: '输入包含不允许的字符' });

    const updates = [];
    const params = [];

    const fields = ['status', 'quantity', 'price', 'location', 'notes', 'material', 'form',
      'pole', 'grade', 'delivery', 'purpose', 'source_region', 'monthly_available',
      'price_range_min', 'price_range_max', 'transaction_status'];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }

    // JSON fields
    if (req.body.qualitySpecs !== undefined) {
      updates.push('quality_specs = ?');
      params.push(typeof req.body.qualitySpecs === 'string' ? req.body.qualitySpecs : JSON.stringify(req.body.qualitySpecs));
    }
    if (req.body.images !== undefined) {
      updates.push('images = ?');
      params.push(typeof req.body.images === 'string' ? req.body.images : JSON.stringify(req.body.images));
    }

    // waste_or_recycled
    if (req.body.wasteOrRecycled !== undefined) {
      updates.push('waste_or_recycled = ?');
      params.push(req.body.wasteOrRecycled);
    }

    // price_negotiable
    if (req.body.price !== undefined && req.body.price !== null) {
      updates.push('price_negotiable = ?');
      params.push(req.body.price === 0 ? 1 : 0);
    }

    if (!updates.length) {
      return res.status(400).json({ success: false, error: '没有可更新的字段' });
    }

    params.push(req.params.id);
    db.prepare(`UPDATE listings SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // 重新计算匹配
    const matchFields = ['material', 'price', 'quantity', 'location', 'form', 'pole', 'grade'];
    if (matchFields.some(f => req.body[f] !== undefined)) {
      db.prepare('DELETE FROM matches WHERE supply_id = ? OR demand_id = ?').run(req.params.id, req.params.id);
      try {
        require('../match_engine').recomputeMatchesForListing(db, parseInt(req.params.id, 10));
      } catch (e) { /* match recompute is optional */ }
    }

    const listing = db.prepare(`
      SELECT l.*, u.name AS user_name, u.role AS user_role
      FROM listings l JOIN users u ON l.user_id = u.id WHERE l.id = ?
    `).get(req.params.id);
    listing.quality_specs = safeParseJSON(listing.quality_specs, {});
    listing.images = safeParseJSON(listing.images, []);

    res.json({ success: true, listing });
  } catch (err) {
    console.error('[listings] update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== 撮合意向操作 ======================
router.post('/:id/intent', (req, res) => {
  try {
    const { userId, intentType, note, matchId } = req.body;
    if (!userId || !intentType) {
      return res.status(400).json({ success: false, error: 'userId 和 intentType 为必填' });
    }
    const validIntents = ['interested', 'negotiating', 'deal', 'completed', 'cancelled'];
    if (!validIntents.includes(intentType)) {
      return res.status(400).json({ success: false, error: `intentType 必须为: ${validIntents.join(', ')}` });
    }

    // 更新 listing 的 transaction_status
    const statusMap = { interested: 'contacted', negotiating: 'dealing', deal: 'dealing', completed: 'completed', cancelled: 'closed' };
    const newStatus = statusMap[intentType] || 'active';

    db.prepare('UPDATE listings SET transaction_status = ? WHERE id = ?').run(newStatus, req.params.id);

    // 记录意图
    const result = db.prepare(
      'INSERT INTO deal_intents (match_id, listing_id, user_id, intent_type, note) VALUES (?, ?, ?, ?, ?)'
    ).run(matchId || null, req.params.id, userId, intentType, note || '');

    const intent = db.prepare('SELECT * FROM deal_intents WHERE id = ?').get(result.lastInsertRowid);

    // 通知对方
    try {
      const listing = db.prepare('SELECT user_id, material FROM listings WHERE id = ?').get(req.params.id);
      const intentLabels = { interested: '感兴趣', negotiating: '正在洽谈', deal: '确认成交', completed: '已完成', cancelled: '已取消' };
      db.prepare(
        "INSERT INTO notifications (user_id, type, title, body, link_type, link_id) VALUES (?,'deal','撮合更新',?, 'listing', ?)"
      ).run(listing.user_id, `"${listing.material}" 状态更新：${intentLabels[intentType]}`, req.params.id);
    } catch (e) {}

    res.json({ success: true, intent });
  } catch (err) {
    console.error('[listings] intent error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 工具函数
function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

// 通知匹配用户
function notifyMatchedUsers(newListing, matches) {
  if (!matches || matches.length === 0) return;
  try {
    const insertNotif = db.prepare(
      "INSERT INTO notifications (user_id, type, title, body, link_type, link_id) VALUES (?, 'match', ?, ?, 'match', ?)"
    );
    const notified = new Set();
    const otherType = newListing.type === 'supply' ? '需求方' : '供应方';
    const listingType = newListing.type === 'supply' ? '供应' : '需求';

    for (const m of matches) {
      const otherListingId = newListing.type === 'supply' ? m.demandId : m.supplyId;
      if (!otherListingId) continue;
      const otherListing = db.prepare('SELECT user_id, material FROM listings WHERE id = ?').get(otherListingId);
      if (!otherListing || notified.has(otherListing.user_id)) continue;
      notified.add(otherListing.user_id);

      const scorePct = Math.round(typeof m.score === 'number' ? (m.score <= 1 ? m.score * 100 : m.score) : 0);
      insertNotif.run(otherListing.user_id, '新匹配提醒',
        `您的${otherType}"${otherListing.material}"与一条新${listingType}匹配度 ${scorePct}%`, m.id);
      pushNotification(otherListing.user_id, { type: 'match', title: '新匹配提醒',
        body: `${otherListing.material}: 匹配度 ${scorePct}%`, linkType: 'match', linkId: m.id });
    }
  } catch (err) { console.error('[notify] error:', err.message); }
}

function pushNotification(userId, notification) {
  try {
    const app = require('../server');
    const wsClients = app.get('wsClients');
    if (!wsClients) return;
    const ws = wsClients.get(userId);
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'new_notification', notification }));
  } catch (e) {}
}

module.exports = router;
