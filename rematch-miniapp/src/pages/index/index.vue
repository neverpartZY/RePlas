<template>
  <view class="page">
    <!-- ==================== AI 输入核心区 (50% of screen) ==================== -->
    <view class="ai-input-zone">
      <view class="ai-greeting">
        <text class="greeting-text">{{ greetingText }}</text>
      </view>

      <!-- AI 输入框 -->
      <view class="ai-input-wrapper">
        <view class="ai-input-box">
          <text class="ai-icon-main">🤖</text>
          <input
            class="ai-text-input"
            type="text"
            v-model="inputText"
            :placeholder="inputPlaceholder"
            placeholder-style="color:#999;font-size:30rpx;"
            confirm-type="send"
            @confirm="handleSubmit"
            @focus="onInputFocus"
            @blur="onInputBlur"
          />
        </view>

        <!-- 三个功能图标按钮 -->
        <view class="ai-toolbar">
          <view class="tool-btn" @tap="handleVoice">
            <text class="tool-icon">🎤</text>
            <text class="tool-label">语音</text>
          </view>
          <view class="tool-btn" @tap="handlePhoto">
            <text class="tool-icon">📸</text>
            <text class="tool-label">拍照</text>
          </view>
          <view class="tool-btn" @tap="handleFile">
            <text class="tool-icon">📎</text>
            <text class="tool-label">文件</text>
          </view>
        </view>

        <!-- 示例提示 -->
        <view class="ai-hints">
          <text class="hint-label">💡 试试说：</text>
          <text class="hint-example">"我有30吨三色瓶砖在定州5800出"</text>
        </view>
      </view>
    </view>

    <!-- ==================== 快捷操作芯片 ==================== -->
    <view class="quick-chips-section">
      <scroll-view scroll-x class="chips-scroll">
        <view class="chips-list">
          <view
            class="chip-item"
            :class="{ 'chip-active': activeChip === 'sell_waste' }"
            @tap="setQuickAction('sell_waste')"
          >
            <text class="chip-icon">🏷️</text>
            <text class="chip-text">我要卖废料</text>
          </view>
          <view
            class="chip-item"
            :class="{ 'chip-active': activeChip === 'buy_waste' }"
            @tap="setQuickAction('buy_waste')"
          >
            <text class="chip-icon">🛒</text>
            <text class="chip-text">我要买废料</text>
          </view>
          <view
            class="chip-item"
            :class="{ 'chip-active': activeChip === 'sell_recycled' }"
            @tap="setQuickAction('sell_recycled')"
          >
            <text class="chip-icon">♻️</text>
            <text class="chip-text">我卖再生料</text>
          </view>
          <view
            class="chip-item"
            :class="{ 'chip-active': activeChip === 'buy_recycled' }"
            @tap="setQuickAction('buy_recycled')"
          >
            <text class="chip-icon">📦</text>
            <text class="chip-text">我买再生料</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ==================== 统计 + 诊断行 ==================== -->
    <view class="stats-row">
      <view class="stat-item" @tap="goMine('supplies')">
        <text class="stat-value">{{ stats.myPosts }}</text>
        <text class="stat-label">我的供求</text>
      </view>
      <view class="stat-item" @tap="goMatch">
        <text class="stat-value highlight">{{ stats.totalMatches }}</text>
        <text class="stat-label">全网匹配</text>
      </view>
      <view class="stat-item">
        <text class="stat-value">{{ stats.dataSources }}</text>
        <text class="stat-label">数据源</text>
      </view>
    </view>

    <!-- 🔧 诊断面板：显示各 API 调用状态 -->
    <view class="diag-bar" v-if="diag.visible">
      <view class="diag-header" @tap="diag.expanded = !diag.expanded">
        <text class="diag-title">{{ diag.summary }}</text>
        <text class="diag-toggle">{{ diag.expanded ? '▲' : '▼' }}</text>
      </view>
      <view class="diag-body" v-if="diag.expanded">
        <view class="diag-row" v-for="item in diag.items" :key="item.name">
          <text class="diag-label">{{ item.name }}</text>
          <text class="diag-status" :class="item.ok ? 'diag-ok' : 'diag-fail'">{{ item.ok ? 'OK ' + (item.count || '') : item.error }}</text>
        </view>
        <view class="diag-retry" @tap="loadData">🔄 点击重试</view>
      </view>
    </view>

    <!-- ==================== 最新挂牌列表 ==================== -->
    <view class="section latest-listings">
      <view class="section-header">
        <text class="section-title">📋 最新挂牌</text>
        <text class="section-more" @tap="goMatch">查看全部 →</text>
      </view>
      <view v-if="latestSupplies.length === 0 && latestDemands.length === 0" class="empty-mini">
        <text class="empty-text">暂无最新挂牌信息</text>
      </view>
      <view v-else class="listings-scroll">
        <view
          v-for="item in combinedListings"
          :key="item._id"
          class="listing-item"
          @tap="showListingDetail(item)"
        >
          <view class="listing-badge" :class="item._type === 'supply' ? 'badge-supply' : 'badge-demand'">
            <text>{{ item._type === 'supply' ? '供' : '求' }}</text>
          </view>
          <view class="listing-info">
            <text class="listing-title">{{ item.category || '未知品类' }}</text>
            <text class="listing-sub">{{ item.location || '' }} · {{ (item.quantity || item.monthlyVolume || '') + '吨' }}</text>
          </view>
          <text class="listing-price" v-if="item.price || item.budget">¥{{ item.price || item.budget }}/吨</text>
        </view>
      </view>
    </view>

    <!-- ==================== 行情速览 (4品类) ==================== -->
    <view class="section price-snapshot">
      <view class="section-header">
        <text class="section-title">📈 行情速览</text>
        <text class="section-more" @tap="goMarket">更多行情 →</text>
      </view>
      <view class="price-grid">
        <PriceRow
          v-for="item in priceSnapshot"
          :key="item.name || item.category"
          :price="item"
          compact
        />
      </view>
    </view>

    <!-- ==================== AI解析结果弹窗 ==================== -->
    <view class="result-overlay" v-if="parseResult" @tap="closeParseResult">
      <view class="result-sheet" @tap.stop>
        <view class="result-header">
          <text class="result-title">🤖 AI解析结果</text>
          <view class="result-confidence" :class="'conf-' + confLabelMap[parseResult.details.confidenceLabel]">
            <text>{{ parseResult.details.confidenceLabel }}置信度 · {{ Math.round(parseResult.confidence * 100) }}%</text>
          </view>
        </view>

        <view class="result-interpretation">
          <text class="interp-text">{{ parseResult.interpreted }}</text>
        </view>

        <view class="result-fields">
          <view class="field-row" v-if="parseResult.details.directionLabel">
            <text class="field-label">方向</text>
            <text class="field-value">{{ parseResult.details.directionLabel }}</text>
          </view>
          <view class="field-row" v-if="parseResult.details.materialTypeLabel">
            <text class="field-label">类型</text>
            <text class="field-value">{{ parseResult.details.materialTypeLabel }}</text>
          </view>
          <view class="field-row" v-if="parseResult.category">
            <text class="field-label">品类</text>
            <text class="field-value">{{ parseResult.category }}</text>
          </view>
          <view class="field-row" v-if="parseResult.quantity">
            <text class="field-label">数量</text>
            <text class="field-value">{{ parseResult.quantity }} 吨</text>
          </view>
          <view class="field-row" v-if="parseResult.price">
            <text class="field-label">单价</text>
            <text class="field-value">¥{{ parseResult.price }}/吨</text>
          </view>
          <view class="field-row" v-if="parseResult.location">
            <text class="field-label">地点</text>
            <text class="field-value">{{ parseResult.location }}</text>
          </view>
          <view class="field-row" v-if="parseResult.form">
            <text class="field-label">形态</text>
            <text class="field-value">{{ parseResult.form }}</text>
          </view>
        </view>

        <view class="result-actions">
          <view class="btn btn-outline" @tap="closeParseResult">
            <text>修改</text>
          </view>
          <view class="btn btn-primary" @tap="confirmParseResult">
            <text>确认发布</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import PriceRow from '@/components/PriceRow.vue';
