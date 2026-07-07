/**
 * 企业名片 API — 企业档案 + 样本墙 + 评价
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

function safeJSON(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

// ====================== 企业名片：档案查看 ======================
router.get('/profile/:userId?', (req, res) => {
  try {
    const userId = req.params.userId || req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId 必填' });

    const user = db.prepare(`
      SELECT id, name, role, location, phone, email, company, avatar_url,
        dual_roles, capacity, process_type, certifications, business_scope,
        established_year, employee_count, wechat_id
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) return res.status(404).json({ success: false, error: '用户不存在' });

    user.dual_roles = safeJSON(user.dual_roles, []);
    user.certifications = safeJSON(user.certifications, []);

    // 产品样本
    const samples = db.prepare(
      'SELECT * FROM enterprise_samples WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 20'
    ).all(userId, 'active');
    samples.forEach(s => { s.spec_image_urls = safeJSON(s.spec_image_urls, []); s.spec_card = safeJSON(s.spec_card, {}); });

    // 评价统计
    const evals = db.prepare(`
      SELECT COUNT(*) as total,
        ROUND(AVG(CAST(rating_quality AS REAL)), 1) as avg_quality,
        ROUND(AVG(CAST(rating_integrity AS REAL)), 1) as avg_integrity,
        ROUND(AVG(CAST(rating_speed AS REAL)), 1) as avg_speed
      FROM evaluations WHERE target_user_id = ?
    `).get(userId);

    res.json({ success: true, profile: { ...user, samples, evaluation: evals } });
  } catch (err) {
    console.error('[enterprise] profile error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== 更新企业档案 ======================
router.patch('/profile', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { capacity, processType, certifications, businessScope,
            establishedYear, employeeCount, wechatId, company, location } = req.body;

    const updates = [];
    const params = [];

    if (capacity !== undefined)    { updates.push('capacity = ?'); params.push(capacity); }
    if (processType !== undefined)  { updates.push('process_type = ?'); params.push(processType); }
    if (certifications !== undefined) { updates.push('certifications = ?');
      params.push(typeof certifications === 'string' ? certifications : JSON.stringify(certifications)); }
    if (businessScope !== undefined) { updates.push('business_scope = ?'); params.push(businessScope); }
    if (establishedYear !== undefined) { updates.push('established_year = ?'); params.push(establishedYear); }
    if (employeeCount !== undefined) { updates.push('employee_count = ?'); params.push(employeeCount); }
    if (wechatId !== undefined)    { updates.push('wechat_id = ?'); params.push(wechatId); }
    if (company !== undefined)    { updates.push('company = ?'); params.push(company); }
    if (location !== undefined)    { updates.push('location = ?'); params.push(location); }

    if (!updates.length) return res.status(400).json({ success: false, error: '没有可更新的字段' });

    params.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare('SELECT id, name, role, location, company, is_admin, status, created_at, avatar, capacity, process_type, certifications, business_scope, established_year, employee_count, wechat_id, dual_roles FROM users WHERE id = ?').get(userId);
    user.certifications = safeJSON(user.certifications, []);
    user.dual_roles = safeJSON(user.dual_roles, []);

    res.json({ success: true, profile: user });
  } catch (err) {
    console.error('[enterprise] update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== 样本墙: 添加产品样本 ======================
router.post('/samples', requireAuth, (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, category, form, specImageUrls, specCard, price, description } = req.body;
    if (!title || !category) {
      return res.status(400).json({ success: false, error: 'title, category 为必填' });
    }

    const imgUrls = specImageUrls ? (typeof specImageUrls === 'string' ? specImageUrls : JSON.stringify(specImageUrls)) : '[]';
    const card = specCard ? (typeof specCard === 'string' ? specCard : JSON.stringify(specCard)) : '{}';

    const result = db.prepare(
      'INSERT INTO enterprise_samples (user_id, title, category, form, spec_image_urls, spec_card, price, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, title, category, form || '', imgUrls, card, price || 0, description || '');

    const sample = db.prepare('SELECT * FROM enterprise_samples WHERE id = ?').get(result.lastInsertRowid);
    sample.spec_image_urls = safeJSON(sample.spec_image_urls, []);
    sample.spec_card = safeJSON(sample.spec_card, {});

    res.status(201).json({ success: true, sample });
  } catch (err) {
    console.error('[enterprise] sample error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== 评价: 添加评价 ======================
router.post('/evaluations', requireAuth, (req, res) => {
  try {
    const reviewerId = req.user.userId;
    const { targetUserId, listingId, matchId,
            ratingQuality, ratingIntegrity, ratingSpeed, comment, tags } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'targetUserId 为必填' });
    }

    // 同一笔交易只能评价一次
    if (listingId) {
      const dup = db.prepare(
        'SELECT id FROM evaluations WHERE reviewer_id = ? AND listing_id = ?'
      ).get(reviewerId, listingId);
      if (dup) return res.status(400).json({ success: false, error: '您已评价过该交易' });
    }

    const result = db.prepare(
      `INSERT INTO evaluations (reviewer_id, target_user_id, listing_id, match_id,
        rating_quality, rating_integrity, rating_speed, comment, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(reviewerId, targetUserId, listingId || null, matchId || null,
      ratingQuality || 5, ratingIntegrity || 5, ratingSpeed || 5,
      comment || '', tags ? (typeof tags === 'string' ? tags : JSON.stringify(tags)) : '[]');

    const ev = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, evaluation: ev });
  } catch (err) {
    console.error('[enterprise] eval error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== 评价: 查看评价列表 ======================
router.get('/evaluations/:targetUserId', (req, res) => {
  try {
    const evals = db.prepare(`
      SELECT e.*, u.name AS reviewer_name, u.avatar_url
      FROM evaluations e JOIN users u ON e.reviewer_id = u.id
      WHERE e.target_user_id = ? ORDER BY e.created_at DESC LIMIT 50
    `).all(req.params.targetUserId);

    const stats = db.prepare(`
      SELECT COUNT(*) as total,
        ROUND(AVG(CAST(rating_quality AS REAL)), 1) as avg_quality,
        ROUND(AVG(CAST(rating_integrity AS REAL)), 1) as avg_integrity,
        ROUND(AVG(CAST(rating_speed AS REAL)), 1) as avg_speed
      FROM evaluations WHERE target_user_id = ?
    `).get(req.params.targetUserId);

    res.json({ success: true, evaluations: evals, stats });
  } catch (err) {
    console.error('[enterprise] evals error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
