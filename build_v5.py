#!/usr/bin/env python3
"""Build 前端_app_v5.html from v4 + P0 feature additions."""
import re

with open('前端_app_v4.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ============================================================
# 1. CSS additions — insert before </style>
# ============================================================
NEW_CSS = """
/* =================================================================
   Vision Page (P0-1: 拍照识别)
   ================================================================= */
.vision-upload-area{
  background:var(--card);border-radius:var(--radius);padding:20px;
  text-align:center;border:2px dashed var(--border);
  margin-bottom:16px;cursor:pointer;transition:all var(--transition);
  min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
}
.vision-upload-area:hover{border-color:var(--primary);background:var(--primary-light)}
.vision-upload-area .icon{font-size:48px;opacity:0.7}
.vision-upload-area .text{font-size:14px;color:var(--text-secondary)}
.vision-upload-area .hint{font-size:11px;color:var(--text-hint)}
.vision-preview{position:relative;margin-bottom:16px;border-radius:var(--radius);overflow:hidden}
.vision-preview img{width:100%;max-height:300px;object-fit:contain;background:#000}
.vision-preview .retake{
  position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.6);color:#fff;
  border-radius:20px;padding:6px 14px;font-size:12px;cursor:pointer;
}
.vision-result-card{
  background:var(--card);border-radius:var(--radius);overflow:hidden;
  box-shadow:var(--shadow-lg);border:2px solid var(--primary);
  margin-bottom:16px;display:none;
}
.vision-result-card.show{display:block;animation:popIn .4s cubic-bezier(0.175,0.885,0.32,1.275)}
.vision-result-card .result-header{
  background:linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
  color:#fff;padding:10px 16px;font-size:13px;font-weight:600;
  display:flex;align-items:center;gap:8px;
}
.vision-result-card .result-body{padding:14px 16px}
.vision-result-card .result-row{display:flex;align-items:center;margin-bottom:10px;font-size:14px;flex-wrap:wrap;gap:4px}
.vision-result-card .result-row:last-child{margin-bottom:0}
.vision-result-card .result-row .label{color:var(--text-hint);width:65px;flex-shrink:0;font-size:12px;font-weight:500}
.vision-result-card .result-row .value{font-weight:600;color:var(--text)}
.vision-result-card .result-row .conf{font-size:11px;color:var(--text-hint);margin-left:6px}
.vision-result-card .result-actions{display:flex;gap:10px;padding:0 16px 14px}
.vision-loading{
  display:none;align-items:center;justify-content:center;
  padding:24px;flex-direction:column;gap:10px;
}
.vision-loading.show{display:flex}
.vision-loading .spinner{
  width:40px;height:40px;border:4px solid var(--border);
  border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite;
}
.vision-loading .text{font-size:14px;color:var(--text-hint)}

/* =================================================================
   Pricing Check Card (P0-4: AI定价检测)
   ================================================================= */
.pricing-check-card{
  background:var(--card);border-radius:var(--radius-sm);padding:12px 14px;
  margin:10px 0;border-left:3px solid var(--info);
  font-size:13px;display:none;
}
.pricing-check-card.show{display:block;animation:fadeSlideIn .3s ease}
.pricing-check-card .price-row{display:flex;justify-content:space-between;padding:4px 0}
.pricing-check-card .price-row .label{color:var(--text-hint);font-size:12px}
.pricing-check-card .price-row .value{font-weight:700;font-family:var(--font-mono)}
.pricing-check-card .price-warn{
  margin-top:8px;padding:8px 10px;border-radius:4px;
  font-size:12px;font-weight:600;
}
.pricing-check-card .price-warn.overpriced{background:#fff0f0;color:var(--danger)}
.pricing-check-card .price-warn.underpriced{background:#fff9e6;color:#e65100}
.pricing-check-card .price-warn.reasonable{background:var(--primary-light);color:var(--primary-dark)}

/* =================================================================
   External Listings (P0-2: 全网货源)
   ================================================================= */
.external-source-badge{
  display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:600;
}
.ext-source-91{background:#e3f2fd;color:#0d47a1}
.ext-source-bianbao{background:#fff3e0;color:#e65100}
.ext-source-zaisubao{background:var(--primary-light);color:var(--primary-dark)}
.ext-listing-card{
  background:var(--card);border-radius:var(--radius);padding:12px 14px;
  margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,0.03);
  border-left:3px solid var(--info-light);
}
.ext-listing-card .ext-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.ext-listing-card .ext-material{font-size:14px;font-weight:700;flex:1}
.ext-listing-card .ext-info{font-size:12px;color:var(--text-secondary);line-height:1.8}
.ext-listing-card .ext-footer{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid var(--border-light);font-size:11px;color:var(--text-hint)}

/* =================================================================
   Quality Breakdown in Match Detail (P0-3: 6维品质)
   ================================================================= */
.quality-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
.quality-item{
  padding:6px 10px;background:var(--bg);border-radius:var(--radius-xs);
  font-size:11px;
}
.quality-item .q-label{color:var(--text-hint);font-size:10px}
.quality-item .q-value{font-weight:700;font-size:13px;color:var(--text)}
.quality-item .q-value.high{color:#e65100}
.quality-item .q-value.mid{color:var(--primary)}
.quality-item .q-value.low{color:var(--text-hint)}
.dim-bars{margin-top:8px}
.dim-bar-row{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.dim-bar-label{font-size:11px;color:var(--text-hint);width:50px;text-align:right;flex-shrink:0}
.dim-bar-track{flex:1;height:8px;background:var(--bg);border-radius:4px;overflow:hidden}
.dim-bar-fill{height:100%;border-radius:4px;transition:width .6s ease}
.dim-bar-score{font-size:11px;font-weight:700;width:36px;text-align:right;flex-shrink:0;font-family:var(--font-mono)}

/* =================================================================
   Loading States
   ================================================================= */
.loading-spinner{
  display:none;align-items:center;justify-content:center;padding:20px;
  flex-direction:column;gap:10px;
}
.loading-spinner.show{display:flex}
.loading-spinner .spinner{
  width:36px;height:36px;border:3px solid var(--border);
  border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite;
}
.loading-spinner .text{font-size:13px;color:var(--text-hint)}
@keyframes spin{to{transform:rotate(360deg)}}
.skeleton{background:linear-gradient(90deg,var(--bg) 25%,#e8e8e8 50%,var(--bg) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:var(--radius-sm)}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.skeleton-line{height:16px;margin-bottom:8px}
.skeleton-card{padding:16px;background:var(--card);border-radius:var(--radius);margin-bottom:10px}
.skeleton-card .skeleton-line:nth-child(1){width:60%}
.skeleton-card .skeleton-line:nth-child(2){width:40%}
.skeleton-card .skeleton-line:nth-child(3){width:80%}
"""

content = content.replace('</style>', NEW_CSS + '\n</style>')

# ============================================================
# 2. HTML — Add camera button in AI input card footer
# ============================================================
# Insert camera button after the send button in the input footer
camera_btn_html = '''        <button class="camera-btn" onclick="switchTab('vision')" title="拍照识别" aria-label="拍照识别">📷</button>'''
content = content.replace(
    '      </div>\n    </div>\n\n    <!-- AI Loading -->',
    '        ' + camera_btn_html + '\n      </div>\n    </div>\n\n    <!-- AI Loading -->'
)

# ============================================================
# 3. HTML — Add external listings sub-tab in market page
# ============================================================
ext_subtab_html = '''
    <div class="quick-filters" style="margin-bottom:12px" id="extMarketFilters" on>
      <span class="quick-chip active" role="button" tabindex="0" onclick="switchMarketTab('waste',this)">废塑料行情</span>
      <span class="quick-chip" role="button" tabindex="0" onclick="switchMarketTab('recycled',this)">再生料行情</span>
      <span class="quick-chip" role="button" tabindex="0" onclick="switchMarketTab('external',this)" style="background:var(--info-light);color:var(--info)">🌐 全网货源</span>
    </div>
'''
# Replace the existing market filters
old_market_filters = '''    <div class="quick-filters" style="margin-bottom:12px">
      <span class="quick-chip active" role="button" tabindex="0" aria-pressed="true" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" onclick="switchMarketTab('waste',this)">废塑料行情</span>
      <span class="quick-chip" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" onclick="switchMarketTab('recycled',this)">再生料行情</span>
    </div>'''
content = content.replace(old_market_filters, ext_subtab_html)

# Also add external listings container in market page
ext_container = '''
    <div id="externalContent" style="display:none">
      <div class="quick-filters" style="margin-bottom:10px">
        <span class="quick-chip active" onclick="filterExternalSource('all',this)">全部来源</span>
        <span class="quick-chip" onclick="filterExternalSource('91再生',this)">91再生</span>
        <span class="quick-chip" onclick="filterExternalSource('变宝网',this)">变宝网</span>
        <span class="quick-chip" onclick="filterExternalSource('再塑宝',this)">再塑宝</span>
      </div>
      <div style="font-size:12px;color:var(--text-hint);margin-bottom:8px" id="extStatus">加载中…</div>
      <div id="extListings"></div>
      <div class="empty-state" id="extEmpty" style="display:none">
        <div class="icon">🌐</div>
        <div class="title">暂无全网货源数据</div>
        <div class="text">采集器正在后台运行，请稍后再试</div>
      </div>
    </div>
'''
content = content.replace('    <div id="marketContent"></div>', '    <div id="marketContent"></div>\n' + ext_container)

# ============================================================
# 4. HTML — Add pricing check row to AI result card
# ============================================================
# Add pricing section after the location row in ai-result template (done in JS)

# ============================================================
# 5. HTML — Add Page: vision (P0-1)
# ============================================================
vision_page = '''
  <!-- ================================================================
       PAGE 7: VISION (拍照识别 - P0-1)
       ================================================================ -->
  <div class="page" id="page-vision">
    <div style="font-size:15px;font-weight:700;margin-bottom:12px">📷 拍照识别废塑料</div>

    <!-- Upload area (shown when no image selected) -->
    <div class="vision-upload-area" id="visionUploadArea" onclick="document.getElementById('visionFileInput').click()">
      <div class="icon">📸</div>
      <div class="text">点击拍照或上传图片</div>
      <div class="hint">支持 JPG/PNG，AI 自动识别品类、颜色、纯度</div>
    </div>
    <input type="file" id="visionFileInput" accept="image/*" capture="environment" style="display:none" onchange="handleVisionImage(event)">

    <!-- Image preview (shown after selection) -->
    <div class="vision-preview" id="visionPreview" style="display:none">
      <img id="visionPreviewImg" src="" alt="预览">
      <button class="retake" onclick="resetVision()">✕ 重新拍摄</button>
    </div>

    <!-- Analyze button -->
    <button class="send-btn" id="visionAnalyzeBtn" style="width:100%;justify-content:center;margin-bottom:16px;display:none" onclick="analyzeVisionImage()">
      <span class="btn-label">🔍 AI 识别</span>
    </button>

    <!-- Loading -->
    <div class="vision-loading" id="visionLoading">
      <div class="spinner"></div>
      <div class="text">AI 正在分析图片中的废塑料…</div>
    </div>

    <!-- Result Card -->
    <div class="vision-result-card" id="visionResult">
      <div class="result-header"><span>✅</span> AI 识别结果</div>
      <div class="result-body" id="visionResultBody"></div>
      <div class="result-actions">
        <button class="btn-confirm secondary" onclick="resetVision()">重新识别</button>
        <button class="btn-confirm primary" id="visionPublishBtn" onclick="fillFormFromVision()">✅ 一键发布</button>
      </div>
    </div>

    <!-- Recognition history -->
    <div style="margin-top:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-hint)">📋 识别记录</div>
      <div id="visionHistory"></div>
      <div class="empty-state" id="visionHistoryEmpty">
        <div class="icon">📷</div>
        <div class="title">暂无识别记录</div>
        <div class="text">拍照后记录将保存在这里</div>
      </div>
    </div>
  </div>
'''

# Insert vision page after chat page (before bottom nav)
# Find the closing chat page div and bottom nav
insert_marker = '  <!-- Bottom Navigation -->'
content = content.replace(insert_marker, vision_page + '\n' + insert_marker)

# ============================================================
# 6. HTML — Bottom nav: add 📷 tab
# ============================================================
# Insert before the closing </nav> tag
vision_tab = '''    <div class="tab" data-page="vision" onclick="switchTab('vision')" role="tab" tabindex="0" aria-selected="false" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();switchTab('vision')}">
      <span class="icon">📷</span>拍照
    </div>
'''
content = content.replace('  </nav>\n</div>', vision_tab + '\n  </nav>\n</div>')


# ============================================================
# 7. JS — Modify switchTab to support vision and external
# ============================================================
# Add vision and external tab handling in switchTab
old_switch_tab_decls = '''  if (tab === 'home') loadHomePage();
  if (tab === 'match') loadMatchPage();
  if (tab === 'market') loadMarketPage();
  if (tab === 'me') loadProfilePage();
  if (tab === 'messages') loadConversations();
  if (tab === 'chat' && state._chatConversationId) loadChat(state._chatConversationId);
}'''
new_switch_tab_decls = '''  if (tab === 'home') loadHomePage();
  if (tab === 'match') loadMatchPage();
  if (tab === 'market') loadMarketPage();
  if (tab === 'me') loadProfilePage();
  if (tab === 'messages') loadConversations();
  if (tab === 'vision') loadVisionHistory();
  if (tab === 'chat' && state._chatConversationId) loadChat(state._chatConversationId);
}'''
content = content.replace(old_switch_tab_decls, new_switch_tab_decls)

# Same for refreshCurrentTab
old_refresh_decls = '''  if (t === 'home') loadHomePage();
  if (t === 'match') loadMatchPage();
  if (t === 'market') loadMarketPage();
  if (t === 'me') loadProfilePage();
  if (t === 'messages') loadConversations();
  if (t === 'chat' && state._chatConversationId) loadChat(state._chatConversationId);
}'''
new_refresh_decls = '''  if (t === 'home') loadHomePage();
  if (t === 'match') loadMatchPage();
  if (t === 'market') loadMarketPage();
  if (t === 'me') loadProfilePage();
  if (t === 'messages') loadConversations();
  if (t === 'vision') loadVisionHistory();
  if (t === 'chat' && state._chatConversationId) loadChat(state._chatConversationId);
}'''
content = content.replace(old_refresh_decls, new_refresh_decls)


# ============================================================
# 8. JS — Enhance processAIInput: add pricing check row
# ============================================================
# After the location row, add pricing check placeholder
old_result_row = '''      <div class="result-row"><span class="label">地点</span><span class="value">${escapeHtml(parsed.location)||'<span style="color:var(--text-hint)">未识别</span>'}</span></div>
      ${extraInfo}'''
new_result_row = '''      <div class="result-row"><span class="label">地点</span><span class="value">${escapeHtml(parsed.location)||'<span style="color:var(--text-hint)">未识别</span>'}</span></div>
      ${extraInfo}
      <div id="pricingCheckRow" style="margin-top:8px;display:none"></div>'''
content = content.replace(old_result_row, new_result_row)

# After the result HTML is set, trigger pricing check (after "resultDiv._parsedData = parsed;")
old_parsed_data = '  resultDiv._parsedData = parsed;\n}'
new_parsed_data = '''  resultDiv._parsedData = parsed;
  // Trigger pricing check if price is detected (P0-4)
  if (parsed.price && parsed.material) {
    checkPricingSuggestion(parsed.material, parsed.price, parsed.location || state.userLocation || '');
  }
}'''
content = content.replace(old_parsed_data, new_parsed_data)


# ============================================================
# 9. JS — Enhance confirmParsedListing: include pricing info
# ============================================================
# already fine


# ============================================================
# 10. JS — Enhance openMatchDetailSheet: 6-dim quality breakdown
# ============================================================
old_match_detail = """  const scorePct = Math.round(m.score || 0);
  const scoreColor = scorePct >= 80 ? 'var(--danger)' : scorePct >= 60 ? '#e65100' : 'var(--primary)';
  const dims = m.dimensionScores || {};"""

new_match_detail = """  const scorePct = Math.round(m.score || 0);
  const scoreColor = scorePct >= 80 ? 'var(--danger)' : scorePct >= 60 ? '#e65100' : 'var(--primary)';
  const breakdown = m.breakdown || {};
  const qualityBreakdown = m.qualityBreakdown || {};

  // Build dimension bar HTML
  const dimLabels = { category: '品类', form: '形态', location: '位置', price: '价格', quantity: '数量', quality: '品质' };
  const dimColors = ['#059652', '#1989fa', '#ffc300', '#fa5151', '#9c27b0', '#ff6d00'];
  let dimBarsHTML = '<div class="dim-bars">';
  let di = 0;
  for (const [key, label] of Object.entries(dimLabels)) {
    const val = Math.round((breakdown[key] || 0));
    const color = dimColors[di % dimColors.length];
    dimBarsHTML += `<div class="dim-bar-row">
      <span class="dim-bar-label">${label}</span>
      <div class="dim-bar-track"><div class="dim-bar-fill" style="width:${val}%;background:${color}"></div></div>
      <span class="dim-bar-score">${val}%</span>
    </div>`;
    di++;
  }
  dimBarsHTML += '</div>';

  // Build quality sub-items
  let qualityHTML = '';
  if (Object.keys(qualityBreakdown).length > 0) {
    const qLabels = { colorCompat: '颜色兼容', gradeCompat: '等级兼容', certOverlap: '认证重叠', purityMatch: '纯度匹配' };
    qualityHTML = '<div class="quality-grid">';
    for (const [qk, ql] of Object.entries(qLabels)) {
      const qv = Math.round((qualityBreakdown[qk] || 0));
      const qCls = qv >= 70 ? 'high' : qv >= 40 ? 'mid' : 'low';
      qualityHTML += `<div class="quality-item"><div class="q-label">${ql}</div><div class="q-value ${qCls}">${qv}%</div></div>`;
    }
    qualityHTML += '</div>';
  }

  const html = `
    <h3 class="sheet-title">匹配详情 #${escapeHtml(m.id)}</h3>
    <div class="score-bar">
      <span class="score-num" style="color:${scoreColor}">${scorePct}%</span>
      <span class="score-detail">综合匹配度</span>
    </div>
    ${dimBarsHTML}
    ${qualityHTML ? '<div style="font-size:11px;color:var(--text-hint);margin-top:10px">品质维度细分</div>' + qualityHTML : ''}"""

content = content.replace(old_match_detail, new_match_detail)

# Also fix the old html assignment — the old code does "const html = ..." right after the dims line
# We need to replace the old html opening with our new one
old_html_open = """
  const html = `
    <h3 class="sheet-title">匹配详情 #${escapeHtml(m.id)}</h3>
    <div class="score-bar">
      <span class="score-num" style="color:${scoreColor}">${scorePct}%</span>
      <span class="score-detail">综合匹配度</span>
    </div>"""
content = content.replace(old_html_open, '\n' + new_match_detail.split('const html')[1] if 'const html' in new_match_detail else '')

# Actually, let me do this more carefully. The new code already includes the html template.

# Fix: Remove the duplicated old html opening
# The new_match_detail already contains "const html =" assignment, so we need to remove the old one
old_score_bar = '''    <h3 class="sheet-title">匹配详情 #${escapeHtml(m.id)}</h3>
    <div class="score-bar">
      <span class="score-num" style="color:${scoreColor}">${scorePct}%</span>
      <span class="score-detail">综合匹配度</span>
    </div>'''
# This old_score_bar should already have been part of the replacement above
# Let's check: the old_match_detail starts with "const scorePct" and new_match_detail contains the full html

# The problem is that the old code had:
#   const dims = ...
#   const html = `...`
# And we replaced the dims line and the html line together

# Actually the replacement only replaced the scorePct/scoreColor/dims lines, and added new content.
# The old html assignment is still there. Let me find and remove it.

# Find the duplicate old html assignment
dup_html = '''    <div class="score-bar">
      <span class="score-num" style="color:${scoreColor}">${scorePct}%</span>
      <span class="score-detail">综合匹配度</span>
    </div>
    <div class="info-grid">'''
# Replace with just info-grid (the dimBars and quality HTML are already above)
content = content.replace(
    '''    <div class="score-bar">
      <span class="score-num" style="color:${scoreColor}">${scorePct}%</span>
      <span class="score-detail">综合匹配度</span>
    </div>
    <div class="info-grid">''',
    '''    <div class="info-grid">''')


# ============================================================
# 11. JS — Add switchMarketTab external support
# ============================================================
old_market_tab = """function switchMarketTab(tab, el) {
  state.marketTab = tab;
  document.querySelectorAll('#page-market .quick-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderMarketContent();
}"""

new_market_tab = """function switchMarketTab(tab, el) {
  state.marketTab = tab;
  document.querySelectorAll('#page-market .quick-filters .quick-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');

  // Toggle external vs market content
  const marketContent = document.getElementById('marketContent');
  const extContent = document.getElementById('externalContent');
  if (tab === 'external') {
    if (marketContent) marketContent.style.display = 'none';
    if (extContent) extContent.style.display = '';
    document.getElementById('marketUpdateTime').style.display = 'none';
    document.getElementById('marketSource').style.display = 'none';
    loadExternalListings();
  } else {
    if (marketContent) marketContent.style.display = '';
    if (extContent) extContent.style.display = 'none';
    document.getElementById('marketUpdateTime').style.display = '';
    document.getElementById('marketSource').style.display = '';
    renderMarketContent();
  }
}"""
content = content.replace(old_market_tab, new_market_tab)


# ============================================================
# 12. JS — Add new P0 functions before the Init section
# ============================================================
new_js_functions = r"""
/* ===================================================================
   SECTION 15: VISION — Image Recognition (P0-1)
   =================================================================== */
let _visionImageData = null;
let _visionResult = null;

function handleVisionImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast('图片大小不能超过10MB', 'error'); return; }

  const reader = new FileReader();
  reader.onload = function(e) {
    _visionImageData = e.target.result;
    document.getElementById('visionPreviewImg').src = _visionImageData;
    document.getElementById('visionUploadArea').style.display = 'none';
    document.getElementById('visionPreview').style.display = '';
    document.getElementById('visionAnalyzeBtn').style.display = '';
    document.getElementById('visionResult').classList.remove('show');
    _visionResult = null;
  };
  reader.readAsDataURL(file);
}

function resetVision() {
  _visionImageData = null;
  _visionResult = null;
  document.getElementById('visionFileInput').value = '';
  document.getElementById('visionUploadArea').style.display = '';
  document.getElementById('visionPreview').style.display = 'none';
  document.getElementById('visionAnalyzeBtn').style.display = 'none';
  document.getElementById('visionResult').classList.remove('show');
  document.getElementById('visionLoading').classList.remove('show');
}

async function analyzeVisionImage() {
  if (!_visionImageData) { showToast('请先选择图片', 'error'); return; }

  const loading = document.getElementById('visionLoading');
  const resultCard = document.getElementById('visionResult');
  const btn = document.getElementById('visionAnalyzeBtn');

  loading.classList.add('show');
  resultCard.classList.remove('show');
  btn.disabled = true;

  try {
    // Convert data URL to blob
    const resp = await fetch(_visionImageData);
    const blob = await resp.blob();
    const formData = new FormData();
    formData.append('image', blob, 'plastic.jpg');

    const data = await api('/api/vision/analyze', {
      method: 'POST',
      body: formData,
      headers: {} // Let browser set Content-Type for FormData
    });

    loading.classList.remove('show');
    btn.disabled = false;

    if (data.success) {
      _visionResult = data;
      renderVisionResult(data);
      // Save to local history
      if (!state._visionHistory) state._visionHistory = [];
      state._visionHistory.unshift({
        material: data.material || '未知',
        color: data.color || '未知',
        form: data.form || '未知',
        purity: data.purity || 0,
        confidence: data.confidence || 0,
        time: Date.now()
      });
      if (state._visionHistory.length > 20) state._visionHistory = state._visionHistory.slice(0, 20);
    } else {
      showToast(data.error || '识别失败，请重试', 'error');
    }
  } catch (e) {
    loading.classList.remove('show');
    btn.disabled = false;
    showToast('识别失败: ' + (e.message || '网络错误'), 'error');
  }
}

function renderVisionResult(data) {
  const body = document.getElementById('visionResultBody');
  const confPct = data.confidence ? Math.round(data.confidence) : 0;
  const confStr = confPct >= 70 ? '高' : confPct >= 40 ? '中' : '低';
  const confColor = confPct >= 70 ? 'var(--primary)' : confPct >= 40 ? '#e65100' : 'var(--text-hint)';

  body.innerHTML = `
    <div class="result-row"><span class="label">品类</span><span class="value">${escapeHtml(data.material || '未知')}</span><span class="conf" style="color:${confColor}">置信度 ${confPct}% (${confStr})</span></div>
    <div class="result-row"><span class="label">颜色</span><span class="value">${escapeHtml(data.color || '未知')}</span></div>
    <div class="result-row"><span class="label">形态</span><span class="value">${escapeHtml(data.form || '未知')}</span></div>
    <div class="result-row"><span class="label">纯度</span><span class="value">${data.purity ? data.purity + '%' : '未知'}</span></div>
    ${data.notes ? '<div style="padding:8px;background:var(--bg);border-radius:4px;margin-top:8px;font-size:12px;color:var(--text-secondary)">📝 ' + escapeHtml(data.notes) + '</div>' : ''}
  `;
  document.getElementById('visionResult').classList.add('show');
}

function fillFormFromVision() {
  if (!_visionResult || !_visionResult.success) { showToast('无识别结果', 'error'); return; }

  const data = _visionResult;
  const materialText = [
    data.material || '',
    data.color || '',
    data.form || ''
  ].filter(Boolean).join(' ');

  // Navigate to home and fill the input
  switchTab('home');
  const aiInput = document.getElementById('aiInput');
  aiInput.value = '我有' + materialText + (data.purity ? ' 纯度' + data.purity + '%' : '');
  aiInput.focus();

  // Optionally auto-submit
  showToast('✅ 已填充到发布框，确认后点击发送', 'success');
}

function loadVisionHistory() {
  if (!state._visionHistory || state._visionHistory.length === 0) {
    document.getElementById('visionHistory').innerHTML = '';
    document.getElementById('visionHistoryEmpty').style.display = 'flex';
    return;
  }
  document.getElementById('visionHistoryEmpty').style.display = 'none';
  document.getElementById('visionHistory').innerHTML = state._visionHistory.map(h => `
    <div class="history-item">
      <div class="raw">📷 ${escapeHtml(h.material)} · ${escapeHtml(h.color)}</div>
      <div class="parsed">
        <span>${escapeHtml(h.material)}</span>
        <span class="arrow">·</span> <span>${escapeHtml(h.form||'未知')}</span>
        <span class="arrow">·</span> <span style="color:var(--primary)">纯度${h.purity||'?'}%</span>
        <span class="arrow">·</span> <span style="color:var(--text-hint)">${timeAgo(new Date(h.time).toISOString())}</span>
      </div>
    </div>`).join('');
}


/* ===================================================================
   SECTION 16: PRICING — AI Price Check (P0-4)
   =================================================================== */
async function checkPricingSuggestion(material, price, location) {
  const row = document.getElementById('pricingCheckRow');
  if (!row) return;

  row.style.display = '';
  row.innerHTML = '<div style="font-size:12px;color:var(--text-hint);padding:8px 0">🔍 正在检测报价合理性…</div>';

  try {
    const params = new URLSearchParams({
      material: material,
      price: price,
      location: location || state.userLocation || ''
    });
    const data = await api('/api/pricing/check?' + params.toString());

    if (data.success && data.suggestion) {
      const s = data.suggestion;
      let warnHtml = '';
      const devPct = Math.abs(s.deviation || 0);
      if (devPct > 30) {
        warnHtml = '<div class="price-warn overpriced">⚠️ 报价严重偏离基准价' + (s.deviation > 0 ? '偏高' : '偏低') + devPct.toFixed(0) + '%</div>';
      } else if (devPct > 15) {
        warnHtml = '<div class="price-warn ' + (s.deviation > 0 ? 'overpriced' : 'underpriced') + '">⚡ 报价' + (s.deviation > 0 ? '偏高' : '偏低') + devPct.toFixed(0) + '%，建议调整</div>';
      } else {
        warnHtml = '<div class="price-warn reasonable">✅ 报价在合理区间内 (±' + devPct.toFixed(0) + '%)</div>';
      }

      row.innerHTML = `
        <div class="pricing-check-card show">
          <div class="price-row"><span class="label">基准价</span><span class="value">¥${s.baseline || '--'}</span></div>
          <div class="price-row"><span class="label">合理区间</span><span class="value" style="font-size:11px">¥${s.rangeLow || '--'} - ¥${s.rangeHigh || '--'}</span></div>
          <div class="price-row"><span class="label">新料参考价</span><span class="value" style="color:var(--info)">¥${s.newMaterialPrice || '--'}</span></div>
          ${s.newMaterialPrice ? `<div class="price-row"><span class="label">再生料溢价</span><span class="value" style="color:var(--text-hint);font-size:11px">${s.recycledPremium || '--'}</span></div>` : ''}
          ${warnHtml}
        </div>`;
    } else {
      row.innerHTML = '<div style="font-size:12px;color:var(--text-hint);padding:8px 0">暂无该品类基准价数据</div>';
    }
  } catch (e) {
    row.innerHTML = '<div style="font-size:12px;color:var(--text-hint);padding:8px 0">定价检测暂不可用</div>';
  }
}


/* ===================================================================
   SECTION 17: EXTERNAL — External Listings (P0-2)
   =================================================================== */
let _externalListings = [];
let _externalFilter = 'all';

async function loadExternalListings() {
  const container = document.getElementById('extListings');
  const empty = document.getElementById('extEmpty');
  const status = document.getElementById('extStatus');

  status.textContent = '正在加载全网货源…';
  container.innerHTML = '';

  try {
    const data = await api('/api/external/listings?limit=50');
    if (data.success && data.listings) {
      _externalListings = data.listings;
      status.textContent = '共' + _externalListings.length + '条全网货源 · 来自91再生/变宝网/再塑宝';
      applyExternalFilter();
    } else {
      status.textContent = '暂无全网货源数据';
      empty.style.display = 'flex';
    }
  } catch (e) {
    status.textContent = '加载失败，请重试';
    empty.style.display = 'flex';
  }
}

function filterExternalSource(source, el) {
  _externalFilter = source;
  document.querySelectorAll('#externalContent .quick-filters .quick-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  applyExternalFilter();
}

function applyExternalFilter() {
  const container = document.getElementById('extListings');
  const empty = document.getElementById('extEmpty');
  const status = document.getElementById('extStatus');

  let filtered = _externalListings;
  if (_externalFilter !== 'all') {
    filtered = _externalListings.filter(l => l.source === _externalFilter);
  }

  status.textContent = '显示' + filtered.length + '条' + (_externalFilter !== 'all' ? ' · ' + _externalFilter : '') + ' · 共' + _externalListings.length + '条';

  if (filtered.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = filtered.map(l => {
    const sourceCls = l.source === '91再生' ? 'ext-source-91' : l.source === '变宝网' ? 'ext-source-bianbao' : 'ext-source-zaisubao';
    return `<div class="ext-listing-card">
      <div class="ext-header">
        <span class="ext-material">${escapeHtml(l.material || '未知')}</span>
        <span class="external-source-badge ${sourceCls}">${escapeHtml(l.source || '')}</span>
      </div>
      <div class="ext-info">
        <strong>${escapeHtml(l.form || '')}</strong> ·
        ${l.quantity ? '<strong>' + escapeHtml(l.quantity) + '吨</strong> · ' : ''}
        ${l.price ? '<strong>¥' + escapeHtml(l.price) + '/吨</strong> · ' : ''}
        ${l.type ? (l.type === 'supply' ? '出售' : '求购') : ''}
      </div>
      <div class="ext-footer">
        <span>📍 ${escapeHtml(l.location || '未知')}</span>
        <span>${l.crawl_time ? timeAgo(l.crawl_time) : ''}</span>
      </div>
    </div>`;
  }).join('');
}


/* ===================================================================
   SECTION 18: QUALITY — 6-dim Score Helpers (P0-3)
   =================================================================== */
// Quality rendering is handled inline in openMatchDetailSheet above


/* ===================================================================
   SECTION 19: INIT EXTENSION — Load vision history from localStorage
   =================================================================== */
// Extend loadSession / init to restore vision history
(function() {
  const origInit = init;
  // Patch init after it's defined
  const _origLoadSession = loadSession;
  const origLoadSessionFn = function() {
    _origLoadSession();
    try {
      const vh = localStorage.getItem('zs5_vision_history');
      if (vh) state._visionHistory = JSON.parse(vh);
    } catch(e) {}
  };
  // We'll override loadSession at the end
})();

// Save vision history periodically
function saveVisionHistory() {
  try {
    if (state._visionHistory) {
      localStorage.setItem('zs5_vision_history', JSON.stringify(state._visionHistory.slice(0, 20)));
    }
  } catch(e) {}
}
"""

# Insert new JS functions before the init() function definition
content = content.replace(
    '/* ===================================================================\n   SECTION 14: INITIALIZATION\n   =================================================================== */',
    new_js_functions + '\n\n/* ===================================================================\n   SECTION 14: INITIALIZATION\n   =================================================================== */'
)

# Patch loadSession to also load vision history
content = content.replace(
    'function loadSession() {',
    '''function loadSession() {
  // Also load vision history
  try {
    const vh = localStorage.getItem('zs5_vision_history');
    if (vh) state._visionHistory = JSON.parse(vh);
  } catch(e) {}
'''
)

# Now write the modified content
with open('前端_app_v5.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"v5 built successfully! {len(content)} chars, {content.count(chr(10))} lines")