import aiParse from '@/utils/ai-parser.js';
import api from '@/utils/api.js';
import { computeMatchScore } from '@/utils/match.js';
import storage from '@/utils/storage.js';

export default {
  components: {
    PriceRow
  },
  data() {
    return {
      greetingText: '你好，今天要做什么？',
      inputText: '',
      inputPlaceholder: '说句话、拍张照、传个文件...',
      activeChip: '',
      userRole: '',
      stats: {
        myPosts: 0,
        totalMatches: 0,
        dataSources: 3
      },
      latestSupplies: [],
      latestDemands: [],
      priceSnapshot: [],
      parseResult: null,
      confLabelMap: { '高': 'high', '中': 'mid', '低': 'low' },
      // 🔧 诊断状态
      diag: {
        visible: false,
        expanded: false,
        summary: '',
        items: [],
      },
      cloudOk: false,
      loading: false,
    };
  },
  computed: {
    combinedListings() {
      const list = [];
      (this.latestSupplies || []).slice(0, 2).forEach(s => {
        list.push({ ...s, _type: 'supply' });
      });
      (this.latestDemands || []).slice(0, 2).forEach(d => {
        list.push({ ...d, _type: 'demand' });
      });
      return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 4);
    }
  },
  onShow() {
    this.loadData();
    this.updateGreeting();
  },
  methods: {
    // ============ 数据加载 ============
    async loadData() {
      this.loading = true;
      const diagItems = [];
      let localOk = 0, backendOk = 0, externalOk = 0, pricesOk = 0;

      // 检查云环境
      this.cloudOk = !!(typeof wx !== 'undefined' && wx.cloud);
      diagItems.push({ name: '微信云环境', ok: this.cloudOk, error: this.cloudOk ? '已就绪' : '未初始化 cloud' });

      // 1. 本地缓存（用户自己发布的数据）
      try {
        const supplies = uni.getStorageSync('rematch_supplies');
        const demands = uni.getStorageSync('rematch_demands');
        const supList = supplies ? JSON.parse(supplies) : [];
        const demList = demands ? JSON.parse(demands) : [];
        this.stats.myPosts = supList.length + demList.length;
        this.latestSupplies = supList.slice(-5).reverse();
        this.latestDemands = demList.slice(-5).reverse();
        localOk = supList.length + demList.length;
        diagItems.push({ name: '本地缓存', ok: true, count: localOk + '条' });
      } catch (e) {
        diagItems.push({ name: '本地缓存', ok: false, error: '读取失败' });
      }

      // 2. 从云托管后端获取数据 — 🔴 修复: 独立调用，互不影响
      // 2a. 平台内挂牌
      try {
        const listingsRes = await api.getListings({ limit: 20 });
        if (listingsRes.success && listingsRes.listings && listingsRes.listings.length > 0) {
          backendOk = listingsRes.listings.length;
          const backendListings = listingsRes.listings.map(l => ({
            _id: `backend_${l.id || Math.random()}`,
            _type: l.type === 'demand' ? 'demand' : 'supply',
            category: l.material || l.category || '未知',
            location: l.location || '',
            quantity: l.quantity || 0,
            price: l.price || 0,
            form: l.form || '',
            createdAt: l.created_at || new Date().toISOString()
          }));
          this.mergeBackendListings(backendListings);
          diagItems.push({ name: '平台挂牌', ok: true, count: backendOk + '条' });
        } else {
          diagItems.push({ name: '平台挂牌', ok: false, error: listingsRes.error || '无数据 (code:' + (listingsRes._code || '?') + ')' });
        }
      } catch (e) {
        console.error('[Index] listings 调用失败:', e);
        diagItems.push({ name: '平台挂牌', ok: false, error: '调用异常: ' + (e.error || e.message || 'unknown') });
      }

      // 2b. 全网外部货源
      try {
        const externalRes = await api.getExternalListings({ limit: 20 });
        if (externalRes.success && externalRes.listings && externalRes.listings.length > 0) {
          externalOk = externalRes.listings.length;
          const extListings = externalRes.listings.map(l => ({
            _id: `ext_${l.id || Math.random()}`,
            _type: l.type === 'demand' ? 'demand' : 'supply',
            category: l.material || l.category || '未知',
            location: l.location || '',
            quantity: l.quantity || 0,
            price: l.price || 0,
            source: l.source || '全网',
            createdAt: l.published_at || l.created_at || new Date().toISOString()
          }));
          this.mergeBackendListings(extListings);
          diagItems.push({ name: '全网货源', ok: true, count: externalOk + '条' });
        } else {
          diagItems.push({ name: '全网货源', ok: false, error: externalRes.error || '无数据 (code:' + (externalRes._code || '?') + ')' });
        }
      } catch (e) {
        console.error('[Index] external 调用失败:', e);
        diagItems.push({ name: '全网货源', ok: false, error: '调用异常: ' + (e.error || e.message || 'unknown') });
      }

      // 3. 匹配统计
      try {
        const result = await api.getMatches({ page: 1, pageSize: 1 });
        if (result.success && result.data) {
          this.stats.totalMatches = result.data.total || 0;
        }
      } catch (e) { /* ignore */ }

      // 4. 行情价格
      pricesOk = await this.loadPricesSafe();

      // 生成诊断汇总
      const okCount = (backendOk > 0 ? 1 : 0) + (externalOk > 0 ? 1 : 0) + (pricesOk > 0 ? 1 : 0);
      const failCount = 3 - okCount;
      diagItems.push({ name: '行情价格', ok: pricesOk > 0, count: pricesOk + '品类' });

      if (failCount === 0) {
        this.diag = { visible: false, expanded: false, summary: '', items: [] };
      } else {
        this.diag = {
          visible: true,
          expanded: failCount >= 2, // 2项以上失败自动展开
          summary: failCount >= 3 ? '⚠️ 所有后端API均失败，请检查云环境配置'
                  : failCount >= 2 ? '⚠️ ' + failCount + '项API失败，点击展开查看'
                  : '⚠️ ' + failCount + '项API未返回数据',
          items: diagItems,
        };
      }
      this.loading = false;
    },

    /** 合并后端数据到本地列表 */
    mergeBackendListings(backendListings) {
      const existingIds = new Set();
      this.latestSupplies.forEach(s => existingIds.add(s._id));
      this.latestDemands.forEach(d => existingIds.add(d._id));

      for (const item of backendListings) {
        if (existingIds.has(item._id)) continue;
        existingIds.add(item._id);
        if (item._type === 'demand') {
          this.latestDemands.push(item);
        } else {
          this.latestSupplies.push(item);
        }
      }

      this.latestSupplies.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      this.latestSupplies = this.latestSupplies.slice(0, 10);
      this.latestDemands.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      this.latestDemands = this.latestDemands.slice(0, 10);
    },

    /** 安全加载行情（失败不抛异常） */
    async loadPricesSafe() {
      try {
        const result = await api.getPrices({});
        if (result.success && result.data) {
          const prices = result.data.prices || [];
          const seen = new Set();
          const snapshot = [];
          for (const p of prices) {
            if (!seen.has(p.category || p.name) && snapshot.length < 4) {
              seen.add(p.category || p.name);
              snapshot.push(p);
            }
          }
          if (snapshot.length > 0) {
            this.priceSnapshot = snapshot;
            return snapshot.length;
          }
        }
      } catch (e) {
        console.error('[Index] 行情加载失败:', e);
      }
      // 使用默认行情兜底
      this.priceSnapshot = [
        { name: 'PET瓶片', currentPrice: 5800, change: 150, changePercent: 2.6 },
        { name: 'HDPE粉碎料', currentPrice: 4200, change: -80, changePercent: -1.9 },
        { name: 'PP编织袋', currentPrice: 3100, change: 0, changePercent: 0 },
        { name: 'ABS破碎料', currentPrice: 9500, change: 300, changePercent: 3.2 }
      ];
      return 4; // 默认数据
    },

    updateGreeting() {
      const hour = new Date().getHours();
      if (hour < 6) this.greetingText = '夜深了，注意休息 🌙';
      else if (hour < 9) this.greetingText = '早上好，开启新的一天 ☀️';
      else if (hour < 12) this.greetingText = '上午好，今天有什么好料？';
      else if (hour < 14) this.greetingText = '中午好，别忘了看行情 📊';
      else if (hour < 18) this.greetingText = '下午好，市场机会不错过 💪';
      else this.greetingText = '晚上好，复盘今天的成交 📝';
    },

    // ============ AI输入交互 ============
    onInputFocus() {
      this.inputPlaceholder = '直接输入：XX吨XX料，XX价在XX地...';
    },

    onInputBlur() {
      this.inputPlaceholder = '说句话、拍张照、传个文件...';
    },

    handleSubmit() {
      const text = this.inputText.trim();
      if (!text) {
        uni.showToast({ title: '请输入内容', icon: 'none' });
        return;
      }
      this.runAiParse(text);
    },

    setQuickAction(action) {
      this.activeChip = action;
      switch (action) {
        case 'sell_waste':
          this.userRole = 'supplier';
          this.inputPlaceholder = '描述你要卖的废料：品类、数量、价格、地点...';
          this.inputText = '';
          break;
        case 'buy_waste':
          this.userRole = 'buyer';
          this.inputPlaceholder = '描述你要采购的废料：品类、数量、预算、地点...';
          this.inputText = '';
          break;
        case 'sell_recycled':
          this.userRole = 'supplier';
          this.inputPlaceholder = '描述你卖的再生料：品类、级别、数量、价格...';
          this.inputText = '';
          break;
        case 'buy_recycled':
          this.userRole = 'buyer';
          this.inputPlaceholder = '描述你要买的再生料：品类、用途、数量、预算...';
          this.inputText = '';
          break;
      }
    },

    // ============ 语音 / 拍照 / 文件 ============
    handleVoice() {
      uni.showToast({ title: '语音功能开发中...', icon: 'none' });
      // TODO: 接入微信语音识别
    },

    handlePhoto() {
      uni.chooseImage({
        count: 1,
        success: (res) => {
          uni.showToast({ title: '已选择图片，AI识别开发中...', icon: 'none' });
          // TODO: 上传到云存储并用AI识别图片内容
        }
      });
    },

    handleFile() {
      uni.showToast({ title: '文件上传功能开发中...', icon: 'none' });
      // TODO: 支持微信文件选择
    },

    // ============ AI解析 ============
    async runAiParse(text) {
      uni.showLoading({ title: 'AI解析中...', mask: true });

      // 优先使用后端 DeepSeek AI 解析
      try {
        const remoteResult = await api.parseAI(text, this.userRole);

        if (remoteResult.success && remoteResult.result) {
          uni.hideLoading();
          this.parseResult = remoteResult.result;
          this.saveParseHistory(remoteResult.result, 'deepseek');
          return;
        }

        // 如果 AI 服务不可用（未配置或网络异常），回退到本地规则引擎
        if (!remoteResult.aiAvailable) {
          console.log('[AI] DeepSeek 不可用，使用本地规则引擎');
        }
      } catch (e) {
        console.log('[AI] 远程解析异常，回退本地:', e);
      }

      // 回退：本地规则引擎
      const localResult = aiParse(text, this.userRole);
      uni.hideLoading();

      if (localResult.success) {
        this.parseResult = localResult.result;
        this.saveParseHistory(localResult.result, 'local');
      } else {
        uni.showModal({
          title: '解析提示',
          content: localResult.message + '\n\n请补充品类、数量、价格等信息后重试。',
          showCancel: false
        });
      }
    },

    closeParseResult() {
      this.parseResult = null;
    },

    async confirmParseResult() {
      const r = this.parseResult;
      if (!r) return;

      const data = {
        category: r.category,
        quantity: r.quantity || 0,
        price: r.price || 0,
        location: r.location,
        form: r.form || '',
        specs: r.details ? r.details.materialTypeLabel || '' : r.specs || '',
        direction: r.direction
      };

      // 先写本地（保持离线可用）
      try {
        if (r.direction === 'supply') {
          const supplies = uni.getStorageSync('rematch_supplies');
          const supList = supplies ? JSON.parse(supplies) : [];
          supList.push({
            _id: 'sup_' + Date.now(),
            category: data.category,
            form: data.form,
            quantity: data.quantity,
            price: data.price,
            location: data.location,
            specs: data.specs,
            status: 'active',
            source: 'ai_parse',
            originalText: r.original,
            createdAt: new Date().toISOString()
          });
          uni.setStorageSync('rematch_supplies', JSON.stringify(supList));

          // 同步到后端
          if (api.hasToken()) {
            api.publishSupply(data).catch(e => console.log('[publish] 后端同步失败:', e));
          }
        } else {
          const demands = uni.getStorageSync('rematch_demands');
          const demList = demands ? JSON.parse(demands) : [];
          demList.push({
            _id: 'dem_' + Date.now(),
            category: data.category,
            monthlyVolume: data.quantity,
            budget: data.price,
            location: data.location,
            form: data.form,
            status: 'active',
            source: 'ai_parse',
            originalText: r.original,
            createdAt: new Date().toISOString()
          });
          uni.setStorageSync('rematch_demands', JSON.stringify(demList));

          // 同步到后端
          if (api.hasToken()) {
            api.publishDemand(data).catch(e => console.log('[publish] 后端同步失败:', e));
          }
        }
      } catch (e) {
        console.error('保存失败:', e);
      }

      this.parseResult = null;
      this.inputText = '';
      this.activeChip = '';
      this.userRole = '';

      uni.showToast({ title: '发布成功！', icon: 'success' });
      this.loadData();

      // 跳转到匹配页查看
      setTimeout(() => {
        uni.switchTab({ url: '/pages/match/match' });
      }, 1000);
    },

    saveParseHistory(result, source = 'local') {
      try {
        const history = uni.getStorageSync('rematch_ai_history');
        const list = history ? JSON.parse(history) : [];
        list.unshift({
          id: 'ai_' + Date.now(),
          original: result.original,
          interpreted: result.interpreted,
          category: result.category,
          direction: result.direction,
          confidence: result.confidence,
          source: source,
          createdAt: new Date().toISOString()
        });
        // 只保留最近20条
        uni.setStorageSync('rematch_ai_history', JSON.stringify(list.slice(0, 20)));
      } catch (e) { /* ignore */ }
    },

    // ============ 导航 ============
    goMatch() {
      uni.switchTab({ url: '/pages/match/match' });
    },

    goMarket() {
      uni.switchTab({ url: '/pages/market/index' });
    },

    goMine(tab) {
      uni.switchTab({ url: '/pages/mine/mine' });
    },

    showListingDetail(item) {
      uni.showToast({ title: '详情开发中', icon: 'none' });
    }
  }
};
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #F5F5F5;
  padding-bottom: 40rpx;
}

