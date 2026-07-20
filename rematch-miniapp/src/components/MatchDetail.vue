<template>
  <view class="overlay" @tap="close" v-if="visible">
    <view class="sheet" @tap.stop>
      <!-- 头部 -->
      <view class="sheet-header">
        <view class="score-section">
          <view class="big-score-circle" :class="scoreClass">
            <text class="big-score-text">{{ match.score }}%</text>
          </view>
          <text class="match-level">{{ levelLabel }}</text>
        </view>
        <view class="close-btn" @tap="close">
          <text class="close-icon">✕</text>
        </view>
      </view>

      <!-- 五维度打分 -->
      <view class="breakdown-section">
        <text class="section-label">匹配维度分析</text>
        <view class="breakdown-list">
          <view class="breakdown-item" v-for="item in breakdown" :key="item.name">
            <view class="breakdown-header">
              <text class="breakdown-icon">{{ item.icon }}</text>
              <text class="breakdown-name">{{ item.name }}</text>
              <text class="breakdown-score">{{ item.score }}/{{ item.max }}</text>
            </view>
            <view class="progress-bar">
              <view
                class="progress-fill"
                :class="item.score === item.max ? 'fill-full' : (item.score >= item.max * 0.6 ? 'fill-half' : 'fill-low')"
                :style="{ width: (item.score / item.max * 100) + '%' }"
              ></view>
            </view>
          </view>
        </view>
      </view>

      <!-- 企业信息 -->
      <view class="company-section" v-if="hasCompanyInfo">
        <text class="section-label">企业信息</text>
        <view class="company-card">
          <text class="company-name">{{ companyName }}</text>
          <text class="company-location" v-if="companyLocation">📍 {{ companyLocation }}</text>
          <view class="company-tags" v-if="companyTags.length > 0">
            <text class="company-tag" v-for="t in companyTags" :key="t">{{ t }}</text>
          </view>
        </view>
      </view>

      <!-- 供需详情 -->
      <view class="detail-section">
        <view class="detail-col" v-if="supplyDetail">
          <text class="section-label">📤 供应信息</text>
          <view class="detail-card">
            <text class="detail-row">品类：{{ supplyDetail.category }}</text>
            <text class="detail-row">形态：{{ supplyDetail.form }}</text>
            <text class="detail-row">数量：{{ supplyDetail.quantity }} 吨</text>
            <text class="detail-row">价格：¥{{ supplyDetail.price }}/吨</text>
            <text class="detail-row">发货地：{{ supplyDetail.location }}</text>
            <text class="detail-row" v-if="supplyDetail.specs">规格：{{ supplyDetail.specs }}</text>
          </view>
        </view>
        <view class="detail-col" v-if="demandDetail">
          <text class="section-label">📥 需求信息</text>
          <view class="detail-card">
            <text class="detail-row">品类：{{ demandDetail.category }}</text>
            <text class="detail-row">企业：{{ demandDetail.company }}</text>
            <text class="detail-row">月需求：{{ demandDetail.monthlyVolume }} 吨</text>
            <text class="detail-row">预算：¥{{ demandDetail.budget }}/吨</text>
            <text class="detail-row">所在地：{{ demandDetail.location }}</text>
            <text class="detail-row" v-if="demandDetail.application">用途：{{ demandDetail.application }}</text>
          </view>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="actions">
        <view class="btn btn-primary" @tap="handleInquiry">
          <text>💬 询价</text>
        </view>
        <view class="btn btn-secondary" @tap="handleFavorite">
          <text>⭐ 收藏</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getMatchLevel, getScoreBreakdown } from '@/utils/match.js';

