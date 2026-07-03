/**
 * P0-2: 变宝网 (bianbao.net) 采集器
 * 再生资源交易平台，塑料类信息
 */

const BaseScraper = require('./base');

class BianBaoScraper extends BaseScraper {
  constructor() {
    super('变宝网', {
      baseUrl: 'http://www.bianbao.net',
      maxPages: 3,
      timeout: 15000,
      retries: 2,
    });
  }

  getListUrl(page) {
    return `${this.baseUrl}/product/list-1-${page}.html`;
  }

  parseListingPage(html) {
    const items = [];

    // 匹配产品列表项
    const itemRegex = /<li[^>]*class="[^"]*pro-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    const altRegex = /<a[^>]*href="(\/product\/detail[^"]*)"[^>]*title="([^"]*)"[^>]*>/gi;

    let match;
    while ((match = altRegex.exec(html)) !== null) {
      items.push({
        url: this.baseUrl + match[1],
        title: match[2],
      });
    }

    // 另一个可能的结构
    if (items.length === 0) {
      const linkRegex = /<a[^>]*href="(\/chanpin\/[^"]*)"[^>]*>[\s\S]*?<h3[^>]*>(.*?)<\/h3>/gi;
      while ((match = linkRegex.exec(html)) !== null) {
        items.push({
          url: this.baseUrl + match[1],
          title: this._cleanHtml(match[2]),
        });
      }
    }

    return items;
  }

  normalize(rawItem) {
    if (!rawItem.title) return null;
    const text = rawItem.title;

    // 判断供需
    const isDemand = /求购|采购|求|收|买/i.test(text);
    const type = isDemand ? 'demand' : 'supply';

    const material = this._extractMaterial(text);
    if (!material) return null;

    const form = this._extractForm(text);
    const quantity = this._extractQuantity(text);
    const price = this._extractPrice(text);
    const location = this._extractLocation(text);

    return {
      source: '变宝网',
      sourceUrl: rawItem.url || '',
      externalId: `bb_${material}_${location}_${price}_${type}`,
      type,
      material,
      form,
      quantity,
      price,
      location,
      notes: text,
      publishedAt: new Date().toISOString().slice(0, 10),
      contactInfo: '',
      extra: { rawTitle: text },
    };
  }

  // 复用类似的正则提取方法
  _extractMaterial(text) {
    const patterns = [
      /(PET|PP|PE|HDPE|LDPE|ABS|PC|PS|PA6|PA66|PVC|POM|PMMA|EVA)[^\d]*([\u4e00-\u9fa5]*[料|片|砖|粒])/i,
      /([\u4e00-\u9fa5]{2,4})(破碎|粉碎|颗粒|瓶砖|瓶片|打包)/,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[0].trim();
    }
    return text.substring(0, 20);
  }

  _extractForm(text) {
    const forms = ['瓶砖', '瓶片', '破碎料', '颗粒', '粉碎料', '膜', '桶料', '管材料'];
    for (const f of forms) if (text.includes(f)) return f;
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
    const cities = ['北京', '上海', '广州', '深圳', '天津', '重庆', '杭州', '南京',
      '成都', '武汉', '郑州', '西安', '长沙', '合肥', '南昌', '济南', '青岛',
      '石家庄', '保定', '唐山', '东莞', '佛山', '厦门', '福州', '沈阳', '大连'];
    for (const c of cities) if (text.includes(c)) return c;
    return '';
  }

  _cleanHtml(str) {
    return str.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
}

module.exports = BianBaoScraper;
