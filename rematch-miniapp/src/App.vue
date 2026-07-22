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

    // callContainer 前提：wx.cloud.init（两者都试试）
    if (typeof wx !== 'undefined' && wx.cloud) {
      try {
        wx.cloud.init({ env: 'prod-d1glhei0i1a9b8934' });
        console.log('[App] wx.cloud.init() 完成');
      } catch (e) {
        console.error('[App] wx.cloud.init() 失败:', e);
        try {
          wx.cloud.init(); // 回退：不传参数
          console.log('[App] wx.cloud.init() 回退完成（无 env）');
        } catch (e2) {
          console.error('[App] wx.cloud.init() 彻底失败:', e2);
        }
      }
    } else {
      console.error('[App] wx.cloud 不可用');
    }

    // 🔍 诊断：直接测试 callContainer
    this._debugCallContainer();

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
    /** 🔍 诊断：测试 callContainer 请求/响应 */
    _debugCallContainer() {
      const doTest = (path, method) => {
        return new Promise((resolve) => {
          wx.cloud.callContainer({
            config: { env: 'prod-d1glhei0i1a9b8934' },
            path: path,
            method: method,
            header: { 'X-WX-SERVICE': 'zaisutong' },
            timeout: 10000,
            success: (res) => {
              console.log(`[DEBUG] ${method} ${path} → ${res.statusCode}`, JSON.stringify(res.data).substring(0, 200));
              resolve({ path, method, statusCode: res.statusCode, data: res.data });
            },
            fail: (err) => {
              console.error(`[DEBUG] ${method} ${path} → FAIL:`, JSON.stringify(err));
              resolve({ path, method, statusCode: -1, error: err.errMsg || JSON.stringify(err) });
            }
          });
        });
      };

      // 连续测试几个端点
      setTimeout(async () => {
        const results = [];
        results.push(await doTest('/api/health', 'GET'));
        results.push(await doTest('/api/listings', 'GET'));
        results.push(await doTest('/api/debug/echo', 'GET'));
        console.log('[DEBUG] === 诊断结果 ===', JSON.stringify(results, null, 2));
      }, 500);
    },

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
