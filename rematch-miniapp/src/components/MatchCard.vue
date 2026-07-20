<template>
  <view class="match-card" @tap="$emit('tap')">
    <view class="card-top">
      <!-- 分数圆环 -->
      <view class="score-circle" :class="scoreClass">
        <text class="score-value">{{ match.score }}%</text>
      </view>
      <!-- 关键信息 -->
      <view class="card-info">
        <view class="card-title-row">
          <text class="card-title">{{ cardTitle }}</text>
          <!-- 来源标签 -->
          <text class="source-badge" :class="sourceClass">{{ sourceLabel }}</text>
        </view>
        <text class="card-subtitle">{{ cardSubtitle }}</text>
        <view class="card-tags" v-if="tags.length > 0">
          <text class="card-tag" v-for="tag in tags" :key="tag">{{ tag }}</text>
        </view>
      </view>
    </view>
    <!-- 匹配等级和来源 -->
    <view class="card-bottom">
      <view class="level-badge" :class="levelClass">
        <text>{{ levelLabel }}</text>
      </view>
      <view class="card-right">
        <text class="card-time" v-if="match.createdAt">{{ formatTime(match.createdAt) }}</text>
        <text class="card-action">查看详情 →</text>
      </view>
    </view>
  </view>
</template>

<script>
import { getMatchLevel } from '@/utils/match.js';

export default {
  props: {
    match: {
      type: Object,
      required: true
    }
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
    levelClass() {
      if (this.score >= 85) return 'level-strong';
      if (this.score >= 70) return 'level-recommend';
      return 'level-consider';
    },
    levelLabel() {
      return getMatchLevel(this.score).label;
    },
    cardTitle() {
      const supply = this.match.supply || this.match.supplyDetail || {};
      const demand = this.match.demand || this.match.demandDetail || {};
      return supply.category || demand.category || '未知品类';
    },
    cardSubtitle() {
      const supply = this.match.supply || this.match.supplyDetail || {};
      const demand = this.match.demand || this.match.demandDetail || {};
      const company = demand.company || '';
      const location = supply.location || demand.location || '';
      return [company, location].filter(Boolean).join(' · ');
    },
    tags() {
      const supply = this.match.supply || this.match.supplyDetail || {};
      const demand = this.match.demand || this.match.demandDetail || {};
      const form = supply.form || '';
      const quantity = supply.quantity || demand.monthlyVolume || '';
      const price = supply.price || demand.budget || '';
      const tagList = [];
      if (form) tagList.push(form);
      if (quantity) tagList.push(quantity + '吨');
      if (price) tagList.push('¥' + price);
      return tagList.slice(0, 3);
    },
    // 来源标识
    sourceLabel() {
      const s = this.match.source || '';
      if (s === '91reborn' || s === '91再生') return '91再生';
      if (s === 'bianbao' || s === '变宝网') return '变宝网';
      if (s === 'remote' || s === '全网') return '全网';
      return '本平台';
    },
    sourceClass() {
      const s = this.match.source || '';
      if (s === '91reborn' || s === '91再生') return 'source-reborn';
      if (s === 'bianbao' || s === '变宝网') return 'source-bianbao';
      if (s === 'remote' || s === '全网') return 'source-remote';
      return 'source-local';
    }
  },
  methods: {
    formatTime(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      const now = new Date();
      const diff = now - d;
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
      if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
      const m = d.getMonth() + 1;
      const day = d.getDate();
      return m + '/' + day;
    }
  }
};
</script>

<style lang="scss" scoped>
.match-card {
  background: #FFFFFF;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
  padding: 24rpx;
  margin-bottom: 20rpx;
  transition: all 0.2s;
}

.card-top {
  display: flex;
  align-items: flex-start;
}

.score-circle {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.score-high {
    background: rgba(7, 193, 96, 0.1);
    border: 4rpx solid #07C160;
  }

  &.score-medium {
    background: rgba(22, 119, 255, 0.1);
    border: 4rpx solid #1677FF;
  }

  &.score-low {
    background: rgba(255, 149, 0, 0.1);
    border: 4rpx solid #FF9500;
  }
}

.score-value {
  font-size: 28rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.card-info {
  flex: 1;
  margin-left: 20rpx;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  margin-bottom: 6rpx;
}

.card-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

// 来源标签
.source-badge {
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  margin-left: 8rpx;
  flex-shrink: 0;

  &.source-local {
    background: rgba(7, 193, 96, 0.1);
    color: #07C160;
  }

  &.source-remote {
    background: rgba(22, 119, 255, 0.1);
    color: #1677FF;
  }

  &.source-reborn {
    background: rgba(255, 149, 0, 0.1);
    color: #FF9500;
  }

  &.source-bianbao {
    background: rgba(250, 81, 81, 0.1);
    color: #FA5151;
  }
}

.card-subtitle {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 10rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.card-tag {
  font-size: 20rpx;
  color: #666;
  background: #F5F5F5;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #F5F5F5;
}

.level-badge {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 12rpx;

  &.level-strong {
    background: rgba(7, 193, 96, 0.1);
    color: #07C160;
  }

  &.level-recommend {
    background: rgba(22, 119, 255, 0.1);
    color: #1677FF;
  }

  &.level-consider {
    background: rgba(255, 149, 0, 0.1);
    color: #FF9500;
  }
}

.card-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.card-time {
  font-size: 20rpx;
  color: #CCC;
}

.card-action {
  font-size: 24rpx;
  color: #07C160;
}
</style>
