/**
 * postbuild-fix.js v5 — WXSS summer-compiler 兼容修复
 * 
 * 微信 summer-compiler 不支持的特性（都会导致排版崩溃）：
 * | 特性 | 后果 |
 * |------|------|
 * | CSS选择器中文 (如.conf-高) | -80056 编译错误 |
 * | @keyframes / @-webkit-keyframes | 整个CSS文件被破坏（无排版） |
 * | :active 伪类 | WXSS 不支持 |
 * | gap 属性 | 旧版基础库不支持 |
 * | @charset 声明 | 干扰 summer-compiler |
 * | hsla() | 可能不支持 |
 * | linear-gradient | 可能不支持 |
 * 
 * 此脚本作为编译后安全兜底，确保即使源码未修复也能正常上传。
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = 'dist/build/mp-weixin';

// 递归遍历目录
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
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

// 移除 @keyframes 等嵌套花括号的 at-rule（用 indexOf 定位，括号计数法匹配嵌套{}）
function removeAtRules(css, modifiedRef) {
  let result = css;
  let searchFrom = 0;
  while (searchFrom < result.length) {
    // 找到 @-webkit-keyframes 或 @keyframes
    const kf1 = result.indexOf('@-webkit-keyframes', searchFrom);
    const kf2 = result.indexOf('@keyframes', searchFrom);
    let startIdx = -1;
    if (kf1 !== -1 && kf2 !== -1) startIdx = Math.min(kf1, kf2);
    else if (kf1 !== -1) startIdx = kf1;
    else if (kf2 !== -1) startIdx = kf2;
    else break;

    // 找到后面的第一个 {
    const braceIdx = result.indexOf('{', startIdx);
    if (braceIdx === -1) { searchFrom = startIdx + 1; continue; }

    // 括号计数法找到匹配的 }
    let depth = 1;
    let endIdx = braceIdx + 1;
    while (endIdx < result.length && depth > 0) {
      if (result[endIdx] === '{') depth++;
      else if (result[endIdx] === '}') depth--;
      endIdx++;
    }

    if (depth === 0) {
      result = result.substring(0, startIdx) + result.substring(endIdx);
      modifiedRef.v = true;
      searchFrom = startIdx; // 从删除位置继续（可能有相邻的另一个 @keyframes）
    } else {
      searchFrom = startIdx + 1;
    }
  }
  return result;
}

// 修复 WXSS
function fixWXSS(content) {
  const modifiedRef = { v: false };
  let result = content;

  // 1. 中文类名替换
  if (result.includes('.conf-高')) { result = result.replace(/\.conf-高/g, '.conf-high'); modifiedRef.v = true; }
  if (result.includes('.conf-中')) { result = result.replace(/\.conf-中/g, '.conf-mid'); modifiedRef.v = true; }
  if (result.includes('.conf-低')) { result = result.replace(/\.conf-低/g, '.conf-low'); modifiedRef.v = true; }

  // 2. 移除 @keyframes 块（含嵌套花括号，会破坏整个CSS文件）
  result = removeAtRules(result, modifiedRef);

  // 3. 移除 animation / -webkit-animation 属性（引用了已删除的 @keyframes）
  if (result.includes('animation')) {
    result = result.replace(/(?:-webkit-)?animation\s*:\s*[^;]+;/g, '');
    modifiedRef.v = true;
  }

  // 4. 移除 :active 伪类规则
  if (result.includes(':active')) {
    result = result.replace(/\}[^}]*:active[^{]*\{[^}]*\}/g, '}');
    modifiedRef.v = true;
  }

  // 5. 移除 @charset 声明
  if (result.includes('@charset')) {
    result = result.replace(/@charset\s+[^;]+;/g, '');
    modifiedRef.v = true;
  }

  // 6. 移除 gap 属性（旧版基础库 flex 不支持 - 改为用 margin 模拟不可行，直接删）
  //    对编译产物做无害处理：gap 静默忽略时子元素仍排列，只是间距变小
  //    gap 在新版基础库已支持，此处仅作保险
  if (result.includes('gap:')) {
    result = result.replace(/gap\s*:\s*[^;]+;/g, '');
    modifiedRef.v = true;
  }

  // 7. linear-gradient 替换为纯色兜底（旧版基础库不支持时会破坏规则）
  if (result.includes('linear-gradient')) {
    result = result.replace(/linear-gradient\([^)]+\)/g, '#07c160');
    modifiedRef.v = true;
  }

  return modifiedRef.v ? result.trim() : content;
}

// 修复 WXML：替换动态绑定产生中文类名的 JS 表达式
function fixWXML(content) {
  let modified = false;
  let result = content;

  const pattern = /'conf-'\+parseResult\.details\.confidenceLabel/g;
  if (pattern.test(result)) {
    result = result.replace(pattern,
      "'conf-'+(parseResult.details.confidenceLabel==='高'?'high':parseResult.details.confidenceLabel==='中'?'mid':'low')");
    modified = true;
  }

  return modified ? result : content;
}

let fixCount = 0;

// 处理所有文件
console.log('Post-build fix: scanning for summer-compiler incompatible features...\n');

walkDir(BUILD_DIR, (filePath) => {
  const ext = path.extname(filePath);
  let content = fs.readFileSync(filePath, 'utf-8');
  let fixed = content;

  if (ext === '.wxss') {
    fixed = fixWXSS(content);
  } else if (ext === '.wxml') {
    fixed = fixWXML(content);
  }

  if (fixed !== content) {
    fs.writeFileSync(filePath, fixed, 'utf-8');
    console.log('  Fixed: ' + path.relative(BUILD_DIR, filePath));
    fixCount++;
  }
});

console.log(`\nPost-build fix complete! ${fixCount} files modified.\n`);
console.log('Fixed: Chinese class names, @keyframes, :active, animation, @charset');

// 退出码：如果有修复，返回0（成功）；否则也返回0
process.exit(0);
