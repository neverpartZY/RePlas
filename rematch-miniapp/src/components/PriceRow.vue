<template>
  <view class="price-row" :class="{ compact: compact }">
    <view class="price-left">
      <text class="price-category">{{ price.name || price.category }}</text>
      <text class="price-unit" v-if="!compact">{{ price.unit || '元/吨' }}</text>
    </view>
    <view class="price-right">
      <text class="price-current" :class="changeClass">{{ formatPrice(price.currentPrice) }}</text>
      <view class="price-change" v-if="price.change !== 0">
        <text class="change-icon">{{ price.change > 0 ? '↑' : '↓' }}</text>
        <text class="change-value" :class="changeClass">
          {{ price.change > 0 ? '+' : '' }}{{ price.change }}
        </text>
        <text class="change-percent" :class="changeClass" v-if="price.changePercent && !compact">
          ({{ price.changePercent > 0 ? '+' : '' }}{{ price.changePercent }}%)
        </text>
      </view>
      <text class="price-flat" v-else>持平</text>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    price: {
      type: Object,
      required: true
    },
    compact: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    changeClass() {
      if (this.price.change > 0) return 'text-up';
      if (this.price.change < 0) return 'text-down';
      return 'text-flat';
    }
  },
  methods: {
    formatPrice(val) {
      if (val === undefined || val === null) return '--';
      return '¥' + Number(val).toLocaleString('zh-CN');
    }
  }
};
</script>

<style lang="scss" scoped>
.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #F5F5F5;

  &:last-child {
    border-bottom: none;
  }

  &.compact {
    padding: 14rpx 0;
  }
}

.price-left {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
}

.price-category {
  font-size: 28rpx;
  color: #1A1A1A;
  font-weight: 500;

  .compact & {
    font-size: 26rpx;
  }
}

.price-unit {
  font-size: 22rpx;
  color: #999;
}

.price-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.price-current {
  font-size: 32rpx;
  font-weight: 700;

  .compact & {
    font-size: 28rpx;
  }
}

.price-change {
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.change-icon {
  font-size: 22rpx;
}

.change-value {
  font-size: 24rpx;
  font-weight: 500;
}

.change-percent {
  font-size: 22rpx;
}

.text-up {
  color: #FA5151;
}

.text-down {
  color: #07C160;
}

.text-flat {
  color: #999;
}

.price-flat {
  font-size: 24rpx;
  color: #999;
}
</style>
