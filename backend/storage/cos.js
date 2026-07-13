/**
 * 腾讯云 COS / CloudBase 存储适配器
 * 用于微信云托管环境，替代本地磁盘存储
 *
 * 微信云托管环境下，CloudBase 会自动注入 TCB_ENV 环境变量，
 * 并使用内置服务账号访问 CloudBase 存储。
 *
 * 环境变量：
 *   COS_BUCKET    — 存储桶名（格式: bucket-appid），云托管自动注入
 *   COS_REGION    — 地域（如 ap-shanghai），云托管自动注入
 *   COS_SECRET_ID / COS_SECRET_KEY — 手动配置时使用
 *   TCB_ENV       — CloudBase 环境 ID（云托管自动注入）
 */

const path = require('path');
const crypto = require('crypto');

// COS SDK 是可选依赖，仅在云托管环境下安装
let COS = null;
try {
  COS = require('cos-nodejs-sdk-v5');
} catch (e) {
  // 本地环境可能未安装
}

let cosClient = null;

function getCOSClient() {
  if (cosClient) return cosClient;
  if (!COS) throw new Error('cos-nodejs-sdk-v5 未安装，请运行: npm install cos-nodejs-sdk-v5');

  const config = {
    SecretId:  process.env.COS_SECRET_ID  || process.env.TENCENTCLOUD_SECRETID  || '',
    SecretKey: process.env.COS_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY || '',
  };

  // 云托管环境：使用内置服务角色，不需要手动配置密钥
  if (!config.SecretId && process.env.TCB_ENV) {
    // 云托管自动注入环境上下文，COS SDK 可通过环境变量自动获取临时凭证
    console.log('[Storage] Using CloudBase managed credentials (TCB_ENV detected)');
  }

  cosClient = new COS(config);
  return cosClient;
}

function getBucket() {
  return process.env.COS_BUCKET || process.env.TCB_STORAGE_BUCKET || '';
}

function getRegion() {
  return process.env.COS_REGION || process.env.TCB_REGION || 'ap-shanghai';
}

/**
 * 生成唯一文件名
 */
function generateFilename(originalName) {
  const ext = path.extname(originalName) || '.jpg';
  const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  return `uploads/vision-${unique}${ext}`;
}

/**
 * 上传文件到 COS
 * @param {Buffer} buffer — 文件内容
 * @param {string} filename — COS 对象键（如 uploads/vision-xxx.jpg）
 * @param {string} mimeType — MIME 类型（如 image/jpeg）
 * @returns {Promise<string>} 文件访问 URL
 */
async function upload(buffer, filename, mimeType) {
  const cos = getCOSClient();
  const Bucket = getBucket();
  const Region = getRegion();
  const Key = filename;

  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket,
      Region,
      Key,
      Body: buffer,
      ContentType: mimeType || 'image/jpeg',
    }, (err, data) => {
      if (err) return reject(err);
      // 构造访问 URL
      const url = `https://${Bucket}.cos.${Region}.myqcloud.com/${Key}`;
      resolve(url);
    });
  });
}

/**
 * 删除 COS 文件
 * @param {string} url — 完整的 COS URL 或对象键
 */
async function remove(url) {
  if (!url) return;
  const cos = getCOSClient();
  const Bucket = getBucket();
  const Region = getRegion();

  // 从 URL 中提取 Key
  let Key = url;
  if (url.startsWith('http')) {
    const u = new URL(url);
    Key = u.pathname.substring(1); // 去掉开头的 /
  }

  return new Promise((resolve, reject) => {
    cos.deleteObject({ Bucket, Region, Key }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * 获取公开访问 URL
 * @param {string} filename — 对象键或文件名
 * @returns {string} 完整 URL
 */
function getURL(filename) {
  if (filename.startsWith('http')) return filename;
  const Bucket = getBucket();
  const Region = getRegion();
  return `https://${Bucket}.cos.${Region}.myqcloud.com/${filename}`;
}

/**
 * Multer 存储引擎 — 使用内存存储，上传后转存 COS
 * 注意：multer memoryStorage，路由处理中需调用 storage.upload()
 */
function getMulterStorage() {
  const multer = require('multer');
  return multer.memoryStorage();
}

module.exports = { upload, remove, getURL, getMulterStorage, generateFilename };
