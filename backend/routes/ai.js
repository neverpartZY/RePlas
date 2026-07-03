/**
 * AI 解析路由 — DeepSeek 自然语言解析
 * POST /api/ai/parse
 *
 * 接收用户自然语言输入，调用 DeepSeek API 解析为结构化供需数据。
 * 当 DeepSeek 不可用时（未配置 API Key / 网络异常），返回提示让前端回退到本地规则引擎。
 */

const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

// ---- DeepSeek 客户端初始化 ------------------------------------------------
function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseURL = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';

  if (!apiKey || apiKey.trim() === '') {
    return null;
  }

  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL + '/v1', // DeepSeek 兼容 OpenAI /v1 路径
  });
}

// ---- 方向预判（规则引擎，确保准确性）---------------------------------
const DEMAND_KEYWORDS = [
  '求购', '采购', '收购', '求', '买', '收', '需要', '需求', '寻求',
  '急求', '求货', '进货', '回收', '要买', '想买', '寻找', '寻购',
  '长年求购', '常年收购',
];
const SUPPLY_KEYWORDS = [
  '出售', '供应', '供货', '提供', '出清', '处理', '清仓', '库存',
  '现货', '出货', '甩卖', '出', '卖', '销售',
];

function detectDirection(text, userRole) {
  if (userRole === 'supplier') return 'supply';
  if (userRole === 'buyer') return 'demand';

  // 优先匹配需求关键词
  for (const kw of DEMAND_KEYWORDS) {
    if (text.includes(kw)) return 'demand';
  }
  for (const kw of SUPPLY_KEYWORDS) {
    if (text.includes(kw)) return 'supply';
  }
  return null; // 无法判断，留给 AI
}

// ---- 品类分类体系（精简版，供 Prompt 使用）-------------------------------

const TAXONOMY_CONTEXT = `
## 废塑料品类体系

### PET 废塑料
- PET三色瓶砖 / PET纯白瓶砖 / PET蓝白瓶砖 / PET绿瓶砖 / PET油瓶砖 / PET毛瓶砖
- PET透明散瓶 / PET白色破碎料 / PET净片(瓶片) / PET杂色破碎 / PET吸塑片破碎
- PET黑色吸塑破碎 / PET瓶坯破碎料 / PET透明胶水膜破碎 / PET枕芯料
- PET X光片 / PET打包带废料

### HDPE 废塑料
- HDPE大蓝桶破碎 / HDPE大白桶破碎 / HDPE小中空破碎(牛奶瓶/洗发水瓶)
- HDPE管道破碎料 / HDPE管道粉碎料 / HDPE注塑破碎料
- HDPE吹塑破碎料 / HDPE膜料破碎(缠绕膜) / HDPE编织袋
- HDPE桶料 / HDPE瓶盖料

### PP 废塑料
- PP编织袋 / PP吨袋 / PP注塑破碎料 / PP拉丝料 / PP无纺布
- PP打包带 / PP快餐盒破碎 / PP洗衣机桶料 / PP汽车保险杠破碎
- PP-R管料 / PP-B管料

### LDPE 废塑料
- LDPE膜料(地膜/大棚膜/工业膜) / LDPE缠绕膜 / LDPE高压膜
- LDPE颗粒(高压颗粒)

### ABS 废塑料
- ABS破碎料 / ABS电镀件破碎 / ABS电视机壳破碎 / ABS电脑壳破碎

### PS 废塑料
- PS泡沫(EPS) / PS冰箱内胆破碎(HIPS) / PS电视机壳破碎

### PC 废塑料
- PC透明料 / PC水桶料 / PC光盘料 / PC阳光板破碎

### PA (尼龙) 废塑料
- PA6破碎料 / PA66破碎料 / PA增强料(含玻纤)

### PVC 废塑料
- PVC管材料 / PVC型材破碎 / PVC硬质料 / PVC软质料

## 再生料品类体系
- PET再生颗粒(蓝白/纯白/绿色/杂色) / 一级PET颗粒 / 二级PET颗粒
- HDPE再生颗粒(蓝色/白色/黑色/杂色) / HDPE一级颗粒 / HDPE管道颗粒
- PP再生颗粒(白色/黑色/杂色) / PP注塑颗粒 / PP拉丝颗粒 / PP改性颗粒
- LDPE再生颗粒(高压颗粒) / LLDPE再生颗粒
- ABS再生颗粒(黑色/本色) / PS再生颗粒(HIPS/GPPS) / PC再生颗粒
- PA再生颗粒(PA6/PA66) / PVC再生颗粒(硬质/软质)

## 形态类型
瓶片 / 颗粒 / 破碎料 / 粉碎料 / 瓶砖 / 膜 / 桶料 / 管材料 / 打包带 / 编织袋 / 外壳料 / 散瓶 / 压块

## 行业黑话对照
- "白钢" = PET纯白瓶砖
- "蓝白片" = PET蓝白瓶片
- "三色" = PET三色瓶砖
- "475" = HIPS再生颗粒
- "高压颗粒" = LDPE再生颗粒
- "低压颗粒" = HDPE再生颗粒
- "聚丙" = PP
- "聚乙" = PE
- "ABS本色" = ABS原生色破碎/颗粒
- "花料" = 杂色混合料
- "一级料" = 高品质再生颗粒（杂质<0.5%）
- "二级料" = 中等品质再生颗粒（杂质<3%）
- "抽粒" = 再生造粒

## 供应/需求关键词
- 供应端: 卖、出、出售、供应、供货、提供、有、出清、处理、清仓、库存、现货、出货、甩卖
- 需求端: 买、求、收、求购、采购、收购、需要、需求、寻求、急求、进货、回收、寻找
`;

