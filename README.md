# 再塑通 (RePlasMatch) v5.0

> AI 驱动的废塑料回收再生两极供需撮合平台。
> 一句话发布，秒级匹配。覆盖拍照识别、全网货源、AI定价、交易追踪全链路。

---

## 目录

- [项目简介](#项目简介)
- [核心功能](#核心功能)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [API 文档](#api-文档)
- [数据库设计](#数据库设计)
- [匹配引擎](#匹配引擎)
- [交易流程](#交易流程)
- [前端页面](#前端页面)
- [部署指南](#部署指南)
- [开发约定](#开发约定)

---

## 项目简介

再塑通是面向废塑料回收行业的 AI-native 撮合平台。用户用自然语言描述供需（"我有30吨三色瓶砖在定州5800出"），AI 自动解析品类、数量、价格、地点，结构化存储并匹配最佳合作伙伴。

平台覆盖**废塑料→再生料**全品类（PET / HDPE / PP / LDPE / ABS / PC / PVC / PS / PA / EVA），服务**打包站 → 再生工厂 → 制品厂**两极供需网络。

### 关键数据

| 指标 | 数值 |
|------|------|
| 前端代码 | 4,065 行 vanilla JS SPA |
| 后端路由 | 16 个模块 |
| 数据库表 | 16 张 |
| 价格历史 | 546 条记录 |
| 行业术语 | ~80 条俗称→标准品类映射 |
| 匹配维度 | 6 维 × 100 分制 |
| 交易阶段 | 5 阶段管道 |

---

## 核心功能

### 1. AI 智能发布

- **自然语言解析**：输入"定州30吨三色瓶砖5800"，自动提取品类/数量/价格/地点
- **行业术语标准化**：~80 条俗称（大蓝桶、白粉碎、片子、粒子等）自动映射为标准品类
- **拍照识别 (Vision)**：拍照上传 → AI 识别塑料品类/颜色/形态/纯度 → 一键发布

### 2. 智能匹配

- **6 维品质评分**：品类匹配 / 形态兼容 / 地理位置 / 价格适配 / 数量适配 / 品质匹配
- **两极撮合**：废塑料供应（打包站）↔ 再生料需求（再生工厂/制品厂）双向匹配
- **匹配等级**：强烈推荐 ≥85% | 推荐 70-84% | 可考虑 50-69%

### 3. 行情中心

- **价格走势图**：10+ 品类废塑料/再生料行情
- **新料-再生料价差**：实时价差对比，辅助交易决策
- **区域热力图**：8 品类 × 5 区域价格强度可视化
- **周/月/季趋势**：多周期聚合分析
- **全网货源**：外部 B2B 平台货源一键采集搜索

### 4. 交易追踪

- **五阶段管道**：意向(intent) → 洽谈(negotiating) → 成交(deal) → 完成(completed) / 取消(cancelled)
- **自动通知**：状态变更时自动通知对方
- **站内聊天**：WebSocket 实时消息

### 5. 管理后台

- 平台数据看板（用户数/供需数/匹配数/成交率）
- 用户管理（审核/禁用）
- 内容审核（供需审核/举报处理）
- 审计日志
- 数据导出

### 6. 企业名片

- 企业信息展示（资质/产能/工艺/认证）
- 双角色支持（打包站 + 再生工厂）
- 样品展示

---

## 技术架构

```
┌──────────────────────────────────────────────────────┐
│                    前端 (H5 SPA)                      │
│         前端_app_v5.html — 4,065 行 vanilla JS        │
│         9 个 Page · 8 个底部 Tab · ~90 个函数          │
├──────────────────────────────────────────────────────┤
│               HTTP REST API + WebSocket                │
├──────────────────────────────────────────────────────┤
│                 Express 后端 (Node.js)                 │
│  16 个路由模块 · JWT 认证 · Rate Limiting · CORS      │
├──────────────────────────────────────────────────────┤
│              better-sqlite3 (SQLite)                  │
│              16 张表 · 内存级读写性能                   │
├──────────────────────────────────────────────────────┤
│          AI 服务 / 外部采集 / 图片处理                  │
│     OpenAI API · 爬虫引擎 · Sharp 图片分析              │
└──────────────────────────────────────────────────────┘
```

### 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| **前端** | Vanilla JS SPA | 无框架，单文件 H5，localStorage 持久化 |
| **后端** | Express 4.18 | RESTful API，端口 3456 |
| **实时通信** | ws (WebSocket) | 站内消息推送 |
| **数据库** | better-sqlite3 | 同步 SQLite，零配置 |
| **认证** | JWT (jsonwebtoken) | Token 签发 + 守卫中间件 |
| **加密** | bcryptjs | 密码哈希 |
| **文件上传** | multer | 图片上传 / Vision 分析 |
| **图片处理** | sharp | 压缩 + 格式转换 |
| **AI 服务** | openai SDK | Vision 识别 / 自然语言解析 |
| **限流** | express-rate-limit | 接口频率控制 |

---

## 项目结构

```
再塑通/
├── 前端_app_v5.html              # 🔥 前端主文件 (4,065行 SPA)
├── backend/                      # 后端服务
│   ├── server.js                 # Express 入口 (WebSocket + HTTP)
│   ├── db.js                     # SQLite 连接管理
│   ├── match_engine.js           # 6维匹配评分引擎
│   ├── helpers.js                # 工具函数 (sanitize/validate)
│   ├── middleware/
│   │   └── auth.js               # JWT 认证中间件 (requireAuth/optionalAuth/verifyToken)
│   ├── routes/                   # API 路由 (16个模块)
│   │   ├── auth.js               # 注册/登录
│   │   ├── users.js              # 用户管理
│   │   ├── listings.js           # 供需列表 CRUD
│   │   ├── matches.js            # 匹配结果
│   │   ├── prices.js             # 价格行情
│   │   ├── pricing.js            # AI定价 + 热力图 + 趋势扩展
│   │   ├── stats.js              # 平台统计
│   │   ├── messages.js           # 站内消息 (WebSocket)
│   │   ├── notifications.js      # 系统通知
│   │   ├── ai.js                 # AI 服务
│   │   ├── admin.js              # 管理后台
│   │   ├── vision.js             # 📷 拍照识别 (P0-1)
│   │   ├── external.js           # 🌐 全网货源采集 (P0-2)
│   │   ├── enterprise.js         # 🏢 企业名片
│   │   ├── deal-intents.js       # 🤝 交易流程追踪
│   │   └── terminology.js        # 📖 行业术语标准化
│   ├── scrapers/                 # 外部采集引擎
│   │   └── manager.js            # 采集任务管理器
│   └── package.json
├── 前端_app_v4.html              # v4 历史版本
├── build_v5.py                   # 前端构建脚本
├── .gitignore
└── docs/                         # 项目文档
    ├── 再塑通_原型设计文档_v1.md
    ├── 塑料回收再生行业供求资讯体系方案.md
    └── greenplastic.ai技术分析+撮合板块融合方案.md
```

---

## 快速开始

### 环境要求

- **Node.js** ≥ 18.x（推荐 22.x）
- **npm** ≥ 9.x
- **Python** 3.x（仅构建脚本需要，非必须）

### 1. 克隆项目

```bash
git clone git@github.com:neverpartZY/RePlas.git
cd RePlas/再塑通   # 或直接 cd RePlas 如果在撮合小程序根目录
```

### 2. 安装依赖

```bash
cd backend
npm install
```

### 3. 配置环境变量（可选）

在 `backend/` 目录创建 `.env` 文件：

```env
PORT=3456                          # 服务端口
JWT_SECRET=your-secret-key         # JWT 签名密钥
OPENAI_API_KEY=sk-xxx              # OpenAI API Key (Vision/AI 功能需要)
ALLOWED_ORIGIN=*                   # CORS 允许来源
RATE_LIMIT_WINDOW_MS=60000         # 限流窗口 (毫秒)
RATE_LIMIT_MAX=100                 # 限流最大请求数
```

### 4. 启动服务

```bash
cd backend
node server.js
```

服务启动在 `http://localhost:3456`。

### 5. 访问

| 地址 | 说明 |
|------|------|
| `http://localhost:3456` | 前端 H5 页面 |
| `http://localhost:3456/admin` | 管理后台 |

### 默认管理员账号

首次启动会自动创建管理员账号：
- **用户名**: admin / **密码**: admin123

---

## API 文档

### 认证说明

- 公开接口无需 Token
- 需登录接口在 Header 中携带：`Authorization: Bearer <token>`
- 可选登录接口（未登录可访问，登录后返回个性化数据）使用 `optionalAuth` 中间件

### 接口总览

#### 认证模块 (`/api/auth`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册 | 否 |
| POST | `/api/auth/login` | 用户登录，返回 JWT | 否 |

#### 供需列表 (`/api/listings`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/listings` | 供需列表（支持筛选/分页） | 可选 |
| GET | `/api/listings/:id` | 供需详情 | 可选 |
| POST | `/api/listings` | 发布供需 | 是 |
| PATCH | `/api/listings/:id` | 更新供需 | 是 |
| DELETE | `/api/listings/:id` | 删除供需 | 是 |

#### 智能匹配 (`/api/matches`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/matches/:userId` | 获取用户匹配结果（含6维评分） | 是 |
| POST | `/api/matches/trigger` | 手动触发匹配计算 | 是 |

#### 行情价格 (`/api/prices`, `/api/pricing`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/prices` | 价格行情列表 | 否 |
| GET | `/api/pricing/heatmap` | 区域热力图数据 | 否 |
| GET | `/api/pricing/trends-extended?period=month` | 周/月/季趋势 | 否 |

#### 交易追踪 (`/api/deal-intents`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/deal-intents` | 我的交易列表 | 是 |
| GET | `/api/deal-intents/:id` | 交易详情 | 是 |
| POST | `/api/deal-intents` | 发起交易意向 | 是 |
| PATCH | `/api/deal-intents/:id` | 更新交易状态 | 是 |

#### 行业术语 (`/api/terminology`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/terminology/map` | 获取全部术语映射表 | 否 |
| GET | `/api/terminology/normalize?q=大蓝桶` | 术语标准化查询 | 否 |

#### 拍照识别 (`/api/vision`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/vision/analyze` | 上传图片 → AI 分析品类/颜色/形态 | 是 |
| POST | `/api/vision/upload` | 上传图片 | 是 |
| GET | `/api/vision/history` | 识别历史 | 是 |

#### 全网货源 (`/api/external`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/external/listings` | 外部货源列表 | 否 |
| POST | `/api/external/scrape` | 手动触发采集 | 是 |
| GET | `/api/external/status` | 采集状态 | 是 |
| GET | `/api/external/sources` | 采集源列表 | 否 |
| GET | `/api/external/match/:listingId` | 外部货源与本地匹配 | 是 |

#### 企业名片 (`/api/enterprise`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/enterprise/profile/:userId` | 企业信息 | 否 |
| PATCH | `/api/enterprise/profile` | 更新企业信息 | 是 |

#### 消息 (`/api/messages`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/messages/conversations` | 会话列表 | 是 |
| GET | `/api/messages/:conversationId` | 聊天记录 | 是 |
| POST | `/api/messages` | 发送消息 | 是 |

#### 管理后台 (`/api/admin`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/admin/dashboard` | 管理看板 | Admin |
| GET | `/api/admin/users` | 用户列表 | Admin |
| PATCH | `/api/admin/users/:id` | 管理用户（审核/禁用） | Admin |
| GET | `/api/admin/listings` | 供需审核列表 | Admin |
| PATCH | `/api/admin/listings/:id/review` | 审核供需 | Admin |
| GET | `/api/admin/reports` | 举报列表 | Admin |
| PATCH | `/api/admin/reports/:id` | 处理举报 | Admin |
| GET | `/api/admin/logs` | 审计日志 | Admin |

#### 其他

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/stats` | 平台统计 | 否 |
| GET | `/api/notifications` | 我的通知 | 是 |
| PATCH | `/api/notifications/:id/read` | 标记已读 | 是 |
| GET | `/api/health` | 健康检查 | 否 |

---

## 数据库设计

共 **16 张表**，使用 SQLite（better-sqlite3）。

### 核心业务表

| 表名 | 说明 | 字段数 |
|------|------|--------|
| `users` | 用户/企业 | 21 字段（含企业资质/产能/认证） |
| `listings` | 供需发布 | 22 字段（含品质规格/图片/交易状态） |
| `matches` | 匹配结果 | 6 字段（含6维评分详情） |
| `deal_intents` | 交易意向 | 14 字段（五阶段管道+价格/数量约定） |
| `messages` | 站内消息 | 8 字段 |
| `notifications` | 系统通知 | 9 字段 |
| `evaluations` | 交易评价 | 10 字段（品质/诚信/速度三维评分） |

### 数据与行情表

| 表名 | 说明 | 行数 |
|------|------|------|
| `prices` | 实时报价 | 8 |
| `price_history` | 价格历史 | **546** |
| `external_listings` | 外部采集货源 | 0 (按需采集) |

### 管理与辅助表

| 表名 | 说明 |
|------|------|
| `vision_records` | 拍照识别记录 |
| `upload_images` | 上传图片索引 |
| `enterprise_samples` | 企业样品展示 |
| `reports` | 举报记录 |
| `audit_logs` | 管理员操作审计 |

---

## 匹配引擎

### 6 维评分体系（100 分制）

```
品类匹配       40 分    ← 精准匹配必须，否则直接淘汱
品质匹配       20 分    ← 颜色/纯度/熔指/认证/等级
形态兼容       12 分    ← 瓶砖→瓶片→碎片→颗粒 形态转换矩阵
地理位置       12 分    ← 同城15/同省10/邻省8/跨省5
价格兼容        8 分    ← 偏差≤5%得满分
数量匹配        8 分    ← 供需比≤1.2得满分
─────────────────────
总分          100 分
```

### 匹配等级

| 等级 | 分数 | 标签 |
|------|------|------|
| 🥇 强烈推荐 | ≥ 85 | 品类精准 + 多维度高度匹配 |
| 🥈 推荐 | 70-84 | 核心维度匹配良好 |
| 🥉 可考虑 | 50-69 | 存在适配空间 |

### 形态兼容矩阵（部分）

```
瓶砖 → 瓶片 / 碎片 / 颗粒
瓶片 → 瓶片 / 碎片 / 颗粒
破碎料 → 破碎料 / 颗粒
粉碎料 → 粉碎料 / 颗粒
碎片 → 碎片 / 颗粒
颗粒 → 颗粒
膜 → 膜颗粒 / 颗粒
```

---

## 交易流程

交易采用**五阶段管道**模型，追踪从意向到完成的完整生命周期：

```
intent          意向        ← 买家/卖家发起交易意向
  ↓
negotiating     洽谈        ← 双方协商价格/数量/交期
  ↓
deal            成交        ← 达成交易约定
  ↓
completed       完成        ← 交易成功完成，可互相评价
  │
  └── cancelled  取消       ← 任一方取消（仅限 deal 前）
```

每次状态变更自动触发：
- 对方站内通知
- 交易记录更新
- 供需列表交易状态同步

---

## 前端页面

### 9 个主页面

| 页面 | ID | 说明 |
|------|-----|------|
| 🏠 首页 | `page-home` | AI 输入区 / 供需看板 / 快捷入口 |
| 📊 行情 | `page-market` | 价格走势 / 全网货源 / 价差卡片 / 区域热力图 |
| 🔗 匹配 | `page-match` | 6维评分匹配结果列表 |
| 🤝 交易 | `page-deals` | 五阶段交易管道 / 状态筛选 |
| 💬 消息 | `page-messages` | 会话列表 + 实时聊天 |
| 📷 识别 | `page-vision` | 拍照上传 / AI 分析 / 一键发布 |
| 🏢 企业 | `page-enterprise` | 企业名片详情 |
| 👤 我的 | `page-me` | 个人中心 / 设置 |
| ✏️ 发布 | sheet 弹窗 | 供需发布表单 |

### 8 个底部导航

```
首页 | 行情 | 匹配 | 交易 | 消息 | 📷 | 企业 | 我的
```

### 技术特点

- **零框架依赖**：纯 vanilla JavaScript，无 React/Vue/jQuery
- **SPA 架构**：页面切换通过 CSS display 控制，无路由库
- **全局状态管理**：`state` 对象 + localStorage 持久化 session
- **API 封装**：`api(path, options)` 统一请求函数，自动附加 JWT
- **WebSocket**：消息和通知实时推送
- **Sheet 弹窗**：发布/详情等表单以底部弹出面板呈现

---

## 部署指南

### 开发环境

```bash
cd backend
npm install
node server.js
# → http://localhost:3456
```

### 生产环境（推荐 PM2）

```bash
# 安装 PM2
npm install -g pm2

# 启动
cd backend
pm2 start server.js --name zaisutong

# 开机自启
pm2 save
pm2 startup

# 查看状态
pm2 status
pm2 logs zaisutong
```

### Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3456 | 服务端口 |
| `JWT_SECRET` | (内置默认) | JWT 签名密钥，生产环境务必修改 |
| `OPENAI_API_KEY` | — | OpenAI API Key（Vision + AI 功能） |
| `ALLOWED_ORIGIN` | `*` | CORS 允许来源 |
| `RATE_LIMIT_WINDOW_MS` | 60000 | 限流窗口（毫秒） |
| `RATE_LIMIT_MAX` | 100 | 窗口内最大请求数 |

---

## 开发约定

### 前端修改

- **主文件**：`前端_app_v5.html` 是唯一前端源文件
- **构建方式**：`build_v5.py` 可对 HTML 做字符串替换/插入，不直接编辑
- **API 调用**：所有后端请求统一使用 `api(path, options)` 函数
- **页面切换**：通过全局 `switchTab(tab)` 函数

### 后端路由

- **前缀**：所有 API 以 `/api/` 开头
- **认证**：需登录路由使用 `requireAuth` 中间件；可选登录使用 `optionalAuth`
- **响应格式**：
  ```json
  { "success": true, "data": {...} }
  { "success": false, "error": "错误描述" }
  ```

### 数据库

- **引擎**：better-sqlite3（同步 API）
- **位置**：`backend/data/zaisutong.db`（已加入 .gitignore）
- **向前兼容**：表结构变更通过 ALTER TABLE ADD COLUMN 实现

---

## License

MIT

---

## 作者

**neverpartZY**

- GitHub: [https://github.com/neverpartZY/RePlas](https://github.com/neverpartZY/RePlas)

---

*最后更新: 2026-07-03 — v5.0*
