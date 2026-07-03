/**
 * P0-2: 91再生 (91zaisheng.com) 采集器
 * 中国最大的再生资源交易平台之一，塑料类信息丰富
 */

const BaseScraper = require('./base');

class ZaiSheng91Scraper extends BaseScraper {
  constructor() {
    super('91再生', {
      baseUrl: 'http://www.91zaisheng.com',
      maxPages: 3,
      timeout: 15000,
      retries: 2,
    });
  }

  getListUrl(page) {
    // 91再生废塑料列表
    return `${this.baseUrl}/sell/list--1-${page}-0-0-0-0-0-0.html`;
  }

  parseListingPage(html) {
    const items = [];

    // 匹配列表项: <li> 中包含标题/价格/地区/数量等信息
    // 正则匹配常见的91再生列表项结构
    const itemRegex = /<li[^>]*class="[^"]*list-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    // 备用：匹配整个列表中每个条目
    const altRegex = /<div[^>]*class="[^"]*sell-list[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?<span[^>]*>(.*?)<\/span>/gi;

    // 尝试多种匹配方式
    let match;
    while ((match = altRegex.exec(html)) !== null) {
      items.push({
        url: match[1],
        title: this._cleanHtml(match[2]),
      });
    }

    // 如果没匹配到，尝试更宽松的匹配
    if (items.length === 0) {
      const linkRegex = /<a[^>]*href="(\/sell\/detail[^"]*)"[^>]*title="([^"]*)"[^>]*>/gi;
      while ((match = linkRegex.exec(html)) !== null) {
        items.push({
          url: this.baseUrl + match[1],
          title: match[2],
        });
      }
    }

    return items;
  }

  normalize(rawItem) {
    if (!rawItem.title) return null;

    const title = rawItem.title;
    const text = title;

    // 判断供需方向
    const isDemand = /求购|采购|收购|求|收|买/i.test(text);
    const type = isDemand ? 'demand' : 'supply';

    // 提取物料信息
    const material = this._extractMaterial(text);
    if (!material) return null;

    // 提取形态
    const form = this._extractForm(text);

    // 提取数量
    const quantity = this._extractQuantity(text);

    // 提取价格
    const price = this._extractPrice(text);

    // 提取地点
    const location = this._extractLocation(text);

    return {
      source: '91再生',
      sourceUrl: rawItem.url || '',
      externalId: `91_${material}_${location}_${price}_${type}`,
      type,
      material,
      form,
      quantity,
      price,
      location,
      notes: text,
      publishedAt: new Date().toISOString().slice(0, 10),
      contactInfo: '',
      extra: { rawTitle: title },
    };
  }

  // ---- 提取辅助 ---------------------------------------------------------------
  _extractMaterial(text) {
    const patterns = [
      /(PET|PP|PE|HDPE|LDPE|ABS|PC|PS|PA6|PA66|PVC|POM|PMMA|EVA|TPU|EPS|GPPS|HIPS|PA|LLDPE|PBT|PPS|SAN|AS)[^\d]*([\u4e00-\u9fa5]*[料|片|砖|粒|膜|丝|带|桶|管|瓶]+)/i,
      /([\u4e00-\u9fa5]{2,4})(破碎|粉碎|颗粒|瓶砖|瓶片|打包|膜|扎装|编织袋|吨包)/,
      /(三色|蓝白|纯白|杂色|花色|透明)[^\d]*([\u4e00-\u9fa5]{1,3}[瓶|片|料|砖])/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0].trim();
    }
    return text.length > 20 ? text.substring(0, 20) : text;
  }

  _extractForm(text) {
    const forms = ['瓶砖', '瓶片', '破碎料', '颗粒', '粉碎料', '膜', '桶料', '管材料', '打包带', '编织袋', '吨包', '毛料', '废丝', '板材'];
    for (const f of forms) {
      if (text.includes(f)) return f;
    }
    return '';
  }

  _extractQuantity(text) {
    const match = text.match(/(\d+[\d\.]*)\s*吨/);
    if (match) return parseFloat(match[1]);
    const match2 = text.match(/(\d+[\d\.]*)\s*公斤/);
    if (match2) return parseFloat(match2[1]) / 1000;
    return null;
  }

  _extractPrice(text) {
    const match = text.match(/(\d{2,5})\s*[元\/吨]/);
    if (match) return parseInt(match[1], 10);
    const match2 = text.match(/￥(\d{2,5})/);
    if (match2) return parseInt(match2[1], 10);
    const match3 = text.match(/价格[：:]\s*(\d{2,5})/);
    if (match3) return parseInt(match3[1], 10);
    return null;
  }

  _extractLocation(text) {
    const cities = ['北京', '上海', '广州', '深圳', '天津', '重庆', '杭州', '南京',
      '苏州', '宁波', '温州', '石家庄', '保定', '廊坊', '定州', '唐山', '邢台',
      '临沂', '济南', '青岛', '烟台', '郑州', '洛阳', '武汉', '长沙', '成都',
      '西安', '东莞', '佛山', '中山', '福州', '厦门', '合肥', '南昌', '沈阳',
      '大连', '哈尔滨', '长春', '昆明', '贵阳', '南宁', '太原', '兰州', '乌鲁木齐'];

    for (const city of cities) {
      if (text.includes(city)) {
        const idx = text.indexOf(city);
        const prefix = text.substring(Math.max(0, idx - 4), idx);
        // 查找省份
        const provinces = ['河北', '山东', '河南', '江苏', '浙江', '广东', '福建',
          '湖北', '湖南', '安徽', '四川', '辽宁', '黑龙江', '吉林', '陕西', '山西',
          '江西', '云南', '贵州', '广西', '甘肃', '内蒙古', '新疆'];
        for (const prov of provinces) {
          if (prefix.includes(prov)) return prov + city;
        }
        return city;
      }
    }
    return '';
  }

  _cleanHtml(str) {
    return str.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
}

module.exports = ZaiSheng91Scraper;