const SYSTEM_PROMPT = `你是一个专业的再生塑料行业AI解析助手。用户会用自然语言描述塑料原料的供需信息，你需要将其解析为结构化的JSON数据。

⚠️ 用户消息中会带有方向标识（如"【方向：采购】"或"【方向：供应】"），你必须严格遵循这个标识来确定direction字段。如果标识说"采购"则direction="demand"，"供应"则direction="supply"。

${TAXONOMY_CONTEXT}

## 解析规则

1. **direction**: 严格按用户消息中的方向标识填写。"采购"→"demand"，"供应"→"supply"

2. **materialType**: 
   - "waste": 废塑料、破碎料、瓶片、瓶砖、粉碎料、膜、打包带、编织袋、桶料、管料
   - "recycled": 再生料、颗粒、粒子、一级料、二级料、抽粒、造粒、改性料

3. **category**: 从品类体系中匹配最准确的品类名称。注意行业黑话翻译。例如："白钢"→"PET纯白瓶砖"，"475"→"HIPS再生颗粒"

4. **form**: 提取物料形态，如 瓶片、颗粒、破碎料、瓶砖、膜、桶料等

5. **quantity**: 数字+单位，默认转为吨输出纯数字（如30）。"每月XX吨"表示月需求量。无法识别时填 null。

6. **price**: 数字，单位元/吨，范围 1000-50000。输出纯数字（如5800）。"面议""电议"时填 null。

7. **location**: 完整地点，格式如"河北省定州市"。注意识别：廊坊→河北省廊坊市，东莞→广东省东莞市，佛山→广东省佛山市，定州→河北省定州市，临沂→山东省临沂市。

8. **confidence**: 0-1之间。品类明确+信息完整→0.85+；部分缺失→0.5-0.8；无法识别→<0.3

## 输出格式

你必须严格返回以下JSON格式，不要包含任何其他文字：

{
  "direction": "supply",
  "materialType": "waste",
  "category": "PET三色瓶砖",
  "form": "瓶砖",
  "quantity": 30,
  "price": 5800,
  "location": "河北省定州市",
  "confidence": 0.9,
  "interpreted": "🧑‍🏭 您想【出售】废塑料 —— PET三色瓶砖 30吨 单价¥5800/吨 河北省定州市 形态：瓶砖"
}

如果用户输入中缺少某个字段，将该字段设为 null（字符串用 ""，数字用 null）。
如果完全无法识别品类，category 设为 ""，confidence 设为 0.1。
`;

// ---- POST /api/ai/parse ------------------------------------------------

