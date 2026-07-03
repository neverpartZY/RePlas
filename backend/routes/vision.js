/**
 * P0-1: 图片识别路由 — AI视觉识别塑料品类/颜色/品质
 *
 * POST /api/vision/analyze  — 上传废塑料/再生料图片，AI识别品类、颜色、形态、预估品质
 * POST /api/vision/upload   — 简单图片上传（返回URL）
 * GET  /api/vision/history  — 查询历史识别记录
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

// ---- 图片存储配置 ------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `vision-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error(`不支持的文件类型: ${ext}，仅支持: ${allowed.join(', ')}`));
    }
    cb(null, true);
  },
});

// ---- 塑料品类特征库 ----------------------------------------------------------
// 基于颜色、纹理的初步识别规则（后续可升级为 AI Vision API）

const PLASTIC_FEATURES = {
  'PET': {
    typicalColors: ['透明', '蓝白', '绿色', '浅蓝', '无色'],
    colorProfiles: {
      transparent: { rMax: 255, gMax: 255, bMax: 255, rMin: 180, gMin: 180, bMin: 180 },
      blueWhite:  { rMax: 220, gMax: 230, bMax: 240, rMin: 150, gMin: 160, bMin: 200 },
      green:      { rMax: 180, gMax: 220, bMax: 150, rMin: 100, gMin: 150, bMin: 80 },
    },
    forms: ['瓶砖', '瓶片', '破碎料', '颗粒'],
    density: 1.38,
    description: 'PET聚酯 — 常用于饮料瓶、矿泉水瓶',
  },
  'HDPE': {
    typicalColors: ['蓝色', '白色', '黑色', '乳白'],
    colorProfiles: {
      blue:  { rMax: 130, gMax: 160, bMax: 220, rMin: 50, gMin: 60, bMin: 130 },
      white: { rMax: 250, gMax: 250, bMax: 250, rMin: 200, gMin: 200, bMin: 200 },
      black: { rMax: 80, gMax: 80, bMax: 80, rMin: 0, gMin: 0, bMin: 0 },
    },
    forms: ['破碎料', '粉碎料', '桶料', '颗粒'],
    density: 0.95,
    description: 'HDPE高密度聚乙烯 — 常用于牛奶瓶、洗发水瓶、化工桶',
  },
  'PP': {
    typicalColors: ['白色', '花色', '灰色', '黑色', '米白'],
    colorProfiles: {
      white:  { rMax: 250, gMax: 250, bMax: 250, rMin: 190, gMin: 190, bMin: 190 },
      mixed:  { rMax: 220, gMax: 220, bMax: 220, rMin: 100, gMin: 100, bMin: 100 },
      gray:   { rMax: 180, gMax: 180, bMax: 180, rMin: 100, gMin: 100, bMin: 100 },
    },
    forms: ['破碎料', '粉碎料', '编织袋', '颗粒'],
    density: 0.90,
    description: 'PP聚丙烯 — 常用于编织袋、桶料、注塑件',
  },
  'LDPE': {
    typicalColors: ['透明', '白色', '杂色'],
    colorProfiles: {
      transparent: { rMax: 240, gMax: 240, bMax: 240, rMin: 150, gMin: 150, bMin: 150 },
      white:      { rMax: 250, gMax: 250, bMax: 250, rMin: 190, gMin: 190, bMin: 190 },
    },
    forms: ['膜', '颗粒', '破碎料'],
    density: 0.92,
    description: 'LDPE低密度聚乙烯 — 常用于膜料、包装膜、地膜',
  },
  'ABS': {
    typicalColors: ['灰色', '灰白', '米黄', '黑色'],
    colorProfiles: {
      gray:  { rMax: 200, gMax: 200, bMax: 200, rMin: 120, gMin: 120, bMin: 120 },
      grayWhite: { rMax: 230, gMax: 230, bMax: 220, rMin: 160, gMin: 160, bMin: 150 },
    },
    forms: ['破碎料', '外壳料', '颗粒'],
    density: 1.05,
    description: 'ABS丙烯腈-丁二烯-苯乙烯 — 常用于电器外壳、汽车内饰',
  },
  'PC': {
    typicalColors: ['透明', '微黄', '浅棕色'],
    colorProfiles: {
      transparent: { rMax: 255, gMax: 250, bMax: 220, rMin: 180, gMin: 170, bMin: 140 },
      yellow:     { rMax: 240, gMax: 230, bMax: 180, rMin: 160, gMin: 150, bMin: 100 },
    },
    forms: ['破碎料', '颗粒', '桶料'],
    density: 1.20,
    description: 'PC聚碳酸酯 — 常用于水桶、车灯、光盘',
  },
  'PS': {
    typicalColors: ['白色', '透明', '黑色'],
    colorProfiles: {
      white:      { rMax: 250, gMax: 250, bMax: 250, rMin: 200, gMin: 200, bMin: 200 },
      transparent: { rMax: 240, gMax: 240, bMax: 240, rMin: 160, gMin: 160, bMin: 160 },
    },
    forms: ['破碎料', '颗粒'],
    density: 1.04,
    description: 'PS聚苯乙烯 — 常用于泡沫塑料、冰箱内胆',
  },
  'PA': {
    typicalColors: ['乳白', '米黄', '棕色', '黑色'],
    colorProfiles: {
      cream: { rMax: 240, gMax: 230, bMax: 210, rMin: 170, gMin: 160, bMin: 130 },
      brown: { rMax: 200, gMax: 160, bMax: 120, rMin: 110, gMin: 80, bMin: 50 },
    },
    forms: ['破碎料', '颗粒', '废丝'],
    density: 1.14,
    description: 'PA尼龙 — 常用于扎带、齿轮、工程件',
  },
  'PVC': {
    typicalColors: ['灰色', '白色', '深灰色'],
    colorProfiles: {
      gray:  { rMax: 190, gMax: 190, bMax: 190, rMin: 120, gMin: 120, bMin: 120 },
      white: { rMax: 250, gMax: 250, bMax: 250, rMin: 190, gMin: 190, bMin: 190 },
    },
    forms: ['破碎料', '管材料', '颗粒'],
    density: 1.38,
    description: 'PVC聚氯乙烯 — 常用于管材、型材、电缆皮',
  },
};

// ---- 颜色分析算法 ------------------------------------------------------------

/**
 * 使用 sharp 提取图片主色调
 * 返回 { r, g, b } 平均色值
 */
