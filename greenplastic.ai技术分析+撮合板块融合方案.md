# GreenPlastic AI 技术分析 + 撮合板块融合方案

分析日期：2026-06-28 | 网站上线：2026-06-26（仅2天）

## 一、GreenPlastic AI 技术栈全貌

### 1.1 前端

| 项 | 技术 | 证据/说明 |
|---|---|---|
| 框架 | Next.js (App Router) | _next/static/chunks/app/[lng]/page-*.js，RSC架构 |
| 语言 | TypeScript | Next.js默认 + 类型安全 |
| 样式 | Tailwind CSS | rounded-2xl bg-gradient-to-br transition-all 等原子类 |
| 图标 | Lucide React | lucide lucide-zap lucide-languages |
| 国际化 | 内置 [lng] 路由 | /zh /en 路径前缀，中英双语 |
| 渲染 | SSR + SSG | Vercel部署，默认静态生成+服务端渲染 |


### 1.2 后端/部署

| 项 | 技术 | 证据/说明 |
|---|---|---|
| 部署 | Vercel | x-vercel-id: fra1::hqlqn-... |
| CDN/DNS | Cloudflare | cf-ray cf-cache-status alt-svc: h3 |
| 数据库 | 未暴露 | 无公开API调用，推测Vercel Postgres或Supabase |
| 认证 | 暂无登录 | 纯内容平台，无用户系统 |


### 1.3 页面结构

```
greenplastic.ai
├── /[lng]                         首页（Landing Page）
│   ├── Hero区域
│   ├── 八大维度入口
│   ├── 功能亮点
│   └── Footer（© 国嘉基业）
│
├── /[lng]/intelligence            情报中心 ✅ 已上线
│   ├── 八大维度筛选
│   ├── 五大区域筛选
│   ├── 1-5星热度评级
│   └── 中英双语摘要
│
├── /[lng]/about                   关于我们
│
├── /[lng]/news?q=xxx              话题搜索
│   └── 热门标签：CBAM PCR PLA 化学回收 欧盟...
│
└── 🔜 可扩展的新板块
    ├── /[lng]/matchmaking        ← 供需撮合（本次新增）
    ├── /[lng]/prices             ← 行情中心
    └── /[lng]/enterprises        ← 企业库
```

### 1.4 设计系统

| 项 | 值 |
|---|---|
| 主色 | Emerald 600 → Cyan 700 渐变 |
| 辅助色 | Violet 700（Hover），Slate 系列（文字） |
| 圆角 | rounded-2xl (16px) 为主 |
| 导航 | Fixed header，h-16，透明→滚动后变色 |
| 按钮 | rounded-xl，Hover微缩放+旋转动效 |
| 字体 | font-sans，tracking-[-0.3px] |


## 二、融合方案：撮合板块作为 greenplastic.ai 原生模块

### 2.1 结论：完全可直接融合，且架构天然支持

为什么？ 三个关键事实：

- 同一主体：greenplastic.ai 和撮合小程序都是国嘉基业旗下的产品——不存在跨公司数据打通问题
- 同一技术栈：Next.js App Router 加一个 /matchmaking 路由，和现有 /intelligence 完全平行的页面结构
- 情报→撮合自然延伸：用户在情报中心看到"某品牌承诺2027年使用30% PCR"→点击即可跳转到撮合板块发布PCR采购需求

### 2.2 融合后的页面结构

```
greenplastic.ai
├── /[lng]                         首页
│   └── 🆕 新增模块：「供需撮合」入口卡片
│
├── /[lng]/intelligence            情报中心（已有）
│
├── /[lng]/matchmaking             供需撮合（🆕 新增）
│   ├── /matchmaking/publish       发布供应/需求
│   ├── /matchmaking/results       匹配结果
│   ├── /matchmaking/market        行情中心
│   └── /matchmaking/enterprise    企业名片
│
├── /[lng]/about                   关于我们
└── /news                          话题搜索
```

### 2.3 导航栏新增

```html
<nav>
  <a href="/intelligence">⚡ 情报中心</a>
+ <a href="/matchmaking">🤝 供需撮合</a>
  <a href="/about">关于我们</a>
</nav>
```

### 2.4 数据架构：统一后端，三端共享

```
                    ┌──────────────────────┐
                    │   微信云开发（腾讯云）   │
                    │   ├ 云数据库            │
                    │   │  users/supplies/   │
                    │   │  demands/matches/  │
                    │   │  prices            │
                    │   ├ 云函数（API）        │
                    │   └ 云存储（图片）        │
                    └──────┬───────┬────────┘
                           │       │
              ┌────────────┘       └────────────┐
              ↓                                 ↓
    ┌─────────────────┐              ┌─────────────────┐
    │   微信小程序      │              │  greenplastic.ai │
    │   uni-app        │              │  Next.js Web版   │
    │   原生微信入口     │              │  /matchmaking    │
    └─────────────────┘              └─────────────────┘

    同一套数据、同一个匹配引擎、同一个用户体系
    Web版调用云函数HTTP API → 微信云开发
```

## 三、具体实施：代码层面如何操作

### 3.1 greenplastic.ai 项目结构（推测+新增）

