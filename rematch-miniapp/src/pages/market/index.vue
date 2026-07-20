<template>
  <view class="page">
    <!-- 品类筛选 -->
    <view class="category-filter">
      <scroll-view scroll-x class="category-scroll">
        <view class="category-list">
          <view
            v-for="cat in categories"
            :key="cat.value"
            class="category-item"
            :class="{ active: currentCategory === cat.value }"
            @tap="setCategory(cat.value)"
          >
            {{ cat.label }}
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 简易走势图 -->
    <view class="chart-section card">
      <text class="chart-title">📊 价格走势</text>
      <view class="bar-chart">
        <view
          v-for="(bar, idx) in chartBars"
          :key="idx"
          class="bar-wrapper"
        >
          <view class="bar-outer">
            <view
              class="bar-inner"
              :class="bar.change >= 0 ? 'bar-up' : 'bar-down'"
              :style="{ height: bar.height + 'rpx' }"
            ></view>
          </view>
          <text class="bar-label">{{ bar.name }}</text>
          <text class="bar-price" :class="bar.change >= 0 ? 'text-up' : 'text-down'">
            {{ bar.price }}
          </text>
        </view>
      </view>
    </view>

    <!-- 价格列表 -->
    <view class="price-section">
      <view class="section-title">价格明细</view>
      <PriceRow
        v-for="item in filteredPrices"
        :key="item.name"
        :price="item"
      />
    </view>

    <!-- 空状态 -->
    <view v-if="!loading && filteredPrices.length === 0" class="empty-state">
      <text class="empty-text">暂无该品类行情数据</text>
    </view>
  </view>
</template>

<script>
import PriceRow from '@/components/PriceRow.vue';
import api from '@/utils/api.js';

export default {
  components: {
    PriceRow
  },
  data() {
    return {
      categories: [
        { label: '全部', value: '' },
        { label: 'PET瓶片', value: 'PET瓶片' },
        { label: 'HDPE', value: 'HDPE' },
        { label: 'PP', value: 'PP' },
        { label: 'LDPE', value: 'LDPE' },
        { label: 'ABS', value: 'ABS' },
        { label: 'PS', value: 'PS' },
        { label: 'PC', value: 'PC' },
        { label: 'PA', value: 'PA' },
        { label: 'PVC', value: 'PVC' }
      ],
      currentCategory: '',
      allPrices: [],
      loading: false
    };
  },
  computed: {
    filteredPrices() {
      if (!this.currentCategory) return this.allPrices;
      return this.allPrices.filter(p => p.category === this.currentCategory);
    },
    chartBars() {
      const prices = this.filteredPrices.slice(0, 8);
      const maxPrice = Math.max(...prices.map(p => p.currentPrice), 1);
      return prices.map(p => {
        const shortName = p.name.replace(/[（(].*[）)]/, '').substring(0, 4);
        return {
          name: shortName,
          price: '¥' + p.currentPrice,
          change: p.change,
          height: Math.max(24, Math.round((p.currentPrice / maxPrice) * 200))
        };
      });
    }
  },
  onShow() {
    this.loadPrices();
  },
  onPullDownRefresh() {
    this.loadPrices().then(() => {
      uni.stopPullDownRefresh();
    });
  },
  methods: {
    async loadPrices() {
      this.loading = true;
      try {
        const result = await api.getPrices({ category: this.currentCategory || undefined });
        if (result.success && result.data) {
          this.allPrices = result.data.prices || [];
        }
      } catch (e) {
        console.error('加载价格失败:', e);
      } finally {
        this.loading = false;
      }
    },

    setCategory(value) {
      this.currentCategory = value;
      this.loadPrices();
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

.category-filter {
  background: #FFFFFF;
  padding: 16rpx 0;
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1rpx solid #F0F0F0;
}

.category-scroll {
  width: 100%;
}

.category-list {
  display: flex;
  padding: 0 24rpx;
  white-space: nowrap;
}

.category-item {
  display: inline-block;
  padding: 14rpx 24rpx;
  margin-right: 16rpx;
  font-size: 26rpx;
  color: #666;
  background: #F5F5F5;
  border-radius: 32rpx;
  transition: all 0.2s;

  &.active {
    color: #FFFFFF;
    background: #07C160;
    font-weight: 500;
  }
}

.chart-section {
  margin: 24rpx;
}

.chart-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: block;
  margin-bottom: 24rpx;
}

.bar-chart {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 16rpx 0;
  height: 300rpx;
  overflow-x: auto;
}

.bar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 80rpx;
}

.bar-outer {
  height: 220rpx;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bar-inner {
  width: 48rpx;
  border-radius: 8rpx 8rpx 0 0;
  min-height: 8rpx;
  transition: height 0.4s ease;

  &.bar-up {
    background: linear-gradient(180deg, #FA5151, #ff7875);
  }
  &.bar-down {
    background: linear-gradient(180deg, #07C160, #69e0a2);
  }
}

.bar-label {
  font-size: 18rpx;
  color: #999;
  margin-top: 8rpx;
  white-space: nowrap;
}

.bar-price {
  font-size: 18rpx;
  font-weight: 500;
  margin-top: 4rpx;
}

.text-up {
  color: #FA5151;
}

.text-down {
  color: #07C160;
}

.price-section {
  margin: 0 24rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
  margin-bottom: 16rpx;
}

.card {
  background: #FFFFFF;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
  padding: 24rpx;
}

.empty-state {
  display: flex;
  justify-content: center;
  padding: 80rpx 0;
}

.empty-text {
  font-size: 26rpx;
  color: #999;
}
</style>
