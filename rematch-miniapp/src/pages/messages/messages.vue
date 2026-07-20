<template>
  <view class="page">
    <!-- 顶栏 -->
    <view class="header">
      <text class="header-title">消息中心</text>
      <text
        v-if="unreadCount > 0"
        class="mark-all-btn"
        @tap="markAllRead"
      >全部已读</text>
    </view>

    <!-- 通知列表 -->
    <scroll-view
      scroll-y
      class="notif-list"
      refresher-enabled
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="loadMore"
    >
      <view
        v-for="item in notifications"
        :key="item.id"
        class="notif-item"
        :class="{ unread: !item.is_read }"
        @tap="handleTap(item)"
      >
        <!-- 左侧图标 -->
        <view class="notif-icon" :class="'icon-' + item.type">
          <text>{{ getTypeIcon(item.type) }}</text>
        </view>

        <!-- 内容 -->
        <view class="notif-body">
          <view class="notif-title">
            <text>{{ item.title }}</text>
            <view v-if="!item.is_read" class="unread-dot"></view>
          </view>
          <text class="notif-body-text">{{ item.body }}</text>
          <text class="notif-time">{{ formatTime(item.created_at) }}</text>
        </view>

        <!-- 右箭头 -->
        <view class="notif-arrow" v-if="item.link_type && item.link_id">
          <text>›</text>
        </view>
      </view>

      <!-- 加载更多 -->
      <view v-if="loading" class="loading-more">
        <text>加载中...</text>
      </view>

      <!-- 没有更多 -->
      <view v-if="!loading && !hasMore && notifications.length > 0" class="end-line">
        <text>— 没有更多了 —</text>
      </view>

      <!-- 空状态 -->
      <view v-if="!loading && notifications.length === 0" class="empty-state">
        <text class="empty-icon">📭</text>
        <text class="empty-text">暂无消息</text>
        <text class="empty-desc">匹配结果和新消息会出现在这里</text>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import api from '@/utils/api.js';

export default {
  data() {
    return {
      notifications: [],
      unreadCount: 0,
      page: 1,
      hasMore: true,
      loading: false,
      refreshing: false,
    };
  },

  onShow() {
    this.loadNotifications(true);
    this.pollUnread();
  },

  onHide() {
    this.clearPollTimer();
  },

  onUnload() {
    this.clearPollTimer();
  },

  methods: {
    /** 加载通知列表 */
    async loadNotifications(reset = false) {
      if (this.loading) return;
      this.loading = true;

      if (reset) {
        this.page = 1;
        this.hasMore = true;
      }

      try {
        const result = await api.getNotifications({
          page: this.page,
          limit: 20,
        });

        if (result.success) {
          if (reset) {
            this.notifications = result.notifications || [];
          } else {
            this.notifications = [...this.notifications, ...(result.notifications || [])];
          }
          this.unreadCount = result.unread || 0;
          this.hasMore = this.notifications.length < result.total;
        }
      } catch (e) {
        console.error('[Messages] load error:', e);
      } finally {
        this.loading = false;
      }
    },

    /** 加载更多 */
    loadMore() {
      if (!this.hasMore || this.loading) return;
      this.page += 1;
      this.loadNotifications(false);
    },

    /** 下拉刷新 */
    async onRefresh() {
      this.refreshing = true;
      await this.loadNotifications(true);
      this.refreshing = false;
    },

    /** 标记全部已读 */
    async markAllRead() {
      try {
        await api.markAllNotificationsRead();
        this.notifications.forEach(n => { n.is_read = 1; });
        this.unreadCount = 0;
      } catch (e) {
        console.error('[Messages] markAllRead error:', e);
      }
    },

    /** 点击通知 */
    async handleTap(item) {
      // 标记已读
      if (!item.is_read) {
        try {
          await api.markNotificationRead(item.id);
          item.is_read = 1;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        } catch (e) { /* ignore */ }
      }

      // 跳转
      if (item.link_type === 'match' && item.link_id) {
        uni.navigateTo({ url: `/pages/match/match` });
      } else if (item.link_type === 'listing' && item.link_id) {
        uni.navigateTo({ url: `/pages/index/index` });
      }
    },

    /** 定时轮询未读数 */
    pollUnread() {
      this.clearPollTimer();
      this._pollTimer = setInterval(async () => {
        try {
          const result = await api.getUnreadCount();
          if (result.success) {
            this.unreadCount = result.unreadNotifications || 0;
          }
        } catch (e) { /* ignore */ }
      }, 30000); // 每30秒
    },

    clearPollTimer() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    /** 类型图标 */
    getTypeIcon(type) {
      const map = { match: '🎯', message: '💬', system: '📣', listing: '📋' };
      return map[type] || '🔔';
    },

    /** 时间格式化 */
    formatTime(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr.replace(' ', 'T') + '+08:00');
        if (isNaN(d.getTime())) return dateStr;

        const now = new Date();
        const diff = now - d;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        if (diff < 172800000) return '昨天';

        const month = d.getMonth() + 1;
        const day = d.getDate();
        return `${month}-${day}`;
      } catch (e) {
        return dateStr;
      }
    },
  },
};
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #F5F5F5;
  display: flex;
  flex-direction: column;
}

/* 顶栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 30rpx;
  background: #FFFFFF;
  border-bottom: 1rpx solid #EEEEEE;
}

.header-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.mark-all-btn {
  font-size: 26rpx;
  color: #4ECB71;
  padding: 8rpx 20rpx;
}

/* 通知列表 */
.notif-list {
  flex: 1;
}

/* 通知项 */
.notif-item {
  display: flex;
  align-items: flex-start;
  padding: 24rpx 30rpx;
  background: #FFFFFF;
  margin-bottom: 1rpx;
  position: relative;
}

.notif-item.unread {
  background: #F0F9FF;
}

/* 图标 */
.notif-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
  margin-right: 20rpx;
  flex-shrink: 0;
}

.icon-match { background: #FFF3E0; }
.icon-message { background: #E3F2FD; }
.icon-system { background: #F3E5F5; }
.icon-listing { background: #E8F5E9; }

/* 内容 */
.notif-body {
  flex: 1;
  min-width: 0;
}

.notif-title {
  display: flex;
  align-items: center;
  margin-bottom: 8rpx;
}

.notif-title > text {
  font-size: 30rpx;
  font-weight: 500;
  color: #1A1A1A;
  line-height: 1.4;
}

.unread-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #FF4757;
  margin-left: 10rpx;
  flex-shrink: 0;
}

.notif-body-text {
  font-size: 26rpx;
  color: #666666;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin-bottom: 8rpx;
}

.notif-time {
  font-size: 22rpx;
  color: #999999;
}

/* 右箭头 */
.notif-arrow {
  display: flex;
  align-items: center;
  padding-left: 16rpx;
  flex-shrink: 0;
}

.notif-arrow text {
  font-size: 32rpx;
  color: #CCCCCC;
}

/* 加载 */
.loading-more {
  padding: 30rpx;
  text-align: center;
  color: #999999;
  font-size: 24rpx;
}

.end-line {
  padding: 30rpx;
  text-align: center;
  color: #CCCCCC;
  font-size: 24rpx;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 200rpx;
}

.empty-icon {
  font-size: 100rpx;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 32rpx;
  color: #666666;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #999999;
}
</style>
