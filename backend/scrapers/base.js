/**
 * P0-2: 全网多平台匹配 — 采集器基类
 *
 * 所有外部站点采集器继承此类，统一处理：
 * - HTTP 请求（含 User-Agent / 超时 / 重试）
 * - 数据标准化（格式化为统一结构）
 * - 去重与缓存
 * - 错误处理与日志
 */

const https = require('https');
const http = require('http');

// 浏览器 User-Agent 池（避免被反爬）
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

class BaseScraper {
  constructor(name, config = {}) {
    this.name = name;
    this.baseUrl = config.baseUrl || '';
    this.source = config.source || name;
    this.enabled = config.enabled !== false;
    this.maxPages = config.maxPages || 3;
    this.timeout = config.timeout || 15000;
    this.retries = config.retries || 2;
    this.cache = new Map();
    this.cacheTTL = config.cacheTTL || 3600000; // 1 hour
  }

  /**
   * 获取请求头
   */
  getHeaders() {
    return {
      'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    };
  }

  /**
   * HTTP GET 请求（含重试）
   */
  async fetch(url, options = {}) {
    // 缓存检查
    const cacheKey = url;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < this.cacheTTL) {
      return cached.data;
    }

    const maxRetries = options.retries || this.retries;
    const timeout = options.timeout || this.timeout;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = await this._doFetch(url, timeout);
        // 缓存
        this.cache.set(cacheKey, { data, time: Date.now() });
        return data;
      } catch (err) {
        if (attempt === maxRetries) throw err;
        // 指数退避
        await this._sleep(Math.min(1000 * Math.pow(2, attempt), 8000));
      }
    }
  }

  /**
   * 底层 HTTP 请求
   */
  _doFetch(url, timeout) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const req = client.get(url, {
        headers: this.getHeaders(),
        timeout,
      }, (res) => {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${urlObj.protocol}//${urlObj.host}${res.headers.location}`;
          return this._doFetch(redirectUrl, timeout).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve(body);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout: ${url}`));
      });
    });
  }

  /**
   * 标准化为统一供需格式
   * 子类必须实现此方法
   *
   * @param {Object} rawItem - 原始数据项
   * @returns {Object|null} 标准化后的 listing 对象:
   *   {
   *     source: string,        // 来源站名
   *     sourceUrl: string,     // 原始URL
   *     type: 'supply'|'demand',
   *     material: string,      // 标准化品类名
   *     form: string,          // 形态
   *     quantity: number|null, // 数量（吨）
   *     price: number|null,    // 价格（元/吨）
   *     location: string,      // 地点
   *     notes: string,         // 原文描述
   *     publishedAt: string,   // 发布时间 ISO8601
   *     contactInfo: string,   // 联系方式（如果公开）
   *     extra: Object,         // 其他元数据
   *   }
   */
  normalize(rawItem) {
    throw new Error('normalize() must be implemented by subclass');
  }

  /**
   * 解析页面提取数据项列表
   * 子类必须实现此方法
   *
   * @param {string} html - 页面HTML
   * @returns {Array} 原始数据项数组
   */
  parseListingPage(html) {
    throw new Error('parseListingPage() must be implemented by subclass');
  }

  /**
   * 获取列表页URL
   * @param {number} page - 页码
   */
  getListUrl(page) {
    throw new Error('getListUrl() must be implemented by subclass');
  }

  /**
   * 执行采集
   * @returns {Array} 标准化后的 listings
   */
  async scrape() {
    if (!this.enabled) {
      console.log(`[Scraper:${this.name}] Disabled, skipping`);
      return [];
    }

    console.log(`[Scraper:${this.name}] Starting scrape...`);
    const allItems = [];
    const seenIds = new Set();

    for (let page = 1; page <= this.maxPages; page++) {
      try {
        const url = this.getListUrl(page);
        console.log(`[Scraper:${this.name}] Fetching page ${page}: ${url}`);

        const html = await this.fetch(url);
        const rawItems = this.parseListingPage(html);

        let newCount = 0;
        for (const item of rawItems) {
          try {
            const normalized = this.normalize(item);
            if (!normalized) continue;

            // 去重（基于 material+location+price 哈希）
            const dedupKey = `${normalized.material}|${normalized.location}|${normalized.price}`;
            if (seenIds.has(dedupKey)) continue;
            seenIds.add(dedupKey);

            allItems.push(normalized);
            newCount++;
          } catch (e) {
            // 单项解析失败不影响整体
            if (process.env.DEBUG_SCRAPER) {
              console.error(`[Scraper:${this.name}] Item parse error:`, e.message);
            }
          }
        }

        console.log(`[Scraper:${this.name}] Page ${page}: ${newCount} new items`);

        // 避免请求过快
        await this._sleep(2000);
      } catch (err) {
        console.error(`[Scraper:${this.name}] Page ${page} failed:`, err.message);
        break; // 页面失败则停止翻页
      }
    }

    console.log(`[Scraper:${this.name}] Done: ${allItems.length} total items`);
    return allItems;
  }

  /**
   * 睡眠
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BaseScraper;