```
greenplastic.ai/
├── app/
│   ├── [lng]/
│   │   ├── page.tsx                  # 首页
│   │   ├── intelligence/
│   │   │   └── page.tsx              # 情报中心（已有）
│   │   ├── matchmaking/              # 🆕 撮合板块
│   │   │   ├── page.tsx              # 撮合首页
│   │   │   ├── publish/
│   │   │   │   └── page.tsx          # 发布页
│   │   │   ├── results/
│   │   │   │   └── page.tsx          # 匹配结果
│   │   │   ├── market/
│   │   │   │   └── page.tsx          # 行情中心
│   │   │   └── enterprise/
│   │   │       └── [id]/
│   │   │           └── page.tsx      # 企业名片
│   │   ├── about/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── api/                          # 🆕 API路由（代理云函数）
│   │   ├── matchmaking/
│   │   │   ├── publish/route.ts
│   │   │   ├── match/route.ts
│   │   │   ├── prices/route.ts
│   │   │   └── auth/route.ts
│   │   └── ...
│   └── layout.tsx
├── components/
│   ├── matchmaking/                  # 🆕 撮合板块组件
│   │   ├── PublishForm.tsx
│   │   ├── MatchCard.tsx
│   │   ├── MatchDetail.tsx
│   │   ├── PriceTable.tsx
│   │   └── EnterpriseCard.tsx
│   ├── ui/                           # 已有UI组件
│   └── ...
├── lib/
│   ├── cloudbase.ts                  # 🆕 微信云开发SDK封装
│   └── ...
├── tailwind.config.ts
└── package.json
```

### 3.2 关键代码：Web版调用微信云开发

```typescript
// lib/cloudbase.ts
const CLOUD_FUNCTION_BASE = process.env.CLOUD_FUNCTION_BASE_URL;

export async function callCloudFunction(name: string, data: any) {
  const res = await fetch(`${CLOUD_FUNCTION_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function publishSupply(supplyData: SupplyInput) {
  return callCloudFunction('publishSupply', supplyData);
}

export async function getMatches(userId: string) {
  return callCloudFunction('getMatches', { userId });
}

export async function getPrices(category: string) {
  return callCloudFunction('getPrices', { category });
}
```

### 3.3 组件复用：和情报中心一致的UI风格

```tsx
// components/matchmaking/MatchCard.tsx
export function MatchCard({ match }: { match: MatchResult }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-6
                    hover:border-emerald-200 hover:shadow-lg
                    transition-all duration-200 bg-white">
      {/* 匹配得分圆饼 - 复用 Emerald 渐变 */}
      <div className={`w-12 h-12 rounded-full flex items-center
                       justify-center text-white font-bold
                       bg-gradient-to-br from-emerald-500 to-cyan-600`}>
        {match.score}%
      </div>
      <h3 className="text-lg font-semibold mt-3 text-slate-900">
        {match.title}
      </h3>
      <p className="text-sm text-slate-500 mt-1">{match.subtitle}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        {match.tags.map(tag => (
          <span className="text-xs px-2.5 py-1 rounded-full
                           bg-slate-100 text-slate-600">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
```

## 四、用户旅程：情报→撮合的自然闭环

```
用户在 greenplastic.ai/intelligence 浏览情报
    │
    ├── 看到"某品牌承诺2027年使用30% PCR"
    │   └── 页面底部：「需要采购再生料？👉 去撮合中心发布需求」
    │       点击 → /matchmaking/publish?category=PET&type=demand
    │
    ├── 看到"某地打包站因环保关停，PET瓶砖货源紧张"
    │   └── 页面底部：「有瓶砖要卖？👉 去撮合中心发布供应」
    │       点击 → /matchmaking/publish?category=PET&type=supply
    │
    └── 看到行情价格波动
        └── 页面底部：「查看完整行情 → 撮合中心行情板块」
            点击 → /matchmaking/market

情报中心 ↔ 撮合中心 双向联通
```

## 五、实施优先级

| 优先级 | 任务 | 工期 | 说明 |
|---|---|---|---|
| P0 | 微信小程序 MVP（uni-app） | 5天 | 供需发布+匹配+行情 |
| P0 | 微信云开发后端 | 并入开发 | 云函数+数据库 |
| P1 | greenplastic.ai /matchmaking 页面 | 2天 | 调用云函数API |
| P1 | 导航栏加「供需撮合」入口 | 30分钟 | 改一行代码 |
| P2 | 情报页→撮合页跳转 | 1天 | 上下文传递 |
| P3 | 用户体系统一SSO | 1天 | 微信登录+Web登录打通 |


总工期：P0 5天 + P1 2天 = 7天可完成两端全部上线。

## 六、关键结论

- 技术栈完全兼容：Next.js + Tailwind + TypeScript
- 设计语言一致：Emerald/Cyan渐变，和现有网站无缝融合
- 数据架构清晰：微信云开发做统一后端，greenplastic.ai通过云函数HTTP API调用
- 业务闭环自然：情报→撮合是一条完整的用户路径
- 同一主体无壁垒：国嘉基业自有产品，不存在数据合规或品牌冲突

一句话：把撮合板块放进 greenplastic.ai，就像把情报中心放进 greenplastic.ai 一样自然——它就是这个平台的下一个标准模块。