async function extractDominantColor(imagePath) {
  try {
    const { dominant } = await sharp(imagePath)
      .resize(200, 200, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = await sharp(imagePath)
      .resize(100, 100, { fit: 'cover' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    // 简单采样：每10个像素取一个
    let totalR = 0, totalG = 0, totalB = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 40) { // RGBA 每像素4字节, 每10像素采样
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
      if (a < 20) continue; // 跳过透明像素
      totalR += r; totalG += g; totalB += b;
      count++;
    }

    if (count < 10) {
      // 如果有效像素太少，全采样
      for (let i = 0; i < pixels.length; i += 4) {
        totalR += pixels[i]; totalG += pixels[i + 1]; totalB += pixels[i + 2];
        count++;
      }
    }

    return {
      r: Math.round(totalR / count),
      g: Math.round(totalG / count),
      b: Math.round(totalB / count),
    };
  } catch (e) {
    console.error('[Vision] Color extraction failed:', e.message);
    return { r: 128, g: 128, b: 128 }; // fallback gray
  }
}

/**
 * 分析颜色分布（色相直方图）
 */
async function analyzeColorDistribution(imagePath) {
  try {
    const pixels = await sharp(imagePath)
      .resize(50, 50, { fit: 'cover' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    let transparent = 0, total = 0;
    let warm = 0, cool = 0, neutral = 0; // color temperature

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
      if (a < 20 || (r > 240 && g > 240 && b > 240)) { transparent++; continue; }
      total++;
      // Simple color temperature: r dominant = warm, b dominant = cool
      if (r > b + 30 && r > g + 20) warm++;
      else if (b > r + 30 && b > g + 20) cool++;
      else neutral++;
    }

    if (total === 0) return { warmPct: 0, coolPct: 0, neutralPct: 0, transparentPct: 100 };

    return {
      warmPct: Math.round((warm / total) * 100),
      coolPct: Math.round((cool / total) * 100),
      neutralPct: Math.round((neutral / total) * 100),
      transparentPct: Math.round((transparent / (transparent + total)) * 100),
      texture: 'normal',
    };
  } catch (e) {
    return { warmPct: 0, coolPct: 0, neutralPct: 0, transparentPct: 0, texture: 'unknown' };
  }
}

// ---- 塑料类别识别 ------------------------------------------------------------

/**
 * 基于颜色匹配塑料品类
 */
function matchPlasticByColor(dominantRgb, allFeatures = PLASTIC_FEATURES) {
  const { r, g, b } = dominantRgb;
  let bestMatch = null;
  let bestScore = 0;

  for (const [category, features] of Object.entries(allFeatures)) {
    let bestColorScore = 0;
    let matchedColor = '';

    for (const [colorName, profile] of Object.entries(features.colorProfiles)) {
      const rMatch = r >= profile.rMin && r <= profile.rMax;
      const gMatch = g >= profile.gMin && g <= profile.gMax;
      const bMatch = b >= profile.bMin && b <= profile.bMax;
      const matches = [rMatch, gMatch, bMatch].filter(Boolean).length;
      const score = matches / 3; // 0 to 1

      if (score > bestColorScore) {
        bestColorScore = score;
        matchedColor = colorName;
      }
    }

    if (bestColorScore > bestScore) {
      bestScore = bestColorScore;
      bestMatch = {
        category,
        color: matchedColor,
        confidence: bestColorScore,
        forms: features.forms,
        density: features.density,
        description: features.description,
        typicalColors: features.typicalColors,
      };
    }
  }

  return bestMatch || {
    category: '其他',
    color: '未知',
    confidence: 0.1,
    forms: ['破碎料'],
    density: 1.0,
    description: '未能识别具体品类，请手动选择',
    typicalColors: [],
  };
}

/**
 * 推断最可能的形态
 */
function inferForm(categoryFeatures, colorDistribution) {
  if (!categoryFeatures || !categoryFeatures.forms) return '破碎料';
  const forms = categoryFeatures.forms;

  // 透明度高的 → 可能是瓶片/膜
  if (colorDistribution && colorDistribution.transparentPct > 60) {
    if (forms.includes('瓶片')) return '瓶片';
    if (forms.includes('膜')) return '膜';
  }

  // 默认返回第一个常见形态
  if (forms.includes('破碎料')) return '破碎料';
  return forms[0] || '破碎料';
}

/**
 * 估算净瓶率（仅针对 PET 瓶砖）
 */
function estimatePurity(colorDistribution, dominantRgb) {
  if (!colorDistribution) return null;

  // 基于颜色纯净度简单估算
  const { warmPct, coolPct, neutralPct } = colorDistribution;

  // 颜色越均匀（单一色相主导），净瓶率越高
  const purity = Math.max(warmPct || 0, coolPct || 0, neutralPct || 0);

  const { r, g, b } = dominantRgb;

  // 瓶砖净瓶率根据颜色判断
  if (r > 200 && g > 200 && b > 200) return '>95% (纯白)';
  if (r > 150 && g > 150 && b > 200) return '>90% (蓝白)';
  if (r > 100 && g > 150 && b > 100) return '>85% (绿色)';
  if (purity > 70) return '>80%';
  return '70-80% (三色混合)';
}

// ---- 创建 vision_records 表 -------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS vision_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    image_url TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    category TEXT DEFAULT '',
    color TEXT DEFAULT '',
    form TEXT DEFAULT '',
    purity TEXT DEFAULT '',
    confidence REAL DEFAULT 0,
    raw_result TEXT DEFAULT '{}',
    listing_id INTEGER,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_vision_user ON vision_records(user_id);
  CREATE INDEX IF NOT EXISTS idx_vision_status ON vision_records(status);
`);

// ---- POST /api/vision/analyze ----------------------------------------------
// 核心接口：上传图片 → AI 识别品类/颜色/形态/品质

router.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请上传图片文件' });
    }

    const file = req.file;
    const imageUrl = `/uploads/${file.filename}`;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // 步骤1: 提取主色调
    const dominantColor = await extractDominantColor(file.path);

    // 步骤2: 分析颜色分布
    const colorDist = await analyzeColorDistribution(file.path);

    // 步骤3: 匹配塑料品类
    const recognition = matchPlasticByColor(dominantColor);

    // 步骤4: 推断形态
    const form = inferForm(recognition, colorDist);

    // 步骤5: 估算净瓶率（PET瓶砖场景）
    const purity = recognition.category === 'PET' ? estimatePurity(colorDist, dominantColor) : null;

    // 步骤6: 颜色中文映射
    const colorMap = {
      blueWhite: '蓝白', transparent: '透明', green: '绿色',
      blue: '蓝色', white: '白色', black: '黑色', mixed: '花色',
      gray: '灰色', grayWhite: '灰白', cream: '乳白',
      brown: '棕色', yellow: '微黄',
    };
    const colorCN = colorMap[recognition.color] || recognition.color || '未识别';

    const result = {
      category: recognition.category,
      color: colorCN,
      colorEn: recognition.color,
      dominantRgb: dominantColor,
      form,
      purity,
      confidence: Math.round(recognition.confidence * 100),
      description: recognition.description,
      density: recognition.density,
      colorDistribution: colorDist,
      materialType: recognition.density > 1.0 ? '废塑料' : '再生料', // 密度估判
      typicalForms: recognition.forms,
      imageUrl: `${baseUrl}${imageUrl}`,
      imagePath: imageUrl,
      fileName: file.originalname,
    };

    // 用户的识别精度较低时给出提示
    const warnings = [];
    if (result.confidence < 50) {
      warnings.push('颜色特征不明显，建议重新拍照（光线充足、背景纯色）');
    }
    if (result.confidence < 30) {
      warnings.push('识别精度较低，请手动确认品类');
    }

    // 写入数据库记录（获取 userId —— 可选）
    const userId = req.body.userId || req.headers['x-user-id'] || null;

    let recordId = null;
    if (userId) {
      const insertResult = db.prepare(`
        INSERT INTO vision_records (user_id, image_url, original_name, category, color, form, purity, confidence, raw_result)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId, imageUrl, file.originalname,
        result.category, result.color, result.form, result.purity || '',
        result.confidence, JSON.stringify(result)
      );
      recordId = insertResult.lastInsertRowid;

      // 同步写入 upload_images 表（统一图片管理）
      db.prepare(`
        INSERT INTO upload_images (user_id, url, original_name, mime_type, file_size, reference_type, reference_id, status)
        VALUES (?, ?, ?, ?, ?, 'vision', ?, 'active')
      `).run(userId, imageUrl, file.originalname, file.mimetype, file.size, recordId);
    }

    // 尝试用 DeepSeek 提高识别精度（如果配置了）
    let aiEnhanced = null;
    try {
      const OpenAI = require('openai');
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (apiKey && apiKey.trim()) {
        const client = new OpenAI({
          apiKey,
          baseURL: (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com') + '/v1',
        });

        const visionPrompt = `你是一个专业的废塑料/再生料视觉分析专家。根据以下图片分析的初步结果，请优化识别：
- 初步品类: ${result.category}
- 主色调: R=${dominantColor.r} G=${dominantColor.g} B=${dominantColor.b}
- 颜色: ${result.color}
- 颜色分布: 暖色调${colorDist.warmPct}% 冷色调${colorDist.coolPct}% 中性${colorDist.neutralPct}% 透明${colorDist.transparentPct}%
- 置信度: ${result.confidence}%

请返回优化后的JSON:
{
  "category": "PET/HDPE/PP...",
  "subCategory": "具体品类如PET三色瓶砖",
  "form": "瓶砖/瓶片/颗粒/破碎料...",
  "grade": "食品级/工业级/普通级",
  "purityEstimate": "净瓶率估算如>90%",
  "confidence": 0-100,
  "notes": "补充说明"
}`;

        const response = await client.chat.completions.create({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: visionPrompt }],
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        });

        try {
          aiEnhanced = JSON.parse(response.choices[0]?.message?.content || '{}');
        } catch (e) { /* ignore parse error */ }
      }
    } catch (e) { /* AI enhance is optional */ }

    res.json({
      success: true,
      data: result,
      aiEnhanced: aiEnhanced || null,
      warnings,
      recordId,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[Vision] Analyze error:', err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: '文件过大，限制10MB以内' });
    }
    res.status(500).json({ success: false, error: `识别失败: ${err.message}` });
  }
});

