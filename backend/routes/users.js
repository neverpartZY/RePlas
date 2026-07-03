const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  sanitizeObject,
  findSQLInjection,
  checkLengthLimits,
} = require('../helpers');

// POST /api/users/register
router.post('/register', (req, res) => {
  try {
    const { name, role, location } = req.body;

    if (!name || !role) {
      return res.status(400).json({ success: false, error: 'name and role are required' });
    }

    const validRoles = ['打包站', '再生工厂', '制品·改性·色母', '贸易商'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `role must be one of: ${validRoles.join(', ')}`,
      });
    }

    // Fix 5: SQL injection check
    const dangerousField = findSQLInjection(req.body);
    if (dangerousField) {
      return res.status(400).json({ success: false, error: 'invalid characters in input' });
    }

    // Fix 4: XSS sanitization
    sanitizeObject(req.body);

    // Fix 7: length limits
    const lengthErr = checkLengthLimits(req.body);
    if (lengthErr) {
      return res.status(400).json({
        success: false,
        error: `${lengthErr.field} must not exceed ${lengthErr.limit} characters`,
      });
    }

    const result = db.prepare(
      'INSERT INTO users (name, role, location) VALUES (?, ?, ?)'
    ).run(req.body.name, req.body.role, req.body.location || '');

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ success: true, user });
  } catch (err) {
    console.error('[users] register error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users — list all users
router.get('/', (req, res) => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
    res.json({ success: true, users });
  } catch (err) {
    console.error('[users] list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
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
