<template>
  <view class="page">
    <!-- ==================== 多源筛选标签 ==================== -->
    <view class="source-filter">
      <scroll-view scroll-x class="source-scroll">
        <view class="source-list">
          <view
            v-for="tab in sourceTabs"
            :key="tab.value"
            class="source-item"
            :class="{ active: currentSource === tab.value }"
            @tap="setSource(tab.value)"
          >
            <text>{{ tab.label }}</text>
            <text class="source-count" v-if="tab.count > 0">({{ tab.count }})</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 匹配分数筛选 -->
    <view class="filter-tabs">
      <scroll-view scroll-x class="filter-scroll">
        <view class="filter-list">
          <view
            v-for="tab in scoreTabs"
            :key="tab.value"
            class="filter-item"
            :class="{ active: currentScore === tab.value }"
            @tap="setScore(tab.value)"
          >
            <text>{{ tab.label }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 匹配列表 -->
    <view v-if="!loading && filteredMatches.length > 0" class="match-list">
      <MatchCard
        v-for="match in filteredMatches"
        :key="match._id"
        :match="match"
        @tap="showMatchDetail(match)"
      />
    </view>

    <!-- 空状态 -->
    <view v-if="!loading && filteredMatches.length === 0" class="empty-state">
      <text class="empty-icon">🔍</text>
      <text class="empty-title">
        {{ currentSource !== 'all' ? '该数据源暂无匹配结果' : '暂无匹配结果' }}
      </text>
      <text class="empty-desc">
        去首页发布一条供需信息，AI会自动为您匹配
      </text>
      <view class="empty-action" @tap="goHome">
        <text>🏠 回首页发布</text>
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading" class="loading-state">
      <view class="loading-spinner"></view>
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 匹配详情弹窗 -->
    <MatchDetail
      v-if="selectedMatch"
      :match="selectedMatch"
      @close="selectedMatch = null"
    />
  </view>
</template>

<script>
import MatchCard from '@/components/MatchCard.vue';
import MatchDetail from '@/components/MatchDetail.vue';
import api from '@/utils/api.js';

export default {
  components: {
    MatchCard,
    MatchDetail
  },
  data() {
    return {
      sourceTabs: [
        { label: '全部', value: 'all', count: 0 },
        { label: '站内匹配', value: 'local', count: 0 },
        { label: '全网匹配', value: 'remote', count: 0 },
        { label: '91再生', value: '91reborn', count: 0 },
        { label: '变宝网', value: 'bianbao', count: 0 },
        { label: '再塑宝', value: 'zaisubao', count: 0 },
        { label: '塑联网', value: 'sulinks', count: 0 },
        { label: '绿塑黄埔', value: 'lvsu', count: 0 },
        { label: '易再生', value: 'ezaisheng', count: 0 },
        { label: '全球再生', value: 'qqzssl', count: 0 },
        { label: 'Feijiu网', value: 'feijiu', count: 0 },
        { label: '其他平台', value: 'other', count: 0 }
      ],
      currentSource: 'all',
      scoreTabs: [
        { label: '全部', value: 'all', min: 0, max: 100 },
        { label: '强烈推荐', value: 'strong', min: 85, max: 100 },
        { label: '推荐', value: 'recommend', min: 70, max: 84 },
        { label: '可考虑', value: 'consider', min: 50, max: 69 }
      ],
      currentScore: 'all',
      allMatches: [],
      loading: false,
      selectedMatch: null
    };
  },
  computed: {
    filteredMatches() {
      let matches = this.allMatches;

      // 按数据源筛选
      if (this.currentSource === 'local') {
        matches = matches.filter(m => m.source === 'local' || !m.source || m.source === '本平台');
      } else if (this.currentSource === 'remote') {
        matches = matches.filter(m => m.source === 'remote' || m.source === '全网');
      } else if (this.currentSource === '91reborn') {
        matches = matches.filter(m => m.source === '91reborn' || m.source === '91再生');
      } else if (this.currentSource === 'bianbao') {
        matches = matches.filter(m => m.source === 'bianbao' || m.source === '变宝网');
      }

      // 按分数筛选
      if (this.currentScore !== 'all') {
        const tab = this.scoreTabs.find(t => t.value === this.currentScore);
        if (tab) {
          matches = matches.filter(m => m.score >= tab.min && m.score <= tab.max);
        }
      }

      return matches;
    }
  },
  onShow() {
    this.loadMatches();
  },
  onPullDownRefresh() {
    this.loadMatches().then(() => {
      uni.stopPullDownRefresh();
    });
  },
  methods: {
    async loadMatches() {
      this.loading = true;
      try {
        const result = await api.getMatches({ page: 1, pageSize: 50 });
        if (result.success && result.data) {
          const matches = result.data.matches || [];
          // 为匹配结果标记来源
          this.allMatches = matches.map(m => ({
            ...m,
            source: m.source || this.inferSource(m)
          }));

          // 更新各数据源计数
          this.sourceTabs[0].count = this.allMatches.length;
          this.sourceTabs[1].count = this.allMatches.filter(m => m.source === 'local' || m.source === '本平台' || !m.source).length;
          this.sourceTabs[2].count = this.allMatches.filter(m => m.source === 'remote' || m.source === '全网').length;
          this.sourceTabs[3].count = this.allMatches.filter(m => m.source === '91reborn' || m.source === '91再生').length;
          this.sourceTabs[4].count = this.allMatches.filter(m => m.source === 'bianbao' || m.source === '变宝网').length;
        }
      } catch (e) {
        console.error('加载匹配失败:', e);
        // 加载本地数据
        this.loadLocalMatches();
      } finally {
        this.loading = false;
      }
    },

    loadLocalMatches() {
      try {
        const data = uni.getStorageSync('rematch_matches');
        const matches = data ? JSON.parse(data) : [];
        this.allMatches = matches.map(m => ({
          ...m,
          source: m.source || '本平台'
        }));
        this.sourceTabs[0].count = this.allMatches.length;
        this.sourceTabs[1].count = this.allMatches.filter(m => m.source === '本平台' || !m.source).length;
        this.sourceTabs[2].count = this.allMatches.filter(m => m.source === '全网').length;
      } catch (e) { /* ignore */ }
    },

    inferSource(match) {
      // 根据匹配数据特征推断来源
      if (match.source) return match.source;
      if (match.supply && match.supply._id && match.supply._id.startsWith('sup_')) return '本平台';
      return '全网';
    },

    setSource(value) {
      this.currentSource = value;
    },

    setScore(value) {
      this.currentScore = value;
    },

    showMatchDetail(match) {
      this.selectedMatch = match;
    },

    goHome() {
      uni.switchTab({ url: '/pages/index/index' });
    }
  }
};
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #F5F5F5;
}