// ---- POST /api/vision/upload -------------------------------------------------
// 简单图片上传（仅存储，不分析）

router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '请上传图片文件' });
  }
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const imageUrl = `/uploads/${req.file.filename}`;

  // 写入 upload_images 表
  const userId = req.body.userId || req.headers['x-user-id'] || null;
  if (userId) {
    db.prepare(`
      INSERT INTO upload_images (user_id, url, original_name, mime_type, file_size, reference_type, status)
      VALUES (?, ?, ?, ?, ?, 'upload', 'active')
    `).run(userId, imageUrl, req.file.originalname, req.file.mimetype, req.file.size);
  }

  res.json({
    success: true,
    data: {
      url: `${baseUrl}${imageUrl}`,
      path: imageUrl,
      name: req.file.originalname,
      size: req.file.size,
    },
  });
});

// ---- GET /api/vision/history -------------------------------------------------
// 查询历史识别记录

router.get('/history', (req, res) => {
  try {
    const { userId = req.query.userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId 为必填参数' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const total = db.prepare(
      'SELECT COUNT(*) as cnt FROM vision_records WHERE user_id = ? AND status = ?'
    ).get(userId, 'active');

    const records = db.prepare(`
      SELECT * FROM vision_records
      WHERE user_id = ? AND status = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, 'active', limit, offset);

    res.json({
      success: true,
      records: records.map(r => ({
        ...r,
        raw_result: safeJSON(r.raw_result),
      })),
      total: total.cnt,
      page, limit,
    });
  } catch (err) {
    console.error('[Vision] History error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

function safeJSON(str) {
  try { return JSON.parse(str); } catch (e) { return str; }
}

// 静态文件服务 — uploads 目录
router.use('/uploads', express.static(UPLOAD_DIR));

module.exports = router;
