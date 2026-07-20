<template>
  <view class="enterprise-card" @tap="$emit('tap')">
    <view class="card-top">
      <image
        class="ent-avatar"
        :src="enterprise.avatar || '/static/logo.png'"
        mode="aspectFill"
      />
      <view class="ent-info">
        <text class="ent-name">{{ enterprise.name || enterprise.company || '未知企业' }}</text>
        <text class="ent-location" v-if="enterprise.location">📍 {{ enterprise.location }}</text>
        <text class="ent-role" v-if="enterprise.role">{{ enterprise.role }}</text>
      </view>
    </view>
    <view class="card-stats" v-if="hasStats">
      <view class="ent-stat">
        <text class="ent-stat-value">{{ enterprise.stats ? enterprise.stats.published : 0 }}</text>
        <text class="ent-stat-label">发布</text>
      </view>
      <view class="ent-stat">
        <text class="ent-stat-value">{{ enterprise.stats ? enterprise.stats.matched : 0 }}</text>
        <text class="ent-stat-label">匹配</text>
      </view>
      <view class="ent-stat">
        <text class="ent-stat-value">{{ enterprise.stats ? enterprise.stats.deals : 0 }}</text>
        <text class="ent-stat-label">成交</text>
      </view>
    </view>
    <view class="card-tags" v-if="tags.length > 0">
      <text class="ent-tag" v-for="tag in tags" :key="tag">{{ tag }}</text>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    enterprise: {
      type: Object,
      required: true
    }
  },
  computed: {
    hasStats() {
      return this.enterprise.stats && (
        this.enterprise.stats.published > 0 ||
        this.enterprise.stats.matched > 0 ||
        this.enterprise.stats.deals > 0
      );
    },
    tags() {
      const tagList = [];
      if (this.enterprise.role) tagList.push(this.enterprise.role);
      if (this.enterprise.category) tagList.push(this.enterprise.category);
      if (this.enterprise.form) tagList.push(this.enterprise.form);
      return tagList;
    }
  }
};
</script>

<style lang="scss" scoped>
.enterprise-card {
  background: #FFFFFF;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
  padding: 24rpx;
  transition: all 0.2s;
}

.card-top {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.ent-avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #F5F5F5;
  flex-shrink: 0;
}

.ent-info {
  margin-left: 20rpx;
  flex: 1;
  min-width: 0;
}

.ent-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: block;
  margin-bottom: 4rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ent-location {
  font-size: 24rpx;
  color: #666;
  display: block;
  margin-bottom: 2rpx;
}

.ent-role {
  font-size: 22rpx;
  color: #07C160;
  background: rgba(7, 193, 96, 0.08);
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  display: inline-block;
  width: fit-content;
}

.card-stats {
  display: flex;
  justify-content: space-around;
  padding: 16rpx 0;
  border-top: 1rpx solid #F5F5F5;
  margin-bottom: 8rpx;
}

.ent-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ent-stat-value {
  font-size: 32rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.ent-stat-label {
  font-size: 22rpx;
  color: #999;
  margin-top: 2rpx;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.ent-tag {
  font-size: 20rpx;
  color: #666;
  background: #F5F5F5;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}
</style>
