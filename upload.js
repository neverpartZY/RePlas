/**
 * 微信小程序上传脚本 (miniprogram-ci)
 * 
 * 使用前请：
 * 1. 访问 https://mp.weixin.qq.com → 管理 → 开发管理 → 开发设置 → 小程序代码上传
 * 2. 生成「代码上传密钥」，下载后放到本目录，命名为 private.wxa2faf03e11d14fed.key
 * 3. 配置 IP 白名单（推荐开启）
 * 
 * 用法: node upload.js [版本号] [备注]
 * 示例: node upload.js 1.0.0 "修复排序bug"
 */

const ci = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

// ========== 配置 ==========
const CONFIG = {
  appid: 'wxa2faf03e11d14fed',
  projectPath: path.resolve(__dirname, 'dist/build/mp-weixin'),
  privateKeyPath: path.resolve(__dirname, 'private.wxa2faf03e11d14fed.key'),
  type: 'miniProgram',
};

// ========== 参数 ==========
const version = process.argv[2] || '1.0.0';
const desc = process.argv[3] || 'via miniprogram-ci';
const robot = parseInt(process.argv[4]) || 1;

// ========== 检查私钥 ==========
if (!fs.existsSync(CONFIG.privateKeyPath)) {
  console.error('\n❌ 未找到私钥文件: ' + CONFIG.privateKeyPath);
  console.error('\n请按以下步骤操作：');
  console.error('1. 访问 https://mp.weixin.qq.com');
  console.error('2. 管理 → 开发管理 → 开发设置 → 小程序代码上传');
  console.error('3. 点击「生成」代码上传密钥');
  console.error('4. 下载后放到本目录，重命名为 private.wxa2faf03e11d14fed.key');
  console.error('5. 建议开启 IP 白名单\n');
  process.exit(1);
}

// ========== 检查编译产物 ==========
if (!fs.existsSync(path.join(CONFIG.projectPath, 'app.json'))) {
  console.error('\n❌ 未找到编译产物，请先运行: npm run build:mp-weixin\n');
  process.exit(1);
}

// ========== 上传 ==========
(async () => {
  console.log(`\n📤 正在上传小程序...`);
  console.log(`   AppID: ${CONFIG.appid}`);
  console.log(`   版本: ${version}`);
  console.log(`   备注: ${desc}`);
  console.log(`   机器人: ${robot}\n`);

  const project = new ci.Project({
    appid: CONFIG.appid,
    type: CONFIG.type,
    projectPath: CONFIG.projectPath,
    privateKeyPath: CONFIG.privateKeyPath,
    ignores: ['node_modules/**/*'],
  });

  try {
    const uploadResult = await ci.upload({
      project,
      version,
      desc,
      robot,
      setting: {
        es6: true,
        es7: false,
        minifyJS: true,
        minifyWXML: true,
        minifyWXSS: false,
        minify: false,
        codeProtect: false,
        autoPrefixWXSS: true,
      },
      onProgressUpdate: (info) => {
        // 进度回调
        if (info && info.status !== 'done') {
          process.stdout.write('.');
        }
      },
    });

    console.log('\n\n✅ 上传成功！\n');
    console.log('包信息:');
    if (uploadResult.subPackageInfo) {
      uploadResult.subPackageInfo.forEach(pkg => {
        const sizeKB = (pkg.size / 1024).toFixed(1);
        console.log(`  ${pkg.name}: ${sizeKB} KB`);
      });
    }
    console.log('\n请登录微信公众平台 → 版本管理 → 提交审核\n');
  } catch (err) {
    console.error('\n❌ 上传失败: ' + err.message);
    console.error('\n常见问题：');
    console.error('1. 私钥文件是否正确');
    console.error('2. IP 白名单是否包含当前 IP');
    console.error('3. 版本号是否递增');
    process.exit(1);
  }
})();