export default {
  props: {
    match: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      visible: true
    };
  },
  computed: {
    score() {
      return this.match.score || 0;
    },
    scoreClass() {
      if (this.score >= 85) return 'score-high';
      if (this.score >= 70) return 'score-medium';
      return 'score-low';
    },
    levelLabel() {
      return getMatchLevel(this.score).label;
    },
    supplyDetail() {
      return this.match.supply || this.match.supplyDetail || null;
    },
    demandDetail() {
      return this.match.demand || this.match.demandDetail || null;
    },
    breakdown() {
      const supply = this.supplyDetail || {};
      const demand = this.demandDetail || {};
      return getScoreBreakdown(supply, demand);
    },
    hasCompanyInfo() {
      return !!(this.companyName);
    },
    companyName() {
      return (this.demandDetail && this.demandDetail.company) || '';
    },
    companyLocation() {
      return (this.demandDetail && this.demandDetail.location) || 
             (this.supplyDetail && this.supplyDetail.location) || '';
    },
    companyTags() {
      const tags = [];
      const supply = this.supplyDetail || {};
      const demand = this.demandDetail || {};
      if (supply.form) tags.push(supply.form);
      if (demand.role) tags.push(demand.role);
      if (demand.application) tags.push(demand.application);
      return tags;
    }
  },
  methods: {
    close() {
      this.visible = false;
      this.$emit('close');
    },
    handleInquiry() {
      uni.showToast({
        title: '询价功能开发中',
        icon: 'none',
        duration: 1500
      });
    },
    handleFavorite() {
      uni.showToast({
        title: '已收藏',
        icon: 'success',
        duration: 1500
      });
    }
  }
};
</script>

<style lang="scss" scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.sheet {
  background: #FFFFFF;
  border-radius: 32rpx 32rpx 0 0;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 32rpx 32rpx 24rpx;
  border-bottom: 1rpx solid #F0F0F0;
}

.score-section {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.big-score-circle {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;

  &.score-high {
    background: rgba(7, 193, 96, 0.1);
    border: 5rpx solid #07C160;
  }

  &.score-medium {
    background: rgba(22, 119, 255, 0.1);
    border: 5rpx solid #1677FF;
  }

  &.score-low {
    background: rgba(255, 149, 0, 0.1);
    border: 5rpx solid #FF9500;
  }
}

.big-score-text {
  font-size: 36rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.match-level {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}

.close-btn {
  width: 56rpx;
  height: 56rpx;
  background: #F5F5F5;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-icon {
  font-size: 28rpx;
  color: #999;
}

.breakdown-section {
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #F0F0F0;
}

.section-label {
  font-size: 26rpx;
  font-weight: 600;
  color: #1A1A1A;
  margin-bottom: 16rpx;
  display: block;
}

.breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.breakdown-item {
  display: flex;
  flex-direction: column;
}

.breakdown-header {
  display: flex;
  align-items: center;
  margin-bottom: 8rpx;
}

.breakdown-icon {
  font-size: 28rpx;
  margin-right: 8rpx;
}

.breakdown-name {
  font-size: 24rpx;
  color: #666;
  flex: 1;
}

.breakdown-score {
  font-size: 24rpx;
  font-weight: 600;
  color: #333;
}

.progress-bar {
  height: 8rpx;
  background: #F0F0F0;
  border-radius: 4rpx;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4rpx;
  transition: width 0.4s ease;

  &.fill-full {
    background: linear-gradient(90deg, #07C160, #69e0a2);
  }
  &.fill-half {
    background: linear-gradient(90deg, #1677FF, #85b9ff);
  }
  &.fill-low {
    background: linear-gradient(90deg, #FF9500, #ffc069);
  }
}

.company-section {
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #F0F0F0;
}

.company-card {
  background: #F9F9F9;
  border-radius: 12rpx;
  padding: 20rpx;
}

.company-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: block;
  margin-bottom: 8rpx;
}

.company-location {
  font-size: 24rpx;
  color: #666;
  display: block;
  margin-bottom: 8rpx;
}

.company-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.company-tag {
  font-size: 20rpx;
  color: #07C160;
  background: rgba(7, 193, 96, 0.08);
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.detail-section {
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #F0F0F0;
  display: flex;
  flex-wrap: wrap;
  gap: 24rpx;
}

.detail-col {
  flex: 1;
  min-width: 280rpx;
}

.detail-card {
  background: #F9F9F9;
  border-radius: 12rpx;
  padding: 20rpx;
}

.detail-row {
  font-size: 24rpx;
  color: #444;
  line-height: 1.8;
  display: block;
}

.actions {
  display: flex;
  gap: 24rpx;
  padding: 24rpx 32rpx;
}

.btn {
  flex: 1;
  padding: 24rpx;
  border-radius: 16rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: #07C160;
  color: #FFFFFF;
}

.btn-secondary {
  background: #F5F5F5;
  color: #333;
  border: 2rpx solid #E5E5E5;
}
</style>