router.post('/parse', async (req, res) => {
  const { text, userRole } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({
      success: false,
      message: '请输入要解析的内容',
      result: null,
    });
  }

  const client = getDeepSeekClient();

  // 未配置 DeepSeek API Key — 让前端回退到本地规则引擎
  if (!client) {
    return res.json({
      success: false,
      message: 'AI 服务未配置（缺少 DEEPSEEK_API_KEY），请使用本地解析',
      result: null,
      aiAvailable: false,
    });
  }

  try {
    // 方向预判（规则引擎确保100%准确）
    const preDirection = detectDirection(text.trim(), userRole);

    // 构建用户消息（注入方向标识）
    let directionHint = '';
    if (preDirection === 'supply') {
      directionHint = '【方向：供应】';
    } else if (preDirection === 'demand') {
      directionHint = '【方向：采购】';
    } else if (userRole === 'supplier') {
      directionHint = '【方向：供应】';
    } else if (userRole === 'buyer') {
      directionHint = '【方向：采购】';
    }

    let userMessage = text.trim();
    if (directionHint) {
      userMessage = `${directionHint} ${userMessage}`;
    }

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,    // 低温度确保稳定输出
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const rawContent = response.choices[0]?.message?.content || '{}';

    // 解析 DeepSeek 返回的 JSON
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('[AI] DeepSeek 返回非 JSON:', rawContent.substring(0, 200));
      // 尝试提取 JSON
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          return res.json({
            success: false,
            message: 'AI 返回格式异常，请重试',
            result: null,
            aiAvailable: true,
          });
        }
      } else {
        return res.json({
          success: false,
          message: 'AI 返回格式异常，请重试',
          result: null,
          aiAvailable: true,
        });
      }
    }

    // 构建标准化的返回结果
    // 注意：方向以规则引擎预判为准，覆盖 DeepSeek 可能的误判
    const finalDirection = preDirection || parsed.direction || 'supply';

    const result = {
      direction: finalDirection,
      materialType: parsed.materialType || 'waste',
      category: parsed.category || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      quantity: parsed.quantity || null,
      price: parsed.price || null,
      location: parsed.location || '',
      form: parsed.form || '',
      original: text.trim(),
      interpreted: parsed.interpreted || '',
      details: {
        direction: finalDirection,
        directionLabel: finalDirection === 'demand' ? '需求' : '供应',
        materialType: parsed.materialType || 'waste',
        materialTypeLabel: parsed.materialType === 'recycled' ? '再生料' : '废塑料',
        category: parsed.category || '',
        quantity: parsed.quantity || null,
        price: parsed.price || null,
        location: parsed.location || '',
        form: parsed.form || '',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        confidenceLabel: (typeof parsed.confidence === 'number' ? parsed.confidence : 0.5) >= 0.8 ? '高' : ((typeof parsed.confidence === 'number' ? parsed.confidence : 0.5) >= 0.5 ? '中' : '低'),
      },
    };

    // 如果没有 interpreted 或方向被修正，重新生成
    if (!result.interpreted || finalDirection !== (parsed.direction || 'supply')) {
      const parts = [];
      parts.push(finalDirection === 'supply' ? '🧑‍🏭 您想【出售】' : '🏭 您想【采购】');
      parts.push(result.details.materialTypeLabel);
      if (result.category) parts.push(`—— ${result.category}`);
      if (result.quantity) parts.push(`${result.quantity}吨`);
      if (result.price) parts.push(`单价¥${result.price}/吨`);
      if (result.location) parts.push(`📍${result.location}`);
      if (result.form) parts.push(`形态：${result.form}`);
      result.interpreted = parts.join(' ');
    }

    return res.json({
      success: !!result.category,
      message: result.category ? 'AI 解析成功' : '未能识别品类，请补充信息',
      result,
      aiAvailable: true,
      model: 'deepseek-chat',
    });
  } catch (error) {
    console.error('[AI] DeepSeek API 调用失败:', error.message);

    // 区分不同类型的错误
    if (error.status === 401 || error.status === 403) {
      return res.json({
        success: false,
        message: 'AI 服务认证失败，请检查 API Key 配置',
        result: null,
        aiAvailable: false,
      });
    }

    if (error.status === 429) {
      return res.json({
        success: false,
        message: 'AI 服务请求过于频繁，请稍后重试',
        result: null,
        aiAvailable: true,
      });
    }

    // 网络或服务端错误
    return res.json({
      success: false,
      message: 'AI 服务暂时不可用，请使用本地解析',
      result: null,
      aiAvailable: false,
    });
  }
});

// ---- GET /api/ai/status ------------------------------------------------
// 检查 AI 服务状态
router.get('/status', (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  res.json({
    available: !!(apiKey && apiKey.trim()),
    model: 'deepseek-chat',
    baseUrl: process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com',
  });
});

module.exports = router;
