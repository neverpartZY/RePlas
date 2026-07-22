<template>
  <view id="app">
    <router-view />
  </view>
</template>

<script>
import api from '@/utils/api.js';

export default {
  data() {
    return {
      unreadPollTimer: null,
    };
  },

  onLaunch() {
    console.log('再塑通 rematch-miniapp v2.3 启动 (callContainer内网直连云托管)');

    // 云环境初始化 — callContainer 前提，必须成功
    if (typeof wx !== 'undefined' && wx.cloud) {
      try {
        wx.cloud.init({ env: 'prod-d1glhei0i1a9b8934' });
        console.log('[App] wx.cloud 初始化成功');
      } catch (e) {
        console.error('[App] wx.cloud 初始化失败 (callContainer 将不可用):', e);
      }
    } else {
      console.error('[App] wx.cloud 不可用，callContainer 将无法工作');
    }

    // 监听 token 过期事件
    uni.$on('auth_expired', () => {
      console.log('[App] Token 已过期，需要重新登录');
    });

    // 获取系统信息
    const systemInfo = uni.getSystemInfoSync();
    this.$store && this.$store.commit && this.$store.commit('SET_SYSTEM_INFO', systemInfo);
  },

  onShow() {
    console.log('App onShow');
    // 启动未读轮询 + 立即检查一次
    this.startUnreadPolling();
    this.checkUnread();
  },

  onHide() {
    console.log('App onHide');
    this.stopUnreadPolling();
  },

  methods: {
    /** 立即检查未读数并更新 tab badge */
    async checkUnread() {
      try {
        const token = api.getToken();
        if (!token) return;

        const result = await api.getUnreadCount();
        if (result && result.success) {
          const unread = result.unreadNotifications || 0;
          this.updateBadge(unread);
        }
      } catch (e) {
        // 静默失败
      }
    },

    /** 启动定时轮询未读数 (每60秒) */
    startUnreadPolling() {
      this.stopUnreadPolling();
      this.unreadPollTimer = setInterval(() => {
        this.checkUnread();
      }, 60000);
    },

    /** 停止轮询 */
    stopUnreadPolling() {
      if (this.unreadPollTimer) {
        clearInterval(this.unreadPollTimer);
        this.unreadPollTimer = null;
      }
    },

    /** 更新 tab bar 消息 badge */
    updateBadge(count) {
      const msgTabIndex = 3; // 消息 tab 在 5 个 tab 中的位置 (0-首页 1-匹配 2-行情 3-消息 4-我的)

      if (count > 0) {
        uni.setTabBarBadge({
          index: msgTabIndex,
          text: count > 99 ? '99+' : String(count),
        });
      } else {
        uni.removeTabBarBadge({ index: msgTabIndex });
      }
    },
  },
};
</script>

<style lang="scss">
@import '@/uni.scss';

page {
  background-color: #F5F5F5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

view {
  box-sizing: border-box;
}
</style>