// ==================== AI输入核心区 (50vh) ====================
.ai-input-zone {
  background: linear-gradient(180deg, #07C160 0%, #06AD56 100%);
  padding: 40rpx 32rpx 48rpx;
  min-height: 48vh;
  display: flex;
  flex-direction: column;
}

.ai-greeting {
  margin-bottom: 24rpx;
}

.greeting-text {
  font-size: 36rpx;
  font-weight: 700;
  color: #FFFFFF;
}

.ai-input-wrapper {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 24rpx;
  padding: 24rpx;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.ai-input-box {
  display: flex;
  align-items: center;
  background: #F9F9F9;
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  border: 2rpx solid #E5E5E5;
  transition: border-color 0.3s;

  &:focus-within {
    border-color: #07C160;
  }
}

.ai-icon-main {
  font-size: 44rpx;
  margin-right: 16rpx;
}

.ai-text-input {
  flex: 1;
  font-size: 30rpx;
  color: #1A1A1A;
  min-height: 48rpx;
}

// 工具栏
.ai-toolbar {
  display: flex;
  justify-content: space-around;
  margin-top: 28rpx;
  padding: 0 16rpx;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16rpx 28rpx;
  border-radius: 16rpx;
  transition: all 0.2s;
}

.tool-icon {
  font-size: 48rpx;
  margin-bottom: 6rpx;
}

.tool-label {
  font-size: 22rpx;
  color: #666;
}

// 示例提示
.ai-hints {
  margin-top: 20rpx;
  padding: 12rpx 16rpx;
  background: #F0FFF5;
  border-radius: 12rpx;
  display: flex;
  flex-direction: column;
}

.hint-label {
  font-size: 22rpx;
  color: #07C160;
  margin-bottom: 4rpx;
}

.hint-example {
  font-size: 24rpx;
  color: #666;
  font-style: italic;
}

// ==================== 快捷操作芯片 ====================
.quick-chips-section {
  background: #FFFFFF;
  padding: 20rpx 0;
  margin-top: -8rpx;
  border-radius: 24rpx 24rpx 0 0;
  position: relative;
  z-index: 2;
}

.chips-scroll {
  width: 100%;
}

.chips-list {
  display: flex;
  padding: 0 24rpx;
  white-space: nowrap;
}

.chip-item {
  display: inline-flex;
  align-items: center;
  padding: 16rpx 28rpx;
  margin-right: 16rpx;
  background: #F5F5F5;
  border-radius: 40rpx;
  font-size: 26rpx;
  color: #333;
  transition: all 0.2s;
}

.chip-item.chip-active {
  background: #07C160;
  color: #FFFFFF;
  font-weight: 600;
  box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.3);
}

.chip-icon {
  font-size: 28rpx;
  margin-right: 8rpx;
}

.chip-text {
  font-size: 26rpx;
}

// ==================== 统计数据行 ====================
.stats-row {
  display: flex;
  background: #FFFFFF;
  padding: 24rpx 32rpx;
  margin: 0;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 40rpx;
  font-weight: 700;
  color: #1A1A1A;
  margin-bottom: 4rpx;

  &.highlight {
    color: #07C160;
  }
}

.stat-label {
  font-size: 22rpx;
  color: #999;
}

// ==================== 通用区块 ====================
.section {
  background: #FFFFFF;
  margin: 16rpx 0;
  padding: 24rpx;

  &.latest-listings,
  &.price-snapshot {
    margin: 16rpx 16rpx;
    border-radius: 16rpx;
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
}

.section-more {
  font-size: 24rpx;
  color: #07C160;
}

// ==================== 最新挂牌 ====================
.listings-scroll {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.listing-item {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F5F5F5;

  &:last-child {
    border-bottom: none;
  }
}

.listing-badge {
  width: 48rpx;
  height: 48rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16rpx;

  &.badge-supply {
    background: rgba(7, 193, 96, 0.1);
    color: #07C160;
  }

  &.badge-demand {
    background: rgba(22, 119, 255, 0.1);
    color: #1677FF;
  }

  text {
    font-size: 22rpx;
    font-weight: 600;
  }
}

.listing-info {
  flex: 1;
}

.listing-title {
  font-size: 28rpx;
  color: #1A1A1A;
  font-weight: 500;
  display: block;
}

.listing-sub {
  font-size: 22rpx;
  color: #999;
  display: block;
  margin-top: 2rpx;
}

.listing-price {
  font-size: 26rpx;
  color: #FA5151;
  font-weight: 600;
}

// ==================== 行情速览 ====================
.price-grid {
  display: flex;
  flex-direction: column;
}

// ==================== AI解析结果弹窗 ====================
.result-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.result-sheet {
  background: #FFFFFF;
  border-radius: 32rpx 32rpx 0 0;
  width: 100%;
  max-height: 80vh;
  padding: 32rpx;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.result-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.result-confidence {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;

  &.conf-high {
    background: rgba(7, 193, 96, 0.1);
    color: #07C160;
  }
  &.conf-mid {
    background: rgba(255, 149, 0, 0.1);
    color: #FF9500;
  }
  &.conf-low {
    background: rgba(250, 81, 81, 0.1);
    color: #FA5151;
  }
}

.result-interpretation {
  background: #F0FFF5;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 24rpx;
}

.interp-text {
  font-size: 28rpx;
  color: #1A1A1A;
  line-height: 1.6;
  font-weight: 500;
}

.result-fields {
  margin-bottom: 24rpx;
}

.field-row {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F5F5F5;

  &:last-child {
    border-bottom: none;
  }
}

.field-label {
  width: 120rpx;
  font-size: 26rpx;
  color: #999;
}

.field-value {
  flex: 1;
  font-size: 26rpx;
  color: #1A1A1A;
  font-weight: 500;
}

.result-actions {
  display: flex;
  gap: 16rpx;
  padding-top: 20rpx;
}

.btn {
  flex: 1;
  padding: 24rpx 0;
  border-radius: 16rpx;
  text-align: center;
  font-size: 30rpx;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-primary {
  background: #07C160;
  color: #FFFFFF;
}

.btn-outline {
  background: #F5F5F5;
  color: #1A1A1A;
  border: 2rpx solid #E5E5E5;
}

// ==================== 诊断面板 ====================
.diag-bar {
  background: #FFF9E6;
  margin: 0 16rpx 16rpx;
  border-radius: 12rpx;
  border: 2rpx solid #FFD666;
  overflow: hidden;
}

.diag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 24rpx;
}

.diag-title {
  font-size: 24rpx;
  color: #D48806;
  font-weight: 500;
}

.diag-toggle {
  font-size: 20rpx;
  color: #D48806;
}

.diag-body {
  padding: 0 24rpx 16rpx;
  border-top: 1rpx solid #FFE58F;
  padding-top: 12rpx;
}

.diag-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8rpx 0;
}

.diag-label {
  font-size: 22rpx;
  color: #666;
}

.diag-status {
  font-size: 22rpx;
  font-weight: 500;

  &.diag-ok {
    color: #07C160;
  }

  &.diag-fail {
    color: #FA5151;
  }
}

.diag-retry {
  text-align: center;
  padding: 12rpx 0;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #1677FF;
  font-weight: 500;
}
.empty-mini {
  padding: 40rpx 0;
  text-align: center;
}

.empty-text {
  font-size: 26rpx;
  color: #999;
}
</style>
