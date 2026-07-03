/**
 * P0-2: 再塑宝 (zaisubao.com) 采集器
 * 专注再生塑料的交易撮合平台
 */

const BaseScraper = require('./base');

class ZaiSuBaoScraper extends BaseScraper {
  constructor() {
    super('再塑宝', {
      baseUrl: 'http://www.zaisubao.com',
      maxPages: 3,
      timeout: 15000,
      retries: 2,
    });
  }

  getListUrl(page) {
    return `${this.baseUrl}/supply/list-${page}.html`;
  }

  parseListingPage(html) {
    const items = [];
    const linkRegex = /<a[^>]*href="(\/supply\/detail\/[^"]*)"[^>]*title="([^"]*)"[^>]*>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      items.push({ url: this.baseUrl + match[1], title: match[2] });
    }
    return items;
  }

  normalize(rawItem) {
    if (!rawItem.title) return null;
    const text = rawItem.title;
    const isDemand = /求购|采购|求|收|买/i.test(text);
    const type = isDemand ? 'demand' : 'supply';
    const material = this._extractMaterial(text);
    if (!material) return null;
    return {
      source: '再塑宝',
      sourceUrl: rawItem.url || '',
      externalId: `zsb_${material}_${type}`,
      type,
      material,
      form: this._extractForm(text),
      quantity: this._extractQuantity(text),
      price: this._extractPrice(text),
      location: this._extractLocation(text),
      notes: text,
      publishedAt: new Date().toISOString().slice(0, 10),
      contactInfo: '',
      extra: { rawTitle: text },
    };
  }

  _extractMaterial(text) {
    const m = text.match(/(PET|PP|PE|HDPE|LDPE|ABS|PC|PS|PA|PVC)[^\d]*([\u4e00-\u9fa5]+)/i);
    if (m) return m[0].trim();
    return text.substring(0, 20);
  }
  _extractForm(text) {
    for (const f of ['瓶砖', '瓶片', '破碎料', '颗粒', '膜', '桶料'])
      if (text.includes(f)) return f;
    return '';
  }
  _extractQuantity(text) {
    const m = text.match(/(\d+[\d\.]*)\s*吨/);
    return m ? parseFloat(m[1]) : null;
  }
  _extractPrice(text) {
    const m = text.match(/(\d{2,5})\s*[元\/吨]/);
    return m ? parseInt(m[1], 10) : null;
  }
  _extractLocation(text) {
    const cities = ['北京', '上海', '广州', '深圳', '天津', '重庆', '杭州', '南京', '成都', '武汉'];
    for (const c of cities) if (text.includes(c)) return c;
    return '';
  }
}

module.exports = ZaiSuBaoScraper;
