const express = require('express');
const router = express.Router();
const db = require('../db');
const { sanitize } = require('../helpers');

// GET /api/prices — all price data with optional query filters
router.get('/', (req, res) => {
  try {
    const { category, material } = req.query;

    let sql = 'SELECT * FROM prices WHERE 1=1';
    const params = [];

    // Fix 3: support ?category= and ?material= query params
    if (category) {
      sql += ' AND category = ?';
      params.push(sanitize(category.toUpperCase()));
    }
    if (material) {
      sql += ' AND material LIKE ?';
      params.push(`%${sanitize(material)}%`);
    }

    sql += ' ORDER BY category, material';

    const prices = db.prepare(sql).all(...params);
    res.json({ success: true, prices, total: prices.length });
  } catch (err) {
    console.error('[prices] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/prices/:category — price data for specific category
router.get('/:category', (req, res) => {
  try {
    const category = req.params.category.toUpperCase();
    const prices = db.prepare(
      'SELECT * FROM prices WHERE category = ? ORDER BY material'
    ).all(category);

    if (prices.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No price data for category: ${category}`,
      });
    }

    res.json({ success: true, category, prices, total: prices.length });
  } catch (err) {
    console.error('[prices] category error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