// 数据源筛选
.source-filter {
  background: #FFFFFF;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F0F0F0;
}

.source-scroll {
  width: 100%;
}

.source-list {
  display: flex;
  padding: 0 24rpx;
  white-space: nowrap;
}

.source-item {
  display: inline-flex;
  align-items: center;
  padding: 14rpx 24rpx;
  margin-right: 12rpx;
  font-size: 26rpx;
  color: #666;
  background: #F5F5F5;
  border-radius: 30rpx;
  transition: all 0.2s;

  &.active {
    color: #FFFFFF;
    background: #07C160;
    font-weight: 500;
  }
}

.source-count {
  font-size: 20rpx;
  margin-left: 2rpx;
  opacity: 0.8;
}

// 分数筛选标签
.filter-tabs {
  background: #FFFFFF;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #F0F0F0;
}

.filter-scroll {
  width: 100%;
}

.filter-list {
  display: flex;
  padding: 0 24rpx;
  white-space: nowrap;
}

.filter-item {
  display: inline-flex;
  align-items: center;
  padding: 12rpx 24rpx;
  margin-right: 12rpx;
  font-size: 24rpx;
  color: #999;
  background: #F9F9F9;
  border-radius: 24rpx;
  border: 2rpx solid transparent;
  transition: all 0.2s;

  &.active {
    color: #07C160;
    background: rgba(7, 193, 96, 0.08);
    border-color: #07C160;
    font-weight: 500;
  }
}

// 匹配列表
.match-list {
  padding: 24rpx;
}

// 空状态
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 48rpx;
}

.empty-icon {
  font-size: 80rpx;
  margin-bottom: 24rpx;
}

.empty-title {
  font-size: 32rpx;
  color: #333;
  font-weight: 600;
  margin-bottom: 8rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #999;
  text-align: center;
  margin-bottom: 32rpx;
}

.empty-action {
  padding: 18rpx 48rpx;
  background: #07C160;
  color: #FFFFFF;
  border-radius: 40rpx;
  font-size: 28rpx;
  font-weight: 500;
}

// 加载中
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 48rpx;
}

.loading-spinner {
  width: 60rpx;
  height: 60rpx;
  border: 4rpx solid #E5E5E5;
  border-top-color: #07C160;
  border-radius: 50%;
  margin-bottom: 20rpx;
}

.loading-text {
  font-size: 26rpx;
  color: #999;
}
</style>
