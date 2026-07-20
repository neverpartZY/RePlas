/**
 * postbuild-fix.js v6 — 全面 WXSS summer-compiler 兼容修复
 * 
 * 处理所有已知 summer-compiler 不兼容特性：
 * 1. CSS 选择器中文       → 替换为英文类名
 * 2. WXML 动态中文类名    → 替换为英文
 * 3. @keyframes / @-webkit-keyframes → 整块移除
 * 4. :active 伪类         → 含有该伪类的规则整个移除
 * 5. :focus-within 伪类   → 含有该伪类的规则整个移除
 * 6. hsla()               → 替换为 #ffffff
 * 7. linear-gradient()    → 替换为纯色 #07c160
 * 8. gap 属性             → 移除（旧版基础库 flex 不支持）
 * 9. @charset 声明        → 移除
 * 10. transition 属性     → 移除（部分版本不支持）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUILD_DIR = 'dist/build/mp-weixin';

// ==================== 工具函数 ====================

/**
 * 括号计数：从 start 位置开始找到匹配的闭合括号
 * @param {string} str 源字符串
 * @param {number} start 起始位置（在 { 之后）
 * @returns {number} 匹配的 } 位置，未找到返回 -1
 */
function findMatchingBrace(str, start) {
  let depth = 1;
  for (let i = start; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 递归移除所有 @keyframes 和 @-webkit-keyframes 块
 */
function removeKeyframes(css) {
  let result = css;
  let modified = false;
  const patterns = ['@-webkit-keyframes', '@keyframes'];

  for (const pattern of patterns) {
    let searchFrom = 0;
    while (searchFrom < result.length) {
      const idx = result.indexOf(pattern, searchFrom);
      if (idx === -1) break;

      // 找到 { 的位置
      const braceStart = result.indexOf('{', idx);
      if (braceStart === -1) {
        searchFrom = idx + pattern.length;
        continue;
      }

      // 找到匹配的 }
      const braceEnd = findMatchingBrace(result, braceStart + 1);
      if (braceEnd === -1) {
        searchFrom = idx + pattern.length;
        continue;
      }

      // 移除整个 @keyframes ... { ... } 块
      // cutStart: 从 @keyframes 关键词开始（不从文件头开始，避免 minified CSS 全删）
      // 如果前面紧挨一个规则（如 page:after{...}），只移除 @keyframes 本身
      let cutStart = idx;
      // 只有在前面有换行时才回退到换行位置；没有换行（minified）则直接从 idx 开始
      if (cutStart > 0 && result[cutStart - 1] === '\n') {
        cutStart--;
        while (cutStart > 0 && result[cutStart - 1] !== '\n') cutStart--;
      }
      
      let cutEnd = braceEnd + 1;
      // 跳过结尾可能的空白和分号
      while (cutEnd < result.length && (result[cutEnd] === ' ' || result[cutEnd] === '\t' || result[cutEnd] === ';')) cutEnd++;
      if (cutEnd < result.length && result[cutEnd] === '\n') cutEnd++;

      result = result.substring(0, cutStart) + result.substring(cutEnd);
      modified = true;
      searchFrom = cutStart;
    }
  }
  return { css: result, modified };
}

/**
 * 安全地从选择器中移除指定伪类（而非删除整个规则）
 * 策略：在 CSS 选择器部分（{ 之前）将伪类替换为空
 * 
 * 例如：.btn:active → .btn  或  .box:focus-within → .box
 * 
 * 注意：只处理选择器中的伪类（{ 之前），不处理 @keyframes 中的
 * （@keyframes 由 removeKeyframes 单独处理）
 */
function stripPseudoFromSelectors(css, pseudoRegex) {
  let modified = false;
  let result = '';

  // 分段处理：找到每个 { ... } 块，在其选择器部分做替换
  let pos = 0;
  while (pos < css.length) {
    const braceIdx = css.indexOf('{', pos);
    if (braceIdx === -1) {
      result += css.substring(pos);
      break;
    }

    // 提取选择器部分（{ 之前）
    const selectorPart = css.substring(pos, braceIdx);
    
    // 在选择器中替换伪类
    const cleanedSelector = selectorPart.replace(pseudoRegex, '');
    if (cleanedSelector !== selectorPart) {
      modified = true;
    }
    
    // 找到匹配的 }
    const ruleEnd = findMatchingBrace(css, braceIdx + 1);
    if (ruleEnd === -1) {
      result += cleanedSelector + css.substring(braceIdx);
      break;
    }

    result += cleanedSelector + css.substring(braceIdx, ruleEnd + 1);
    pos = ruleEnd + 1;
  }

  return { css: result, modified };
}

/**
 * 移除选择器中的 :active 伪类
 */
function removeActiveRules(css) {
  return stripPseudoFromSelectors(css, /:active\b/g);
}

/**
 * 移除选择器中的 :focus-within 伪类
 */
function removeFocusWithinRules(css) {
  return stripPseudoFromSelectors(css, /:focus-within\b/g);
}

/**
 * 替换 hsla() 为纯色
 */
function replaceHsla(css) {
  let modified = false;
  let result = css;
  // 替换 hsla(h, s%, l%, a) → #ffffff
  if (result.includes('hsla(')) {
    result = result.replace(/hsla\([^)]+\)/g, '#ffffff');
    modified = true;
  }
  return { css: result, modified };
}

/**
 * 替换 linear-gradient() 为纯色兜底
 */
function replaceLinearGradient(css) {
  let modified = false;
  let result = css;
  if (result.includes('linear-gradient')) {
    result = result.replace(/linear-gradient\([^)]+\)/g, '#07c160');
    modified = true;
  }
  return { css: result, modified };
}

