const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/matches/:userId — all matches involving this user's listings
router.get('/:userId', (req, res) => {
  try {
    const userId = Number(req.params.userId);

    // Get all listing IDs belonging to this user
    const userListings = db.prepare(
      'SELECT id, type, material, form, quantity, price, location FROM listings WHERE user_id = ?'
    ).all(userId);

    if (userListings.length === 0) {
      return res.json({ success: true, matches: [], total: 0 });
    }

    const listingIds = userListings.map(l => l.id);
    const placeholders = listingIds.map(() => '?').join(',');

    const matches = db.prepare(`
      SELECT m.*,
        s.material AS supply_material, s.form AS supply_form, s.quantity AS supply_quantity,
        s.price AS supply_price, s.location AS supply_location,
        s.user_id AS supply_user_id,
        su.name AS supply_user_name, su.role AS supply_user_role,
        d.material AS demand_material, d.form AS demand_form, d.quantity AS demand_quantity,
        d.price AS demand_price, d.location AS demand_location,
        d.user_id AS demand_user_id,
        du.name AS demand_user_name, du.role AS demand_user_role
      FROM matches m
      JOIN listings s ON m.supply_id = s.id
      JOIN listings d ON m.demand_id = d.id
      JOIN users su ON s.user_id = su.id
      JOIN users du ON d.user_id = du.id
      WHERE m.supply_id IN (${placeholders}) OR m.demand_id IN (${placeholders})
      ORDER BY m.score DESC
    `).all(...listingIds, ...listingIds);

    // Parse dimension_scores JSON
    const parsed = matches.map(m => ({
      ...m,
      dimensionScores: JSON.parse(m.dimension_scores || '{}'),
    }));

    res.json({ success: true, matches: parsed, total: parsed.length });
  } catch (err) {
    console.error('[matches] error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/matches/:id — update match status
router.patch('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    const { status } = req.body;
    if (!status || !['pending', 'contacted', 'deal'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'status must be one of: pending, contacted, deal',
      });
    }

    db.prepare('UPDATE matches SET status = ? WHERE id = ?').run(status, req.params.id);

    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
    res.json({ success: true, match: { ...match, dimensionScores: JSON.parse(match.dimension_scores || '{}') } });
  } catch (err) {
    console.error('[matches] update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