/**
 * 移除 gap 属性
 */
function removeGap(css) {
  let modified = false;
  let result = css;
  if (result.includes('gap:')) {
    result = result.replace(/gap\s*:\s*[^;]+;/g, '');
    modified = true;
  }
  return { css: result, modified };
}

/**
 * 移除 @charset 声明
 */
function removeCharset(css) {
  let modified = false;
  let result = css;
  if (result.includes('@charset')) {
    result = result.replace(/@charset\s+["'][^"']*["']\s*;/g, '');
    modified = true;
  }
  return { css: result, modified };
}

/**
 * 移除 transition 属性
 */
function removeTransition(css) {
  let modified = false;
  let result = css;
  if (result.includes('transition')) {
    result = result.replace(/transition\s*:\s*[^;]+;/g, '');
    modified = true;
  }
  return { css: result, modified };
}

// ==================== 主修复流程 ====================

function processWXSS(content) {
  let modified = false;
  let result = content;

  // 修复步骤（按顺序执行）
  const steps = [
    { name: '@charset',    fn: removeCharset },
    { name: '@keyframes',  fn: removeKeyframes },
    { name: ':active',     fn: removeActiveRules },
    { name: ':focus-within', fn: removeFocusWithinRules },
    { name: 'hsla()',      fn: replaceHsla },
    { name: 'linear-gradient', fn: replaceLinearGradient },
    { name: 'gap',         fn: removeGap },
    { name: 'transition',  fn: removeTransition },
  ];

  for (const step of steps) {
    const r = step.fn(result);
    if (r.modified) {
      console.log(`    [${step.name}] cleaned`);
      result = r.css;
      modified = true;
    }
  }

  return { css: result.trim(), modified };
}

// ==================== WXSS 修复 ====================

/**
 * 修复 scoped CSS 选择器：将 [data-v-xxxx] 属性选择器改为 .data-v-xxxx 类选择器
 * 
 * 问题：uni-app v2 编译 mp-weixin 时，data-v-xxxx 被放在 class 属性中：
 *   <view class="page data-v-094a9b8a">
 * 但 CSS 使用属性选择器：
 *   .page[data-v-094a9b8a]{...}
 * 属性选择器 [data-v-xxx] 匹配的是独立 data 属性，不匹配 class 中包含的字符串！
 * 
 * 修复：将 [data-v-xxxx] → .data-v-xxxx（类选择器，能正确匹配 class 中的值）
 */
function fixScopedSelectors(css) {
  let modified = false;
  // 匹配 [data-v-xxxxxxxx] 格式的属性选择器（8位十六进制）
  const result = css.replace(/\[data-v-([a-f0-9]{8})\]/g, '.data-v-$1');
  if (result !== css) {
    modified = true;
    console.log('    [scoped CSS] fixed data-v selectors');
  }
  return { css: result, modified };
}

function fixWXSS(content) {
  // 中文类名替换
  content = content.replace(/\.conf-高/g, '.conf-high');
  content = content.replace(/\.conf-中/g, '.conf-mid');
  content = content.replace(/\.conf-低/g, '.conf-low');

  // 修复 scoped CSS 选择器（最高优先级，必须最先处理）
  const { css: scopedFixed, modified: scopedModified } = fixScopedSelectors(content);
  if (scopedModified) content = scopedFixed;

  // 全面兼容性修复
  const { css, modified: compatModified } = processWXSS(content);
  return compatModified ? css : content;
}

// ==================== WXML 修复 ====================

function fixWXML(content) {
  const pattern = /'conf-'\+parseResult\.details\.confidenceLabel/g;
  content = content.replace(pattern,
    "'conf-'+(parseResult.details.confidenceLabel==='高'?'high':parseResult.details.confidenceLabel==='中'?'mid':'low')");
  return content;
}

// ==================== 执行 ====================

if (!fs.existsSync(BUILD_DIR)) {
  console.error(`Build directory not found: ${BUILD_DIR}`);
  console.log('Make sure to run build first: npm run build:mp-weixin');
  process.exit(1);
}

let fixCount = 0;
let totalFiles = 0;

console.log('=== Post-build Fix v6 ===');
console.log('Scanning WXSS files...');

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath);
    }
  });
}

walkDir(BUILD_DIR, (filePath) => {
  if (filePath.endsWith('.wxss')) {
    totalFiles++;
    let content = fs.readFileSync(filePath, 'utf-8');
    const origLen = content.length;
    const fixed = fixWXSS(content);
    if (fixed !== content) {
      fs.writeFileSync(filePath, fixed, 'utf-8');
      const rel = path.relative(BUILD_DIR, filePath);
      console.log(`  Fixed: ${rel} (${origLen} → ${fixed.length} bytes)`);
      fixCount++;
    }
  }
});

// 处理 WXML
console.log('Scanning WXML files...');
walkDir(BUILD_DIR, (filePath) => {
  if (filePath.endsWith('.wxml')) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const fixed = fixWXML(content);
    if (fixed !== content) {
      fs.writeFileSync(filePath, fixed, 'utf-8');
      const rel = path.relative(BUILD_DIR, filePath);
      console.log(`  Fixed WXML: ${rel}`);
      fixCount++;
    }
  }
});

console.log(`\n=== Done! ${fixCount} WXSS files modified. ===`);
console.log('Cleaned features: @keyframes, :active, :focus-within, hsla(), linear-gradient, gap, transition, @charset');
