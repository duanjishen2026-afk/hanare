# Hanare 全栈方案：前端、后端与部署

Hanare 是一个让住在日本以外的人远程给日本公司做兼职的招聘平台。这份文档把现有原型推进到可上线的 MVP，内容包括架构、数据库、接口、AI 设计、前后端代码和部署步骤。

- 后端代码完整收录在附录 A，前端起步代码在附录 B，可以照着建项目，也可以把整份文档交给 AI 编码工具生成。
- 文中代码已在本地跑通，验证范围和没验证的部分见附录 C。

---

## 0. 一页看懂

### 架构

```mermaid
flowchart LR
  U["浏览器<br/>求职者 / 雇主"] -->|HTTPS| W["web<br/>Vite + React<br/>Vercel"]
  W -->|"REST + SSE<br/>Bearer token"| A["api<br/>Node + Hono<br/>Render 新加坡"]
  A -->|SQL| D[("Postgres<br/>Supabase 新加坡")]
  A -->|Messages API| C["Claude API"]
  A -->|每 12 小时| R["汇率 API"]
```

### 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 前端 | Vite + React + TypeScript，React Router，TanStack Query | 起步快；原型的 CSS 可以整块搬过去，class 名不用改 |
| 后端 | Node 22 + Hono + Zod | 轻量、全 TypeScript；时区换算代码和前端共用一份 |
| 数据库 | PostgreSQL（Supabase 托管），postgres.js 直接写 SQL | 不引入 ORM，表结构用一份 SQL 说清楚 |
| AI | Claude API（`@anthropic-ai/sdk`），默认模型 `claude-opus-5-5` | 结构化输出加流式输出；模型可用环境变量更换 |
| 部署 | Vercel（前端）、Render（后端）、Supabase（数据库） | 都有免费档，都能从 GitHub 自动部署 |

### 两条路线

| 路线 | 做什么 | 用时 | AI |
|---|---|---|---|
| A：原型直接上线 | 把 `site/index.html` 放到任意静态托管（第 7.1 节） | 10 分钟 | 关键词匹配 + 模板求职信。真 AI 只在 Claude 的分享链接里可用 |
| B：完整全栈 | 第 3 到 7 节 | 2 到 3 人约 1 到 2 天 | 后端调用 Claude API，三处 AI 全部真实运行 |

建议先走 A，保证任何时候都有能演示的版本，再并行做 B。

### 开工前确认 API 可用

Claude API 只在支持的国家和地区开放，中国大陆不在其中。团队或公司主体在中国大陆的话，先确认是否符合 Anthropic 的使用条款；不符合就换成比赛方提供或你们能合规使用的模型。所有模型调用都集中在 `api/src/ai/`，换供应商只需要改这个目录。

---

## 1. MVP 范围

### 求职者

- 用任意语言写一段自我介绍，AI 提取画像，推荐 5 个职位并用求职者的语言说明理由。
- 浏览、搜索、筛选：类别、日语等级、每周可用时长、无固定时段、隐藏半夜班次。
- 职位的在线时段换算成求职者当地时间；薪资同时显示日元和当地货币。
- 一键生成英文版和商务日语版求职信（流式输出），修改后投递。
- 跟踪申请进度：已投递 → 已查看 → 面试 → 录用。

### 雇主（原型里没有，全栈版新增）

- 用日语发布职位，AI 生成英文版、技能标签、类别和日语等级要求；雇主核对后发布。
- 查看申请人，读到的是日文求职信；打开申请列表即自动标记为"已查看"，可以改阶段。
- 雇主端界面用日语。

### 这一版不做

支付与合同、站内聊天、邮件通知、雇主资质自动审核、多语言界面、向量检索。见第 8 节。

### 3 分钟演示主线

1. 用雇主账号以日语发一条职位，现场展示 AI 生成的英文版，点发布。
2. 切到求职者，用葡萄牙语写自我介绍，点匹配。刚发布的职位出现在推荐里，理由是葡萄牙语写的。
3. 打开职位，展示在线时段换算成圣保罗时间。
4. 生成求职信，英文和敬语日文同时出现，投递。
5. 切回雇主，看到日文求职信，把阶段改成"面试"；求职者那边的进度条跟着变。

---

## 2. 仓库结构

```text
hanare/
├── prototype/index.html      # 现在的原型；种子数据从这里导出
├── site/index.html           # 原型的可部署版本（路线 A）
├── api/                      # 后端
│   ├── db/
│   │   ├── 001_init.sql      # 表结构
│   │   └── 002_seed.sql      # 种子数据，由脚本生成
│   ├── scripts/export-seed.mjs
│   ├── src/
│   │   ├── index.ts          # 入口：路由挂载、CORS、统一错误处理
│   │   ├── env.ts            # 环境变量校验
│   │   ├── db.ts             # 数据库连接
│   │   ├── auth.ts           # 登录令牌与权限中间件
│   │   ├── http.ts           # 错误格式、限流
│   │   ├── queries.ts        # 职位查询与类型
│   │   ├── lib/time.ts       # 时区换算（前端也用这份）
│   │   ├── ai/               # 所有模型调用都在这里
│   │   │   ├── client.ts     # Claude 客户端、调用日志
│   │   │   ├── match.ts      # AI 匹配
│   │   │   ├── draft.ts      # 求职信提示词
│   │   │   ├── translateJob.ts  # 日文职位转英文
│   │   │   └── fallback.ts   # 不用 AI 的兜底：关键词匹配、模板求职信
│   │   └── routes/           # meta / auth / jobs / applications / ai
│   ├── Dockerfile            # 只有用容器平台时才需要
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── web/                      # 前端
│   ├── src/
│   │   ├── main.tsx  App.tsx  types.ts
│   │   ├── lib/              # api.ts  sse.ts  time.ts  money.ts
│   │   ├── components/       # JobRow  JobDetail  TimeStrip  MatchBox  ApplyComposer ...
│   │   ├── pages/            # Board  Applications  Login  employer/*
│   │   └── styles/app.css    # 从原型搬过来的样式
│   ├── vercel.json
│   └── .env.example
├── docker-compose.yml        # 本地 Postgres
└── render.yaml               # Render 部署配置
```

---

## 3. 数据库

| 表 | 内容 |
|---|---|
| `users` | 账号：邮箱、密码哈希、角色（`worker` 求职者 / `employer` 雇主） |
| `worker_profiles` | 求职者资料：自我介绍原文、时区、货币、日语等级、语言、技能、每周时长 |
| `companies` | 公司：英文名、日文名、认证时间（人工核实后填写） |
| `jobs` | 职位：日文原文、AI 生成的英文、薪资、工时、在线时段、状态 |
| `applications` | 申请：英文版和日文版求职信、阶段；同一人同一职位只能投一次 |
| `saved_jobs` | 收藏 |
| `ai_calls` | 每次模型调用的类型、是否成功、token 数、耗时 |

设计要点：

- **在线时段统一存日本时间的分钟数。** `live_start_min` 是 0 到 1439，跨午夜的班次 `live_end_min` 会超过 1440（例如 22:00 到次日 02:00 存为 1320 和 1560）。两者都为空表示无固定时段。换算成各地时间由 `lib/time.ts` 完成，前后端共用。
- **雇主写日文，英文由 AI 填。** 新职位是 `draft` 状态，英文标题和描述都有内容后才能发布。
- **`hourly_equiv_yen` 用于"最高薪"排序。** 按篇、按视频分钟计价的职位要折算成时薪才能比较。
- **日语等级存数字：** 0 无要求，1 到 5 对应 N5 到 N1。

完整 SQL 在附录 A.3。种子数据由附录 A.4 的脚本从原型的 16 条职位生成，同时创建两个演示账号：

| 账号 | 密码 | 角色 |
|---|---|---|
| `employer@demo.hanare` | `hanare-demo` | 雇主，拥有全部 13 家示例公司 |
| `worker@demo.hanare` | `hanare-demo` | 求职者 |

---

## 4. 后端

### 4.1 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | Postgres 连接串。用 Supabase 时填 Session pooler 的地址（见 7.3） |
| `JWT_SECRET` | 是 | 至少 32 个字符的随机串，可用 `openssl rand -hex 32` 生成 |
| `CORS_ORIGINS` | 是 | 允许调用接口的前端地址，多个用逗号分隔，不带结尾斜杠 |
| `ANTHROPIC_API_KEY` | 否 | 留空时不调用 AI：匹配走关键词，求职信走模板，职位英文需要雇主手填 |
| `CLAUDE_MODEL` | 否 | 默认 `claude-opus-5-5` |
| `PORT` | 否 | 默认 8787；Render 会自动设置 |

### 4.2 接口一览

所有接口都以 `/api` 开头。需要登录的接口带请求头 `Authorization: Bearer <token>`。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/health` | 公开 | `{ok, db, ai}`，部署后先看这个 |
| GET | `/rates` | 公开 | 日元兑各币种汇率，每 12 小时刷新；取不到时用内置示意汇率 |
| POST | `/auth/register` | 公开 | `{email, password, role, displayName, company?}`，雇主必须带公司中日文名 |
| POST | `/auth/login` | 公开 | 返回 `{token, user}` |
| GET | `/me` | 登录 | 当前用户，加上求职者资料或雇主公司 |
| PUT | `/me/profile` | 求职者 | 更新资料 |
| GET | `/jobs` | 公开 | 职位列表。参数：`q` 搜索词，`cat` 类别，`jpMax` 日语上限，`hours` 每周可用小时，`async=1` 只看无固定时段，`sort=new\|pay` |
| GET | `/jobs/:id` | 公开 | 职位详情 |
| POST | `/jobs` | 雇主 | 用日文发布，AI 补全英文，返回草稿供核对 |
| PATCH | `/jobs/:id` | 雇主 | 修改英文字段、标签、类别、日语等级 |
| POST | `/jobs/:id/publish` | 雇主 | 发布；英文标题或描述为空时拒绝 |
| GET | `/employer/jobs` | 雇主 | 自己公司的全部职位，含草稿 |
| POST | `/applications` | 求职者 | `{jobId, messageEn, messageJa}` |
| GET | `/applications` | 登录 | 求职者看自己的；雇主看收到的，并把"已投递"标成"已查看" |
| PATCH | `/applications/:id` | 雇主 | `{stage}`：`viewed`、`interview`、`offer`、`rejected` |
| GET / PUT / DELETE | `/saved`、`/saved/:jobId` | 求职者 | 收藏 |
| POST | `/ai/match` | 公开 | `{bio, tz, place}`，返回画像和 5 个推荐。登录的求职者会顺便保存自我介绍 |
| POST | `/ai/draft` | 公开 | `{jobId, bio, tz, place}`，以 SSE 流式返回求职信 |

错误统一是这个格式，前端直接把 `message` 显示给用户：

```json
{ "error": { "code": "already_applied", "message": "You already applied to this job." } }
```

`/ai/draft` 的事件流：

```text
event: delta
data: {"text":"Hello,\n\nI would like to apply"}

event: delta
data: {"text":" for the ..."}

event: done
data: {"source":"ai","truncated":false}
```

把所有 `delta` 的 `text` 拼起来，以单独一行 `===JA===` 为界，前面是英文版，后面是日文版。出错时最后一个事件是 `event: error`，`data` 里有 `code` 和 `message`。

### 4.3 AI 设计

产品里有三处用到 AI：

| 功能 | 在哪里 | 输出方式 | 思考强度 | 失败时 |
|---|---|---|---|---|
| 职位匹配 | `POST /ai/match` | 结构化输出，用 Zod 定义返回格式 | `low`，优先速度 | 关键词匹配 |
| 求职信 | `POST /ai/draft` | 流式输出：英文，`===JA===`，日文 | `medium` | 中英双语模板 |
| 职位英文化 | `POST /jobs` 内部调用 | 结构化输出 | `medium` | 英文留空，雇主手填 |

做法：

- **模型。** 默认 `claude-opus-5-5`，用 `CLAUDE_MODEL` 更换。想要更快更便宜可以换成 `claude-haiku-5-5`，换之前用几份真实自我介绍对比一下推荐质量。
- **服务端拒答回退已开启。** 模型拒绝回答时，API 会在同一次调用里换备用模型重跑，代码不用额外处理。Haiku 不支持这项，换成 Haiku 时代码会自动关掉。
- **模型输出不直接用。** 匹配时职位按 1 到 n 编号交给模型，返回后再映射回真实 id；不存在的编号和重复项丢掉，分数限制在 0 到 100。
- **在线时段先换算好再给模型。** 每个职位换算成求职者当地时间的时段在服务端算好，模型只负责判断，不负责算时区。
- **职位目录开了提示词缓存。** 目录放在 system 里，只在职位变动时变化，不同求职者之间可以复用缓存。
- **没有 API key 也能完整运行。** 本地开发和前端联调都不需要 key。
- **限流。** 每个 IP 每分钟最多匹配 8 次、生成求职信 6 次、注册或登录 10 次。现在是内存实现，部署多个实例时要换成 Redis。
- **成本看得见。** 每次调用写一行 `ai_calls`。用下面的 SQL 按 Opus 5.5 的价格（每百万输入 token 4 美元、输出 20 美元）估算最近一天的花费，另外记得在 Claude Console 里给 API key 设消费上限。

```sql
select kind, count(*) as calls, round(avg(ms)) as avg_ms,
       round((sum(input_tokens) * 4 + sum(output_tokens) * 20) / 1e6, 2) as usd
from ai_calls
where created_at > now() - interval '1 day'
group by kind;
```

三段提示词在附录 A 的 `ai/match.ts`、`ai/draft.ts`、`ai/translateJob.ts` 里，原型时期的两段提示词已经按这个结构改写过。

### 4.4 登录方式

- 密码用 bcrypt 哈希保存；登录后发 7 天有效的 JWT（HS256）。
- 前后端在不同域名，所以令牌放在 `Authorization` 请求头里，前端存在 `localStorage`，不用 Cookie，省掉跨站 Cookie 的麻烦。
- 正式上线想更安全，可以改成 httpOnly Cookie，再让前端通过同域代理访问后端。

---

## 5. 前端

### 5.1 初始化

```bash
npm create vite@latest web -- --template react-ts
```

```bash
cd web && npm install react-router @tanstack/react-query
```

然后：

1. 把附录 B 的文件放进对应位置（`lib/time.ts` 直接复制后端的 `api/src/lib/time.ts`）。
2. 把原型 `index.html` 里 `<style>` 和 `</style>` 之间的内容复制到 `src/styles/app.css`，并在最前面加上 `body{margin:0}` 和 `[hidden]{display:none!important}` 两行。class 名保持不变，组件直接沿用原型的 class。
3. 复制 `.env.example` 为 `.env`，`npm run dev`。

### 5.2 路由与页面

| 路由 | 页面 | 调用的接口 | 对应原型 |
|---|---|---|---|
| `/` | 首屏、匹配框、筛选、列表、详情 | `GET /jobs`、`POST /ai/match`、`GET /rates` | 职位视图 |
| `/jobs/:id` | 同上，选中某个职位，可直接分享 | `GET /jobs/:id` | 详情面板 |
| `/applications` | 申请进度和收藏 | `GET /applications`、`GET /saved` | 申请视图 |
| `/login`、`/signup` | 登录、注册（选择身份） | `POST /auth/login`、`POST /auth/register` | 新增 |
| `/employer` | 雇主后台：我的职位和申请人数 | `GET /employer/jobs` | 新增 |
| `/employer/jobs/new` | 日文发布表单 → AI 英文预览 → 修改 → 发布 | `POST /jobs`、`PATCH /jobs/:id`、`POST /jobs/:id/publish` | 新增 |
| `/employer/applicants` | 申请人列表，读日文求职信，改阶段 | `GET /applications`、`PATCH /applications/:id` | 新增 |

雇主发布表单的字段：職種名、仕事内容、報酬（円）、報酬の単位、週の稼働時間（最小〜最大）、稼働時間帯（日本時間，可留空）、稼働曜日。

### 5.3 原型代码怎么搬

| 原型 `index.html` 里的函数 | 全栈版的位置 |
|---|---|
| `rowHtml`、`renderList` | `components/JobRow.tsx`，列表在 `pages/Board.tsx` |
| `renderDetail` | `components/JobDetail.tsx` |
| `stripHtml` | `components/TimeStrip.tsx` |
| `estText` 和工时滑块 | `components/PayEstimate.tsx` |
| `runMatch`、`renderMatchOut` | `components/MatchBox.tsx`，改为请求 `POST /ai/match` |
| `runDraft`、`sendApp` | `components/ApplyComposer.tsx`（附录 B 已给出） |
| `renderApps` | `pages/Applications.tsx`（附录 B 有最简版） |
| `liveInfo`、`tzOffsetMin`、`hm` | `lib/time.ts`，前后端同一份 |
| `localMoney` 和 `RATES` | `lib/money.ts`，汇率改为请求 `GET /rates` |
| `localMatch`、`templateDraft` | 已移到后端 `ai/fallback.ts` |
| `matchPrompt`、`draftPrompt` | 已移到后端 `ai/match.ts`、`ai/draft.ts` |
| `store`（localStorage） | 收藏和申请改走接口；城市选择、登录令牌仍存 `localStorage` |
| `JOBS` 数组 | 变成数据库里的种子数据 |

### 5.4 数据与状态

- 服务端数据都用 TanStack Query。查询键：`["jobs", 筛选条件]`、`["job", id]`、`["applications"]`、`["saved"]`、`["rates"]`、`["me"]`。投递、收藏、发布之后 `invalidateQueries` 对应的键。
- 匹配结果只放在页面状态里：拿到 `matches` 后在前端把列表按分数排序，并在每行显示分数和理由。
- "隐藏半夜班次"取决于看的人在哪个时区，所以在前端用 `liveInfo` 过滤，接口不处理。
- 城市选择存 `localStorage`，同时决定时区（IANA 名称，如 `America/Sao_Paulo`）和货币。
- 接口地址来自构建时的环境变量 `VITE_API_URL`，改了要重新构建。

---

## 6. 本地开发

需要 Node 20.6 以上和 Docker（只用来跑 Postgres；没有 Docker 可以直接连一个 Supabase 项目）。

1. 把原型放到 `prototype/index.html`，安装后端依赖并导出种子数据：

```bash
cd api && npm install && npm run seed:export
```

2. 回到仓库根目录启动数据库。第一次启动会按文件名顺序执行 `api/db/` 下的两个 SQL：

```bash
docker compose up -d db
```

如果启动数据库时还没有 `002_seed.sql`，导出后需要清掉数据卷重来：`docker compose down -v`，再 `docker compose up -d db`。

3. 启动后端（`ANTHROPIC_API_KEY` 可以先留空）：

```bash
cd api && cp .env.example .env && npm run dev
```

4. 另开一个终端启动前端，打开 http://localhost:5173 ：

```bash
cd web && npm install && cp .env.example .env && npm run dev
```

5. 确认后端正常：

```bash
curl -s localhost:8787/api/health
```

没有 Docker 时，在 Supabase 的 SQL Editor 里依次执行 `001_init.sql` 和 `002_seed.sql`，把 `.env` 的 `DATABASE_URL` 换成 Supabase 的连接串即可。

---

## 7. 部署

### 7.1 路线 A：原型直接上线

`site/index.html` 是原型加上完整 HTML 外壳的版本，任何静态托管都能用。原型文件本身缺少 `<!doctype html>`，直接上传会以怪异模式渲染，所以要用 `site/` 里的这份。

三选一：

- **Netlify Drop：** 浏览器打开 https://app.netlify.com/drop ，把 `site` 文件夹拖进去，马上得到网址。
- **Vercel：** 在 `site` 目录里执行 `npx vercel deploy --prod`，第一次会要求登录。
- **GitHub Pages：** 把 `site/index.html` 推到仓库，在仓库 Settings → Pages 里选择分支和目录。

离开 Claude 之后，原型里的 AI 会自动降级成关键词匹配和模板求职信。要给评委看真 AI，用 Claude 的分享链接，或者走路线 B。

### 7.2 路线 B：总体顺序

1. Supabase 建数据库，导入表结构和种子数据。
2. Render 部署后端，填数据库地址和 API key。
3. Vercel 部署前端，填后端地址。
4. 把前端地址填回 Render 的 `CORS_ORIGINS`。

需要准备：GitHub 账号（代码推上去）、Supabase、Render、Vercel 账号，以及 Claude Console 里创建的 API key。

### 7.3 数据库：Supabase

1. 新建项目，Region 选 Southeast Asia (Singapore)，和后端放同一个区域。记下数据库密码。
2. 打开 SQL Editor，粘贴 `api/db/001_init.sql` 执行；再粘贴 `api/db/002_seed.sql` 执行。
3. 点项目顶部的 Connect，复制 **Session pooler** 的连接串，把里面的 `[YOUR-PASSWORD]` 换成第 1 步的密码，这就是 `DATABASE_URL`。不要用 Direct connection：它默认只有 IPv6 地址，Render 连不上。
4. 免费项目一周没有访问会被暂停，演示前登录确认一下状态。

### 7.4 后端：Render

1. 把整个仓库推到 GitHub，根目录要有 `render.yaml`（附录 A.12）。
2. Render 控制台选 New → Blueprint，选这个仓库。Render 会读取 `render.yaml`，在新加坡区域创建 `hanare-api`，并自动生成 `JWT_SECRET`。
3. 按提示填写：
   - `DATABASE_URL`：上一步的连接串
   - `ANTHROPIC_API_KEY`：Claude Console 里创建的 key
   - `CORS_ORIGINS`：前端地址还没有，先填 `http://localhost:5173`，7.5 完成后再改
4. 部署完成后打开 `https://<服务名>.onrender.com/api/health`，应看到 `{"ok":true,"db":true,"ai":true}`。

不用 Blueprint 也可以手动建 Web Service：Root Directory 填 `api`，Build Command 填 `npm ci --include=dev && npm run build`，Start Command 填 `npm start`，Health Check Path 填 `/api/health`，环境变量照 4.1 填。构建命令里的 `--include=dev` 不能省，打包工具 esbuild 在 devDependencies 里。

免费档闲置约 15 分钟会休眠，之后第一个请求要等几十秒。演示当天改成付费的 Starter 档，或者演示前几分钟先打开一次 `/api/health`。

### 7.5 前端：Vercel

1. Vercel 控制台 Add New → Project，导入同一个仓库。
2. Root Directory 选 `web`，Framework Preset 会自动识别为 Vite。
3. Environment Variables 加 `VITE_API_URL`，值是后端地址，例如 `https://hanare-api.onrender.com`，不带结尾斜杠。
4. Deploy。`web/vercel.json` 已经把所有路径回落到 `index.html`，直接打开或刷新 `/jobs/...` 不会 404。
5. 复制 Vercel 给的地址（例如 `https://hanare.vercel.app`），回到 Render 把 `CORS_ORIGINS` 改成它。要让预览部署也能调用，就把预览地址也加上，用逗号分隔。保存后 Render 会重新部署。

`VITE_API_URL` 是构建时写进代码的，改了之后要在 Vercel 重新部署前端。

### 7.6 上线检查

先设好后端地址：

```bash
API=https://hanare-api.onrender.com/api
```

健康检查，`ai` 必须是 `true`：

```bash
curl -s $API/health
```

职位列表应有 16 条：

```bash
curl -s "$API/jobs" | head -c 300
```

真 AI 匹配，返回里 `source` 应该是 `"ai"`。如果是 `"keyword"`，看 7.8：

```bash
curl -s -X POST $API/ai/match -H 'Content-Type: application/json' -d '{"bio":"ESL teacher in Manila, native English, no Japanese, 12 hours a week","tz":"Asia/Manila","place":"Manila"}'
```

然后在浏览器里把第 1 节的演示主线完整走一遍。

### 7.7 演示当天

- Render 升到 Starter 档，或演示前打开一次 `/api/health` 把服务叫醒。
- 确认 Supabase 项目没有被暂停。
- 在 Claude Console 给 API key 设消费上限。
- 准备好两个演示账号，提前登录在两个浏览器里（一个普通窗口，一个无痕窗口）。
- 保留路线 A 的网址做备用。

### 7.8 常见问题

| 现象 | 原因和处理 |
|---|---|
| 浏览器控制台报 CORS 错误 | `CORS_ORIGINS` 里没有当前前端地址。要带 `https://`，不带结尾斜杠，和地址栏完全一致 |
| `/api/health` 里 `db` 是 `false` | `DATABASE_URL` 用了 Direct connection，或密码没替换，或 Supabase 项目被暂停 |
| `/api/health` 里 `ai` 是 `false` | 没填 `ANTHROPIC_API_KEY`，填了之后要重新部署 |
| 匹配一直是 `keyword` | 看 Render 日志里的 `match failed`：401 是 key 不对；429 是限流或额度用完；400 多半是模型名写错，或账号没有这个模型的权限 |
| 第一个请求要等很久 | Render 免费档休眠，见 7.4 |
| 刷新子页面出现 404 | `web/vercel.json` 没有提交，或 Vercel 的 Root Directory 没选 `web` |
| 改了 `VITE_API_URL` 没生效 | 前端要重新部署才会生效 |
| Render 构建报 `esbuild: not found` | 构建命令少了 `--include=dev` |

### 7.9 其他托管选择

- **想把后端放在东京：** Fly.io 有东京区域（`nrt`），用附录 A.11 的 Dockerfile 部署，数据库同时选 Supabase 的东京区域。
- **Railway、Google Cloud Run：** 同样用这个 Dockerfile，环境变量照 4.1 填。

---

## 8. 之后再做

- **职位多了以后的匹配：** 超过一两百条时，先用 SQL 按语言和日语等级过滤，再用向量检索（例如 pgvector）取前 30 条交给模型排序。Claude 不提供 embedding 接口，需要另选 embedding 服务。
- **通知：** 新申请、阶段变化发邮件。
- **雇主认证流程：** 上传法人登记信息，人工审核后写入 `companies.verified_at`。
- **合同与跨境付款：** 業務委託合同模板、按月付款。这部分涉及日本和求职者所在国的税务与劳动法规，上线前找专业人士确认。
- **界面多语言：** 求职者端加中文、西班牙语、葡萄牙语等，雇主端保持日语。
- **安全加固：** httpOnly Cookie、刷新令牌、Redis 限流、接口测试。

---

## 附录 A：后端完整代码

以下文件都在 `api/` 目录下，A.12 和 A.13 在仓库根目录。

### A.1 package.json

`api/package.json`

```json
{
  "name": "hanare-api",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.6"
  },
  "scripts": {
    "dev": "tsx watch --env-file=.env src/index.ts",
    "build": "esbuild src/index.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/index.js",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "seed:export": "node scripts/export-seed.mjs ../prototype/index.html > db/002_seed.sql"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^1.9.0",
    "@hono/node-server": "^2.1.8",
    "bcryptjs": "^3.0.3",
    "hono": "^4.13.19",
    "postgres": "^4.1.1",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@types/node": "^26.6.6",
    "esbuild": "^0.28.2",
    "tsx": "^4.23.15",
    "typescript": "^7.0.2"
  }
}
```

### A.2 tsconfig.json 和 .env.example

`api/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

`api/.env.example`

```bash
PORT=8787
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hanare
# Leave empty to run without AI: matching falls back to keywords, drafts to a template
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-opus-5-5
# 32+ random characters: openssl rand -hex 32
JWT_SECRET=change-me-change-me-change-me-change-me
# comma-separated list of frontend origins allowed to call the API
CORS_ORIGINS=http://localhost:5173
```

### A.3 db/001_init.sql

`api/db/001_init.sql`

```sql
-- Hanare schema. Postgres 15+ (gen_random_uuid() is built in).

create type user_role  as enum ('worker', 'employer');
create type job_status as enum ('draft', 'open', 'closed');
create type pay_unit   as enum ('hr', 'article', 'video_minute', 'finished_minute');
create type app_stage  as enum ('sent', 'viewed', 'interview', 'offer', 'rejected');

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  role          user_role not null,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

-- One row per worker. bio_raw is what they typed (any language); the rest is what the AI extracted.
create table worker_profiles (
  user_id        uuid primary key references users(id) on delete cascade,
  bio_raw        text not null default '',
  tz             text not null default 'UTC',          -- IANA zone, e.g. America/Sao_Paulo
  currency       char(3) not null default 'USD',
  jp_level       smallint not null default 0 check (jp_level between 0 and 5),  -- 0 none, 1 N5 ... 5 N1
  languages      text[] not null default '{}',
  skills         text[] not null default '{}',
  hours_per_week smallint,
  updated_at     timestamptz not null default now()
);

create table companies (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references users(id) on delete set null,
  name_en     text not null,
  name_ja     text not null,
  verified_at timestamptz,                              -- set by hand after checking registration
  created_at  timestamptz not null default now()
);

create table jobs (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  status           job_status not null default 'draft',
  category         char(1) not null check (category in ('L','T','M','S','Q','C','R')),
  -- the employer writes Japanese; the AI fills the English columns, the employer reviews them
  title_ja         text not null,
  desc_ja          text not null,
  title_en         text not null default '',
  desc_en          text not null default '',
  tasks_en         text[] not null default '{}',
  reqs_en          text[] not null default '{}',
  tags             text[] not null default '{}',
  languages        text[] not null default '{}',
  jp_level         smallint not null default 0 check (jp_level between 0 and 5),
  pay_yen          integer not null check (pay_yen > 0),
  pay_unit         pay_unit not null default 'hr',
  hourly_equiv_yen integer not null check (hourly_equiv_yen > 0),  -- for "highest pay" sorting
  hours_min        smallint not null check (hours_min > 0),
  hours_max        smallint not null,
  -- live hours in JST minutes after midnight; end may pass 1440 for shifts that cross midnight
  live_start_min   smallint check (live_start_min between 0 and 1439),
  live_end_min     smallint,
  live_days        text,
  created_at       timestamptz not null default now(),
  published_at     timestamptz,
  check (hours_max >= hours_min),
  check ((live_start_min is null) = (live_end_min is null)),
  check (live_end_min is null or (live_end_min > live_start_min and live_end_min <= live_start_min + 1440))
);
create index jobs_open_idx on jobs (status, published_at desc);
create index jobs_tags_idx on jobs using gin (tags);

create table applications (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  worker_id  uuid not null references users(id) on delete cascade,
  message_en text not null,
  message_ja text not null,
  stage      app_stage not null default 'sent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id)
);
create index applications_worker_idx on applications (worker_id, created_at desc);

create table saved_jobs (
  user_id    uuid not null references users(id) on delete cascade,
  job_id     uuid not null references jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- One row per model call: lets you watch cost and latency during the demo.
create table ai_calls (
  id            bigint generated always as identity primary key,
  kind          text not null,            -- match | draft | translate_job
  user_id       uuid,
  ok            boolean not null,
  input_tokens  integer,
  output_tokens integer,
  ms            integer not null,
  created_at    timestamptz not null default now()
);
```

### A.4 scripts/export-seed.mjs

从原型的 `JOBS` 数组生成 `db/002_seed.sql`。在 `api/` 目录执行 `npm run seed:export`。

`api/scripts/export-seed.mjs`

```js
// Turns the 16 sample jobs in the prototype into seed SQL, plus two demo accounts.
// Usage (from api/): node scripts/export-seed.mjs ../prototype/index.html > db/002_seed.sql
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { hashSync } from "bcryptjs";

const html = readFileSync(process.argv[2], "utf8");
const m = html.match(/var JOBS = (\[[\s\S]*?\n\]);/);
if (!m) throw new Error("Could not find `var JOBS = [...]` in " + process.argv[2]);
const JOBS = vm.runInNewContext(m[1]); // the prototype is your own file; this only evaluates the array literal

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => (a.length ? "array[" + a.map(q).join(", ") + "]" : "'{}'::text[]");
const UNIT = { hr: "hr", article: "article", "video minute": "video_minute", "finished minute": "finished_minute" };

const DEMO_PASSWORD = "hanare-demo";
const out = [
  "-- Generated by scripts/export-seed.mjs. Demo password for both accounts: " + DEMO_PASSWORD,
  "begin;",
  `insert into users (email, password_hash, role, display_name) values
  ('employer@demo.hanare', ${q(hashSync(DEMO_PASSWORD, 10))}, 'employer', 'Demo Employer'),
  ('worker@demo.hanare',   ${q(hashSync(DEMO_PASSWORD, 10))}, 'worker',   'Demo Worker');`,
  "insert into worker_profiles (user_id) select id from users where email = 'worker@demo.hanare';",
];

const companies = new Map();
for (const j of JOBS) if (!companies.has(j.co)) companies.set(j.co, { ja: j.coJa, verified: j.verified });
for (const [en, c] of companies) {
  out.push(
    `insert into companies (owner_id, name_en, name_ja, verified_at)
  select id, ${q(en)}, ${q(c.ja)}, ${c.verified ? "now()" : "null"} from users where email = 'employer@demo.hanare';`,
  );
}

for (const j of JOBS) {
  const unit = UNIT[j.unit];
  if (!unit) throw new Error(`Unknown pay unit "${j.unit}" on ${j.id}`);
  out.push(`insert into jobs (company_id, status, category, title_ja, desc_ja, title_en, desc_en, tasks_en, reqs_en, tags, languages,
  jp_level, pay_yen, pay_unit, hourly_equiv_yen, hours_min, hours_max, live_start_min, live_end_min, live_days, published_at)
select id, 'open', ${q(j.cat)}, ${q(j.ja)}, ${q(j.descJa)}, ${q(j.title)}, ${q(j.desc)}, ${arr(j.tasks)}, ${arr(j.reqs)}, ${arr(j.tags)}, ${arr(j.langs)},
  ${j.jp}, ${j.pay}, '${unit}', ${j.hrEq}, ${j.hours[0]}, ${j.hours[1]},
  ${j.live ? j.live.s : "null"}, ${j.live ? j.live.e : "null"}, ${j.live ? q(j.live.days) : "null"}, now() - interval '${j.posted} days'
from companies where name_en = ${q(j.co)};`);
}
out.push("commit;", "");
process.stdout.write(out.join("\n\n"));
```

### A.5 src/index.ts

`api/src/index.ts`

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ZodError } from "zod";
import { corsOrigins, env } from "./env";
import { fail } from "./http";
import { aiRoutes } from "./routes/ai";
import { applicationRoutes } from "./routes/applications";
import { authRoutes } from "./routes/auth";
import { jobRoutes } from "./routes/jobs";
import { metaRoutes } from "./routes/meta";

const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: corsOrigins,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);

app.route("/api", metaRoutes);
app.route("/api", authRoutes);
app.route("/api", jobRoutes);
app.route("/api", applicationRoutes);
app.route("/api", aiRoutes);

app.notFound((c) => fail(c, 404, "not_found", "No such endpoint."));
app.onError((err, c) => {
  if (err instanceof ZodError) {
    return fail(c, 400, "invalid_input", err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  if (err instanceof SyntaxError) return fail(c, 400, "invalid_json", "The request body is not valid JSON.");
  console.error(err);
  return fail(c, 500, "server_error", "Something went wrong on our side. Try again.");
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => console.log(`Hanare API listening on :${info.port}`));
```

### A.6 src/env.ts、src/db.ts、src/http.ts

`api/src/env.ts`

```ts
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(), // empty = run without AI (keyword match + template drafts)
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET needs at least 32 characters"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
});

export const env = Env.parse(process.env);
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
```

`api/src/db.ts`

```ts
import postgres from "postgres";
import { env } from "./env";

// prepare:false keeps this working behind Supabase's transaction pooler (port 6543) as well.
// Columns come back camelCase (title_en -> titleEn), which is what the frontend reads.
export const sql = postgres(env.DATABASE_URL, {
  max: 5,
  prepare: false,
  transform: { column: { from: postgres.toCamel } },
});
```

`api/src/http.ts`

```ts
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// Every error leaves the API in one shape: { error: { code, message } }
export const fail = (c: Context, status: ContentfulStatusCode, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

// In-memory sliding window per IP and path. Enough for one instance; use Redis if you scale out.
const hits = new Map<string, number[]>();
export const rateLimit = (limit: number, windowMs = 60_000) =>
  createMiddleware(async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = `${c.req.path}:${ip}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return fail(c, 429, "rate_limited", "Too many requests. Wait a minute and try again.");
    recent.push(now);
    hits.set(key, recent);
    await next();
  });
```

### A.7 src/auth.ts

`api/src/auth.ts`

```ts
import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import { env } from "./env";
import { fail } from "./http";

export type Role = "worker" | "employer";
export type AuthUser = { id: string; role: Role };
export type AuthEnv = { Variables: { user: AuthUser } };

const WEEK = 60 * 60 * 24 * 7;

export const issueToken = (u: AuthUser) =>
  sign({ sub: u.id, role: u.role, exp: Math.floor(Date.now() / 1000) + WEEK }, env.JWT_SECRET, "HS256");

// Returns the signed-in user, or null for anonymous requests and bad tokens.
export async function readUser(authorization: string | undefined): Promise<AuthUser | null> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  try {
    const p = await verify(token, env.JWT_SECRET, "HS256");
    if (typeof p.sub === "string" && (p.role === "worker" || p.role === "employer")) return { id: p.sub, role: p.role };
  } catch {
    // expired or tampered token: treat as signed out
  }
  return null;
}

export const requireUser = (role?: Role) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const user = await readUser(c.req.header("Authorization"));
    if (!user) return fail(c, 401, "unauthorized", "Sign in to continue.");
    if (role && user.role !== role) return fail(c, 403, "forbidden", `This needs ${role === "employer" ? "an employer" : "a worker"} account.`);
    c.set("user", user);
    await next();
  });
```

### A.8 src/queries.ts 和 src/lib/time.ts

`api/src/queries.ts`

```ts
import { sql } from "./db";

// JLPT levels as stored in jp_level: 0 none, 1 N5 ... 5 N1
export const JP = ["none", "N5", "N4", "N3", "N2", "N1"] as const;

export type PayUnit = "hr" | "article" | "video_minute" | "finished_minute";

export type JobRow = {
  id: string;
  status: "draft" | "open" | "closed";
  category: string;
  titleEn: string;
  titleJa: string;
  descEn: string;
  descJa: string;
  tasksEn: string[];
  reqsEn: string[];
  tags: string[];
  languages: string[];
  jpLevel: number;
  payYen: number;
  payUnit: PayUnit;
  hourlyEquivYen: number;
  hoursMin: number;
  hoursMax: number;
  liveStartMin: number | null; // JST minutes after midnight
  liveEndMin: number | null;
  liveDays: string | null;
  publishedAt: Date | null;
  companyId: string;
  companyEn: string;
  companyJa: string;
  verified: boolean;
  applicants: number;
};

// Shared SELECT for every job read. Call it as a fragment: sql`${jobSelect()} where ...`
export const jobSelect = () => sql`
  select j.id, j.status, j.category, j.title_en, j.title_ja, j.desc_en, j.desc_ja, j.tasks_en, j.reqs_en,
         j.tags, j.languages, j.jp_level, j.pay_yen, j.pay_unit, j.hourly_equiv_yen, j.hours_min, j.hours_max,
         j.live_start_min, j.live_end_min, j.live_days, j.published_at,
         c.id as company_id, c.name_en as company_en, c.name_ja as company_ja, c.verified_at is not null as verified,
         (select count(*)::int from applications a where a.job_id = j.id) as applicants
  from jobs j
  join companies c on c.id = j.company_id`;
```

`api/src/lib/time.ts`

```ts
// Same logic as the prototype's liveInfo(); copy this file to web/src/lib/time.ts as well.
export const JST_OFFSET = 540; // minutes east of UTC

export function tzOffsetMin(tz: string, at = new Date()): number {
  try {
    const p: Record<string, string> = {};
    for (const x of new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at)) p[x.type] = x.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 0; // unknown zone: treat as UTC
  }
}

export const hm = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

export type Verdict = "good" | "warn" | "bad" | "async";

// Converts a JST live window into the viewer's zone and judges how it lands in their day.
export function liveInfo(startJst: number | null, endJst: number | null, tz: string) {
  if (startJst == null || endJst == null) return { verdict: "async" as Verdict, text: "No fixed hours" };
  const len = endJst - startJst;
  const local = (((startJst + tzOffsetMin(tz) - JST_OFFSET) % 1440) + 1440) % 1440;
  const overlap = (lo: number, hi: number) =>
    [[local, local + len], [local - 1440, local + len - 1440]].reduce(
      (t, [a, b]) => t + Math.max(0, Math.min(b, hi) - Math.max(a, lo)), 0);
  const night = overlap(0, 360);
  const edge = overlap(360, 480) + overlap(1320, 1440);
  const verdict: Verdict = night >= len / 2 ? "bad" : night > 0 || edge > 0 ? "warn" : "good";
  return { verdict, startLocal: local, len, text: `${hm(local)}–${hm(local + len)}` };
}
```

### A.9 src/ai/

`client.ts`：

`api/src/ai/client.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "../db";
import { env } from "../env";

// null when ANTHROPIC_API_KEY is empty: every AI route then uses its non-AI fallback
export const claude = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 90_000 }) : null;
export const MODEL = env.CLAUDE_MODEL;

// Server-side refusal fallback: if the model declines, the API re-runs the request on a fallback model
// inside the same call. Opus 5.5 / Opus 5 / Sonnet 5.5 / Fable support it; Haiku does not, so it switches off there.
export const fallbackParams = /^claude-(opus-5|sonnet-5-5|fable-5)/.test(MODEL)
  ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
  : {};

type Usage = { input_tokens: number; output_tokens: number };

// One row per call in ai_calls, so you can watch cost and latency during the demo.
export async function logCall(kind: string, userId: string | null, started: number, ok: boolean, usage?: Usage) {
  await sql`
    insert into ai_calls (kind, user_id, ok, input_tokens, output_tokens, ms)
    values (${kind}, ${userId}, ${ok}, ${usage?.input_tokens ?? null}, ${usage?.output_tokens ?? null}, ${Date.now() - started})
  `.catch((e) => console.error("ai_calls insert failed", e));
}
```

`match.ts`：

`api/src/ai/match.ts`

```ts
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { liveInfo, tzOffsetMin } from "../lib/time";
import { JP, type JobRow } from "../queries";
import { claude, fallbackParams, logCall, MODEL } from "./client";
import { keywordMatch } from "./fallback";

const MatchOut = z.object({
  profile: z.object({
    languages: z.array(z.string()),
    japaneseLevel: z.enum(JP),
    skills: z.array(z.string()),
    hoursPerWeek: z.number().int().nullable(),
    summary: z.string(),
  }),
  matches: z.array(z.object({ job: z.number().int(), score: z.number().int(), why: z.string() })),
});

export type Profile = z.infer<typeof MatchOut>["profile"];
export type Match = { jobId: string; score: number; why: string };
export type MatchResult = { source: "ai" | "keyword"; profile: Profile; matches: Match[]; note?: string };

const SYSTEM = `You rank remote part-time jobs at Japanese companies for one candidate who lives outside Japan.

Read the candidate's self-description, which may be in any language. Extract their profile, score the jobs in the catalog from 0 to 100, and return the 5 best, best first.

Scoring:
- Lower the score sharply when a job needs more Japanese than the candidate has, or a language they do not speak.
- Lower it when the job's live hours fall between 00:00 and 06:00 in the candidate's local time. Local live hours are listed in the request.
- Raise it for concrete skill overlap and when their weekly hours fit the job's range.
- Use only what the candidate wrote. Do not assume skills, languages or a Japanese level they did not state; with no Japanese level stated, use "none".

Write each "why" in the language the candidate wrote in: one sentence of at most 24 words naming the concrete reasons.
Write profile.summary in English, one short sentence.`;

// Jobs are numbered 1..n so the model returns short numbers instead of copying UUIDs.
const catalog = (jobs: JobRow[]) =>
  jobs.map((j, i) => ({
    job: i + 1,
    title: j.titleEn,
    category: j.category,
    japanese: j.jpLevel ? `${JP[j.jpLevel]} or better` : "not needed",
    languages: j.languages,
    hoursPerWeek: `${j.hoursMin}-${j.hoursMax}`,
    skills: j.tags,
    pay: `¥${j.payYen} per ${j.payUnit.replace("_", " ")}`,
  }));

export async function matchJobs(
  input: { bio: string; tz: string; place: string; userId: string | null },
  jobs: JobRow[],
): Promise<MatchResult> {
  if (!claude) return { ...keywordMatch(input.bio, input.tz, jobs), note: "AI is off on this server, so this is a keyword match." };

  const off = tzOffsetMin(input.tz) / 60;
  const localHours = jobs.map((j, i) => `#${i + 1}: ${liveInfo(j.liveStartMin, j.liveEndMin, input.tz).text}`).join("\n");
  const started = Date.now();
  try {
    const res = await claude.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...fallbackParams,
      output_config: { effort: "low", format: betaZodOutputFormat(MatchOut) },
      system: [
        { type: "text", text: SYSTEM },
        // The catalog changes only when jobs change, so it is cached across candidates.
        { type: "text", text: "JOB CATALOG (JSON):\n" + JSON.stringify(catalog(jobs)), cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content:
            `Candidate lives in ${input.place} (UTC${off >= 0 ? "+" : ""}${off}).\n\n` +
            `Live hours of each job in the candidate's local time:\n${localHours}\n\n` +
            `CANDIDATE:\n"""\n${input.bio.slice(0, 2000)}\n"""`,
        },
      ],
    });
    await logCall("match", input.userId, started, true, res.usage);
    const out = res.parsed_output;
    if (res.stop_reason === "refusal" || !out) throw new Error(`no usable output (stop_reason=${res.stop_reason})`);

    // Never trust model output blindly: map numbers back to real jobs, drop unknowns and repeats, clamp scores.
    const seen = new Set<string>();
    const matches = out.matches
      .flatMap((m) => {
        const job = jobs[m.job - 1];
        if (!job || seen.has(job.id)) return [];
        seen.add(job.id);
        return [{ jobId: job.id, score: Math.max(0, Math.min(100, Math.round(m.score))), why: m.why.slice(0, 240) }];
      })
      .slice(0, 5);
    if (!matches.length) throw new Error("model returned no valid job numbers");
    return { source: "ai", profile: out.profile, matches };
  } catch (err) {
    console.error("match failed, using keyword fallback:", err);
    await logCall("match", input.userId, started, false);
    return { ...keywordMatch(input.bio, input.tz, jobs), note: "The AI match did not come through, so this is a keyword match." };
  }
}
```

`draft.ts`：

`api/src/ai/draft.ts`

```ts
import { hm, liveInfo } from "../lib/time";
import type { JobRow } from "../queries";

export const DRAFT_SYSTEM = `You write job applications for people who live outside Japan and apply to remote part-time jobs at Japanese companies.

Output exactly two parts separated by a line containing only ===JA===
Part 1: the message in English, 90 to 130 words, first person, warm and specific to this job. Plain text: no subject line, no markdown.
Part 2: the same message in natural, polite business Japanese (です・ます with appropriate 敬語), opening with ご担当者様. Plain text: no romaji, no markdown.

Use only facts given in the request. Never invent employers, degrees, years of experience or a name. Sign off with [Your name] in English and ［お名前］ in Japanese. If the candidate gave no background, write a neutral draft with [square brackets] where they must add their own experience.`;

export function draftRequest(job: JobRow, bio: string, place: string, tz: string): string {
  const live = liveInfo(job.liveStartMin, job.liveEndMin, tz);
  const hours =
    job.liveStartMin == null || job.liveEndMin == null
      ? "No fixed hours."
      : `Live hours ${hm(job.liveStartMin)}-${hm(job.liveEndMin)} JST, which is ${live.text} for the candidate.`;
  return [
    "JOB",
    `Title: ${job.titleEn} (${job.titleJa})`,
    `Company: ${job.companyEn} (${job.companyJa})`,
    `About: ${job.descEn}`,
    `They ask for: ${job.reqsEn.join("; ")}`,
    `Hours: ${job.hoursMin} to ${job.hoursMax} per week. ${hours}`,
    "",
    `CANDIDATE (lives in ${place}; their own words, any language)`,
    bio.trim() ? `"""\n${bio.slice(0, 1500)}\n"""` : "(no background given)",
  ].join("\n");
}
```

`translateJob.ts`：

`api/src/ai/translateJob.ts`

```ts
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, fallbackParams, logCall, MODEL } from "./client";

const JobEn = z.object({
  titleEn: z.string(),
  descEn: z.string(),
  tasksEn: z.array(z.string()),
  reqsEn: z.array(z.string()),
  category: z.enum(["L", "T", "M", "S", "Q", "C", "R"]),
  jpLevel: z.number().int(),
  languages: z.array(z.string()),
  tags: z.array(z.string()),
});
export type JobEn = z.infer<typeof JobEn>;

const SYSTEM = `You localize Japanese job postings for remote part-time workers who live outside Japan and may read little or no Japanese.

From the Japanese title and description, produce:
- titleEn: a plain English job title a foreign applicant would search for, not a literal translation.
- descEn: the description in natural English, 2 to 4 sentences. Keep every concrete fact: deliverables, deadlines, tools, how feedback works.
- tasksEn and reqsEn: 3 short bullet points each, in English.
- category: L language teaching, T translation and localization, M marketing and sales, S customer support, Q tech and QA, C creative, R research and data.
- jpLevel: the Japanese the job needs as a JLPT level: 0 none, 1 N5, 2 N4, 3 N3, 4 N2, 5 N1. Use 0 when the posting says Japanese is not needed or never mentions it.
- languages: other languages the job needs, such as "Spanish (native)".
- tags: 4 to 7 lowercase skill keywords people would search for.
Do not add facts that are not in the posting.`;

// Returns null when AI is off or fails; the employer then fills the English fields by hand.
export async function translateJob(titleJa: string, descJa: string, userId: string): Promise<JobEn | null> {
  if (!claude) return null;
  const started = Date.now();
  try {
    const res = await claude.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...fallbackParams,
      output_config: { effort: "medium", format: betaZodOutputFormat(JobEn) },
      system: SYSTEM,
      messages: [{ role: "user", content: `TITLE:\n${titleJa}\n\nDESCRIPTION:\n${descJa}` }],
    });
    await logCall("translate_job", userId, started, true, res.usage);
    const out = res.parsed_output;
    if (res.stop_reason === "refusal" || !out) return null;
    return { ...out, jpLevel: Math.max(0, Math.min(5, out.jpLevel)) };
  } catch (err) {
    console.error("translate_job failed:", err);
    await logCall("translate_job", userId, started, false);
    return null;
  }
}
```

`fallback.ts`：

`api/src/ai/fallback.ts`

```ts
// Non-AI fallbacks, ported from the prototype's localMatch() and templateDraft().
// They keep the demo working when there is no API key, the API is slow, or a call fails.
import { liveInfo } from "../lib/time";
import { JP, type JobRow } from "../queries";
import type { MatchResult } from "./match";

const LANG_WORDS: Record<string, string[]> = {
  english: ["english", "inglês", "ingles", "inglés", "englisch", "anglais", "英语", "英語"],
  spanish: ["spanish", "español", "espanol", "espanhol", "spanisch"],
  portuguese: ["portuguese", "português", "portugues"],
  indonesian: ["indonesian", "bahasa"],
  vietnamese: ["vietnamese", "tiếng việt"],
  thai: ["thai", "ไทย"],
  german: ["german", "deutsch"],
  french: ["french", "français", "francais"],
  chinese: ["chinese", "mandarin", "中文", "汉语"],
};
const langKey = (label: string) => Object.keys(LANG_WORDS).find((k) => label.toLowerCase().startsWith(k));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function keywordMatch(bio: string, tz: string, jobs: JobRow[]): Omit<MatchResult, "note"> {
  const t = bio.toLowerCase();
  const has = (w: string) => t.includes(w.toLowerCase());
  const langs = Object.keys(LANG_WORDS).filter((k) => LANG_WORDS[k].some(has));
  const level = t.match(/\bn\s?-?([1-5])\b/);
  const myJp = level ? 6 - Number(level[1]) : 0;
  const hours = t.match(/(\d{1,2})\s*(?:h\b|hrs?|hours?|horas?|stunden|小时|時間)/);
  const myHours = hours ? Number(hours[1]) : null;
  const skills = new Set<string>();

  const matches = jobs
    .map((j) => {
      let score = 45;
      const why: string[] = [];
      const hits = j.tags.filter(has);
      hits.forEach((h) => skills.add(h));
      score += Math.min(hits.length, 3) * 9;
      if (hits.length) why.push(`matches your ${hits.slice(0, 2).join(" and ")} experience`);

      const keys = j.languages.map(langKey).filter((k): k is string => !!k);
      const needed = keys.length > 1 ? keys.filter((k) => k !== "english") : keys;
      if (needed.length) {
        if (needed.every((k) => langs.includes(k))) { score += 18; why.push("you have the language"); }
        else score -= 32;
      }
      const gap = j.jpLevel - myJp;
      if (gap <= 0) { score += 8; why.push(j.jpLevel === 0 ? "no Japanese needed" : "your Japanese is enough"); }
      else score -= 18 * gap;

      const v = liveInfo(j.liveStartMin, j.liveEndMin, tz).verdict;
      if (v === "bad") score -= 15;
      else if (v === "warn") score -= 5;
      else if (v === "async") { score += 3; why.push("no fixed hours"); }
      if (myHours && j.hoursMin > myHours) score -= 10;

      const text = why.length ? why.join("; ") : "partial keyword overlap";
      return { jobId: j.id, score: Math.max(5, Math.min(96, Math.round(score))), why: cap(text) + "." };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    source: "keyword",
    profile: { languages: langs.map(cap), japaneseLevel: JP[myJp], skills: [...skills].slice(0, 6), hoursPerWeek: myHours, summary: "" },
    matches,
  };
}

// Same "English ===JA=== Japanese" shape the AI draft uses, so the client handles both the same way.
export function templateDraft(job: JobRow, place: string, tz: string): string {
  const live = liveInfo(job.liveStartMin, job.liveEndMin, tz);
  const en =
    `Hello,\n\nI would like to apply for the ${job.titleEn} role at ${job.companyEn}. ` +
    `[One or two sentences about your most relevant experience.]\n\n` +
    `I can work ${job.hoursMin} to ${job.hoursMax} hours a week from ${place}` +
    (live.verdict === "async" ? "." : `, and the live hours (${live.text} my time) work for me.`) +
    ` [Your languages and levels.]\n\nThank you for your time. I would be glad to do a short trial task.\n\n[Your name]`;
  const ja =
    `ご担当者様\n\nはじめまして。貴社の「${job.titleJa}」の募集を拝見し、応募いたしました。\n` +
    `［関連するご経験を1〜2文でご記入ください］\n\n` +
    `現在${place}に在住しており、週${job.hoursMin}〜${job.hoursMax}時間の稼働が可能です。\n\n` +
    `お忙しいところ恐れ入りますが、ご検討のほどよろしくお願いいたします。トライアル課題にも喜んで対応いたします。\n\n［お名前］`;
  return `${en}\n===JA===\n${ja}`;
}
```

### A.10 src/routes/

`meta.ts`：

`api/src/routes/meta.ts`

```ts
import { Hono } from "hono";
import { claude } from "../ai/client";
import { sql } from "../db";

// Indicative rates (units of currency per 1 yen), used until the live fetch succeeds.
const STATIC_RATES: Record<string, number> = {
  USD: 0.0066, EUR: 0.0061, GBP: 0.0052, PHP: 0.38, IDR: 106, VND: 168, THB: 0.23,
  INR: 0.56, CNY: 0.047, KES: 0.85, BRL: 0.037, MXN: 0.125, AUD: 0.0101,
};
let cached = { at: 0, rates: STATIC_RATES, source: "static" as "static" | "live" };
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export const metaRoutes = new Hono()
  .get("/health", async (c) => {
    const db = await sql`select 1 as ok`.then(() => true, () => false);
    return c.json({ ok: db, db, ai: Boolean(claude) }, db ? 200 : 503);
  })
  .get("/rates", async (c) => {
    if (Date.now() - cached.at > TWELVE_HOURS) {
      try {
        // Free, keyless daily rates. Their terms ask for attribution: show "Rates by exchangerate-api.com".
        const r = await fetch("https://open.er-api.com/v6/latest/JPY", { signal: AbortSignal.timeout(5000) });
        const j = (await r.json()) as { result?: string; rates?: Record<string, number> };
        if (j.result === "success" && j.rates) cached = { at: Date.now(), rates: j.rates, source: "live" };
        else cached.at = Date.now();
      } catch {
        cached.at = Date.now(); // keep the last rates; try again in 12 hours
      }
    }
    return c.json({ base: "JPY", rates: cached.rates, source: cached.source, fetchedAt: new Date(cached.at).toISOString() });
  });
```

`auth.ts`：

`api/src/routes/auth.ts`

```ts
import { compare, hash } from "bcryptjs";
import { Hono } from "hono";
import postgres from "postgres";
import { z } from "zod";
import { issueToken, requireUser } from "../auth";
import { sql } from "../db";
import { fail, rateLimit } from "../http";

const Register = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(8, "Use at least 8 characters"),
  role: z.enum(["worker", "employer"]),
  displayName: z.string().trim().min(1).max(80),
  company: z.object({ nameEn: z.string().trim().min(1), nameJa: z.string().trim().min(1) }).optional(),
});
const Login = z.object({ email: z.email().transform((s) => s.toLowerCase()), password: z.string() });
const Profile = z.object({
  bioRaw: z.string().max(4000),
  tz: z.string().max(64),
  currency: z.string().length(3),
  jpLevel: z.number().int().min(0).max(5).optional(),
  languages: z.array(z.string().max(60)).max(10).optional(),
  skills: z.array(z.string().max(60)).max(20).optional(),
  hoursPerWeek: z.number().int().min(1).max(60).nullable().optional(),
});

type UserRow = { id: string; email: string; role: "worker" | "employer"; displayName: string };

export const authRoutes = new Hono()
  .post("/auth/register", rateLimit(10), async (c) => {
    const b = Register.parse(await c.req.json());
    if (b.role === "employer" && !b.company) return fail(c, 400, "company_required", "Add your company name in English and Japanese.");
    const passwordHash = await hash(b.password, 10);
    try {
      const user = await sql.begin(async (tx) => {
        const [u] = await tx<UserRow[]>`
          insert into users (email, password_hash, role, display_name)
          values (${b.email}, ${passwordHash}, ${b.role}, ${b.displayName})
          returning id, email, role, display_name`;
        if (b.role === "worker") await tx`insert into worker_profiles (user_id) values (${u.id})`;
        else await tx`insert into companies (owner_id, name_en, name_ja) values (${u.id}, ${b.company!.nameEn}, ${b.company!.nameJa})`;
        return u;
      });
      return c.json({ token: await issueToken(user), user }, 201);
    } catch (err) {
      if (err instanceof postgres.PostgresError && err.code === "23505") return fail(c, 409, "email_taken", "That email already has an account. Sign in instead.");
      throw err;
    }
  })
  .post("/auth/login", rateLimit(10), async (c) => {
    const b = Login.parse(await c.req.json());
    const [row] = await sql<(UserRow & { passwordHash: string })[]>`
      select id, email, role, display_name, password_hash from users where email = ${b.email}`;
    if (!row || !(await compare(b.password, row.passwordHash))) return fail(c, 401, "bad_login", "Email or password is wrong.");
    const { passwordHash: _, ...user } = row;
    return c.json({ token: await issueToken(user), user });
  })
  .get("/me", requireUser(), async (c) => {
    const { id } = c.get("user");
    const [user] = await sql<UserRow[]>`select id, email, role, display_name from users where id = ${id}`;
    if (!user) return fail(c, 401, "unauthorized", "This account no longer exists. Sign in again.");
    const [profile] = user.role === "worker" ? await sql`select * from worker_profiles where user_id = ${id}` : [];
    const [company] = user.role === "employer" ? await sql`select id, name_en, name_ja, verified_at from companies where owner_id = ${id}` : [];
    return c.json({ user, profile: profile ?? null, company: company ?? null });
  })
  .put("/me/profile", requireUser("worker"), async (c) => {
    const b = Profile.parse(await c.req.json());
    const { id } = c.get("user");
    const [profile] = await sql`
      update worker_profiles set
        bio_raw = ${b.bioRaw}, tz = ${b.tz}, currency = ${b.currency.toUpperCase()},
        jp_level = coalesce(${b.jpLevel ?? null}, jp_level),
        languages = coalesce(${b.languages ?? null}::text[], languages),
        skills = coalesce(${b.skills ?? null}::text[], skills),
        hours_per_week = ${b.hoursPerWeek === undefined ? sql`hours_per_week` : b.hoursPerWeek},
        updated_at = now()
      where user_id = ${id}
      returning *`;
    return c.json({ profile });
  });
```

`jobs.ts`：

`api/src/routes/jobs.ts`

```ts
import { Hono } from "hono";
import { z } from "zod";
import { translateJob } from "../ai/translateJob";
import { requireUser } from "../auth";
import { sql } from "../db";
import { fail, rateLimit } from "../http";
import { jobSelect, type JobRow } from "../queries";

const CATEGORY = z.enum(["L", "T", "M", "S", "Q", "C", "R"]);

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  cat: CATEGORY.optional(),
  jpMax: z.coerce.number().int().min(0).max(5).optional(), // "My Japanese": show jobs at or below this level
  hours: z.coerce.number().int().positive().optional(), // "Hours I have": hide jobs whose minimum is higher
  async: z.literal("1").optional(), // only jobs with no fixed hours
  sort: z.enum(["new", "pay"]).default("new"),
});

const NewJob = z
  .object({
    titleJa: z.string().trim().min(2).max(120),
    descJa: z.string().trim().min(20).max(4000),
    payYen: z.number().int().positive(),
    payUnit: z.enum(["hr", "article", "video_minute", "finished_minute"]),
    hourlyEquivYen: z.number().int().positive().optional(), // needed for per-piece pay so "highest pay" sorting is fair
    hoursMin: z.number().int().min(1).max(60),
    hoursMax: z.number().int().min(1).max(60),
    liveStartMin: z.number().int().min(0).max(1439).nullable().default(null), // JST minutes, null = async
    liveEndMin: z.number().int().min(1).max(2879).nullable().default(null),
    liveDays: z.string().trim().max(200).nullable().default(null),
  })
  .refine((j) => j.hoursMax >= j.hoursMin, { message: "hoursMax must be at least hoursMin", path: ["hoursMax"] })
  .refine((j) => (j.liveStartMin == null) === (j.liveEndMin == null), { message: "Give both live start and end, or neither", path: ["liveEndMin"] });

// What the employer may change after the AI fills the English side
const JobPatch = z
  .object({
    titleEn: z.string().trim().min(2).max(160),
    descEn: z.string().trim().min(20).max(4000),
    tasksEn: z.array(z.string().trim().min(1).max(200)).max(8),
    reqsEn: z.array(z.string().trim().min(1).max(200)).max(8),
    tags: z.array(z.string().trim().min(1).max(40)).max(10),
    languages: z.array(z.string().trim().min(1).max(60)).max(5),
    jpLevel: z.number().int().min(0).max(5),
    category: CATEGORY,
  })
  .partial();

export const jobRoutes = new Hono()
  // Public listing. "Hide overnight shifts" depends on the viewer's time zone, so the web app filters that itself.
  .get("/jobs", async (c) => {
    const f = ListQuery.parse(c.req.query());
    const like = f.q ? `%${f.q}%` : null;
    const jobs = await sql<JobRow[]>`
      ${jobSelect()}
      where j.status = 'open'
      ${f.cat ? sql`and j.category = ${f.cat}` : sql``}
      ${f.jpMax !== undefined ? sql`and j.jp_level <= ${f.jpMax}` : sql``}
      ${f.hours ? sql`and j.hours_min <= ${f.hours}` : sql``}
      ${f.async ? sql`and j.live_start_min is null` : sql``}
      ${like ? sql`and (j.title_en ilike ${like} or c.name_en ilike ${like} or exists (select 1 from unnest(j.tags || j.languages) t where t ilike ${like}))` : sql``}
      order by ${f.sort === "pay" ? sql`j.hourly_equiv_yen desc` : sql`j.published_at desc`}
      limit 100`;
    return c.json({ jobs });
  })
  .get("/jobs/:id{[0-9a-f-]{36}}", async (c) => {
    const [job] = await sql<JobRow[]>`${jobSelect()} where j.id = ${c.req.param("id")} and j.status = 'open'`;
    return job ? c.json({ job }) : fail(c, 404, "not_found", "This listing is closed or does not exist.");
  })
  // Employer posts in Japanese; the AI fills the English side and the job stays a draft until they publish.
  .post("/jobs", requireUser("employer"), rateLimit(10), async (c) => {
    const b = NewJob.parse(await c.req.json());
    const user = c.get("user");
    const [company] = await sql<{ id: string }[]>`select id from companies where owner_id = ${user.id} limit 1`;
    if (!company) return fail(c, 400, "no_company", "Add your company before posting a job.");
    const en = await translateJob(b.titleJa, b.descJa, user.id);
    const [{ id }] = await sql<{ id: string }[]>`
      insert into jobs (company_id, status, category, title_ja, desc_ja, title_en, desc_en, tasks_en, reqs_en, tags, languages,
                        jp_level, pay_yen, pay_unit, hourly_equiv_yen, hours_min, hours_max, live_start_min, live_end_min, live_days)
      values (${company.id}, 'draft', ${en?.category ?? "T"}, ${b.titleJa}, ${b.descJa},
              ${en?.titleEn ?? ""}, ${en?.descEn ?? ""}, ${en?.tasksEn ?? []}, ${en?.reqsEn ?? []},
              ${en?.tags ?? []}, ${en?.languages ?? []}, ${en?.jpLevel ?? 0},
              ${b.payYen}, ${b.payUnit}, ${b.hourlyEquivYen ?? b.payYen}, ${b.hoursMin}, ${b.hoursMax},
              ${b.liveStartMin}, ${b.liveEndMin}, ${b.liveDays})
      returning id`;
    const [job] = await sql<JobRow[]>`${jobSelect()} where j.id = ${id}`;
    return c.json({ job, translated: Boolean(en) }, 201);
  })
  .patch("/jobs/:id", requireUser("employer"), async (c) => {
    const p = JobPatch.parse(await c.req.json());
    const cols: Record<string, unknown> = {};
    if (p.titleEn !== undefined) cols.title_en = p.titleEn;
    if (p.descEn !== undefined) cols.desc_en = p.descEn;
    if (p.tasksEn) cols.tasks_en = p.tasksEn;
    if (p.reqsEn) cols.reqs_en = p.reqsEn;
    if (p.tags) cols.tags = p.tags;
    if (p.languages) cols.languages = p.languages;
    if (p.jpLevel !== undefined) cols.jp_level = p.jpLevel;
    if (p.category) cols.category = p.category;
    if (!Object.keys(cols).length) return fail(c, 400, "nothing_to_update", "Send at least one field to change.");
    const rows = await sql`
      update jobs set ${sql(cols)}
      where id = ${c.req.param("id")} and company_id in (select id from companies where owner_id = ${c.get("user").id})
      returning id`;
    if (!rows.length) return fail(c, 404, "not_found", "No job of yours with that id.");
    const [job] = await sql<JobRow[]>`${jobSelect()} where j.id = ${rows[0].id}`;
    return c.json({ job });
  })
  .post("/jobs/:id/publish", requireUser("employer"), async (c) => {
    const rows = await sql`
      update jobs set status = 'open', published_at = coalesce(published_at, now())
      where id = ${c.req.param("id")} and title_en <> '' and desc_en <> ''
        and company_id in (select id from companies where owner_id = ${c.get("user").id})
      returning id`;
    return rows.length ? c.json({ ok: true }) : fail(c, 400, "cannot_publish", "Fill in the English title and description before publishing.");
  })
  .get("/employer/jobs", requireUser("employer"), async (c) => {
    const jobs = await sql<JobRow[]>`
      ${jobSelect()} where c.owner_id = ${c.get("user").id} order by j.created_at desc`;
    return c.json({ jobs });
  });
```

`applications.ts`：

`api/src/routes/applications.ts`

```ts
import { Hono } from "hono";
import postgres from "postgres";
import { z } from "zod";
import { requireUser } from "../auth";
import { sql } from "../db";
import { fail } from "../http";

const NewApplication = z.object({
  jobId: z.uuid(),
  messageEn: z.string().trim().max(4000),
  messageJa: z.string().trim().max(4000),
}).refine((a) => a.messageEn.length >= 20 || a.messageJa.length >= 20, { message: "Write a few lines first", path: ["messageEn"] });

const StagePatch = z.object({ stage: z.enum(["viewed", "interview", "offer", "rejected"]) });

export const applicationRoutes = new Hono()
  .post("/applications", requireUser("worker"), async (c) => {
    const b = NewApplication.parse(await c.req.json());
    try {
      const [app] = await sql`
        insert into applications (job_id, worker_id, message_en, message_ja)
        select id, ${c.get("user").id}, ${b.messageEn}, ${b.messageJa} from jobs where id = ${b.jobId} and status = 'open'
        returning *`;
      return app ? c.json({ application: app }, 201) : fail(c, 404, "not_found", "This listing is closed.");
    } catch (err) {
      if (err instanceof postgres.PostgresError && err.code === "23505") return fail(c, 409, "already_applied", "You already applied to this job.");
      throw err;
    }
  })
  // Workers see their own applications; employers see the ones sent to their jobs.
  .get("/applications", requireUser(), async (c) => {
    const user = c.get("user");
    if (user.role === "worker") {
      const applications = await sql`
        select a.id, a.stage, a.message_en, a.message_ja, a.created_at, a.updated_at,
               j.id as job_id, j.title_en, j.category, co.name_en as company_en
        from applications a join jobs j on j.id = a.job_id join companies co on co.id = j.company_id
        where a.worker_id = ${user.id} order by a.created_at desc`;
      return c.json({ applications });
    }
    // Opening the list counts as "viewed", so the worker's tracker moves on its own.
    await sql`
      update applications set stage = 'viewed', updated_at = now()
      where stage = 'sent' and job_id in (select j.id from jobs j join companies co on co.id = j.company_id where co.owner_id = ${user.id})`;
    const applications = await sql`
      select a.id, a.stage, a.message_en, a.message_ja, a.created_at,
             j.id as job_id, j.title_ja, j.title_en, u.display_name as worker_name,
             p.tz as worker_tz, p.jp_level as worker_jp_level, p.languages as worker_languages
      from applications a
      join jobs j on j.id = a.job_id
      join companies co on co.id = j.company_id
      join users u on u.id = a.worker_id
      left join worker_profiles p on p.user_id = a.worker_id
      where co.owner_id = ${user.id} order by a.created_at desc`;
    return c.json({ applications });
  })
  .patch("/applications/:id", requireUser("employer"), async (c) => {
    const { stage } = StagePatch.parse(await c.req.json());
    const rows = await sql`
      update applications set stage = ${stage}, updated_at = now()
      where id = ${c.req.param("id")}
        and job_id in (select j.id from jobs j join companies co on co.id = j.company_id where co.owner_id = ${c.get("user").id})
      returning id, stage`;
    return rows.length ? c.json({ application: rows[0] }) : fail(c, 404, "not_found", "No application on your jobs with that id.");
  })
  .get("/saved", requireUser("worker"), async (c) => {
    const rows = await sql`select job_id from saved_jobs where user_id = ${c.get("user").id} order by created_at desc`;
    return c.json({ jobIds: rows.map((r) => r.jobId) });
  })
  .put("/saved/:jobId", requireUser("worker"), async (c) => {
    await sql`insert into saved_jobs (user_id, job_id) values (${c.get("user").id}, ${c.req.param("jobId")}) on conflict do nothing`;
    return c.json({ ok: true });
  })
  .delete("/saved/:jobId", requireUser("worker"), async (c) => {
    await sql`delete from saved_jobs where user_id = ${c.get("user").id} and job_id = ${c.req.param("jobId")}`;
    return c.json({ ok: true });
  });
```

`ai.ts`：

`api/src/routes/ai.ts`

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { claude, fallbackParams, logCall, MODEL } from "../ai/client";
import { DRAFT_SYSTEM, draftRequest } from "../ai/draft";
import { templateDraft } from "../ai/fallback";
import { matchJobs } from "../ai/match";
import { readUser } from "../auth";
import { sql } from "../db";
import { fail, rateLimit } from "../http";
import { jobSelect, type JobRow } from "../queries";

const MatchBody = z.object({
  bio: z.string().trim().min(12, "Write a sentence or two about yourself").max(4000),
  tz: z.string().max(64),        // IANA zone from the "I live in" picker
  place: z.string().max(80),     // city label, for the prompt
});
const DraftBody = z.object({
  jobId: z.uuid(),
  bio: z.string().max(4000).default(""),
  tz: z.string().max(64),
  place: z.string().max(80),
});

export const aiRoutes = new Hono()
  // Works signed out. Signed-in workers also get their text saved to their profile.
  .post("/ai/match", rateLimit(8), async (c) => {
    const b = MatchBody.parse(await c.req.json());
    const user = await readUser(c.req.header("Authorization"));
    const jobs = await sql<JobRow[]>`${jobSelect()} where j.status = 'open' order by j.published_at desc limit 60`;
    const result = await matchJobs({ ...b, userId: user?.id ?? null }, jobs);
    if (user?.role === "worker") {
      await sql`update worker_profiles set bio_raw = ${b.bio}, tz = ${b.tz}, updated_at = now() where user_id = ${user.id}`;
    }
    return c.json(result);
  })
  // Streams the cover letter as Server-Sent Events: "delta" {text} ... then "done" or "error".
  // The text is English, a line "===JA===", then Japanese; the client splits it.
  .post("/ai/draft", rateLimit(6), async (c) => {
    const b = DraftBody.parse(await c.req.json());
    const user = await readUser(c.req.header("Authorization"));
    const [job] = await sql<JobRow[]>`${jobSelect()} where j.id = ${b.jobId}`;
    if (!job) return fail(c, 404, "not_found", "That job no longer exists.");

    return streamSSE(c, async (out) => {
      if (!claude) {
        await out.writeSSE({ event: "delta", data: JSON.stringify({ text: templateDraft(job, b.place, b.tz) }) });
        await out.writeSSE({ event: "done", data: JSON.stringify({ source: "template" }) });
        return;
      }
      const started = Date.now();
      const stream = claude.beta.messages.stream({
        model: MODEL,
        max_tokens: 8000,
        ...fallbackParams,
        output_config: { effort: "medium" },
        system: DRAFT_SYSTEM,
        messages: [{ role: "user", content: draftRequest(job, b.bio, b.place, b.tz) }],
      });
      out.onAbort(() => stream.abort()); // the user pressed Stop or closed the tab: stop paying for tokens
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            await out.writeSSE({ event: "delta", data: JSON.stringify({ text: ev.delta.text }) });
          }
        }
        const final = await stream.finalMessage();
        const refused = final.stop_reason === "refusal";
        await logCall("draft", user?.id ?? null, started, !refused, final.usage);
        await out.writeSSE(
          refused
            ? { event: "error", data: JSON.stringify({ code: "refused", message: "The AI declined to write this one. Write it yourself, or change your profile text." }) }
            : { event: "done", data: JSON.stringify({ source: "ai", truncated: final.stop_reason === "max_tokens" }) },
        );
      } catch (err) {
        if (out.aborted) return;
        console.error("draft failed:", err);
        await logCall("draft", user?.id ?? null, started, false);
        await out.writeSSE({ event: "error", data: JSON.stringify({ code: "ai_failed", message: "The draft was interrupted. Try again, or finish it by hand." }) });
      }
    });
  });
```

### A.11 Dockerfile 和 .dockerignore

`api/Dockerfile`

```dockerfile
# Only needed for hosts that run containers (Fly.io, Railway, Cloud Run). Render can use render.yaml instead.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 8787
CMD ["node", "dist/index.js"]
```

`api/.dockerignore`

```text
node_modules
dist
.env
```

### A.12 render.yaml（仓库根目录）

`render.yaml`

```yaml
# Render Blueprint: Dashboard -> New -> Blueprint -> pick this repo.
services:
  - type: web
    name: hanare-api
    runtime: node
    rootDir: api
    region: singapore
    plan: free            # sleeps after ~15 idle minutes; use "starter" for the demo day
    buildCommand: npm ci --include=dev && npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: CLAUDE_MODEL
        value: claude-opus-5-5
      - key: JWT_SECRET
        generateValue: true
      - key: DATABASE_URL
        sync: false       # Render asks for these in the dashboard
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: CORS_ORIGINS
        sync: false
```

### A.13 docker-compose.yml（仓库根目录）

`docker-compose.yml`

```yaml
# Local Postgres. On first start it runs api/db/*.sql in name order (schema, then seed).
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: hanare
    ports:
      - "5432:5432"
    volumes:
      - ./api/db:/docker-entrypoint-initdb.d:ro
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

---

## 附录 B：前端起步代码

这是能跑通"列表 → 详情 → AI 求职信 → 投递 → 申请进度"的最小骨架，其余页面按 5.2 和 5.3 补齐。`src/lib/time.ts` 直接复制后端的 `api/src/lib/time.ts`。

### B.1 package.json、vite.config.ts、tsconfig.json

`web/package.json`

```json
{
  "name": "hanare-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.107.1",
    "react": "^19.3.1",
    "react-dom": "^19.3.1",
    "react-router": "^8.5.1"
  },
  "devDependencies": {
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.3.0",
    "typescript": "^7.0.2",
    "vite": "^8.3.8"
  }
}
```

`web/vite.config.ts`

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [react()] });
```

`web/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

### B.2 index.html、vercel.json、.env.example

`web/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Hanare</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=M+PLUS+1p:wght@700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

`web/.env.example`

```bash
VITE_API_URL=http://localhost:8787
```

### B.3 src/main.tsx 和 src/App.tsx

`web/src/main.tsx`

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./styles/app.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

`web/src/App.tsx`

```tsx
import { Route, Routes } from "react-router";
import { Applications } from "./pages/Applications";
import { Board } from "./pages/Board";

// Employer pages (/employer, /employer/jobs/new, /employer/jobs/:id/applicants) and
// /login, /signup follow the same pattern; see section 5.2 of the doc.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Board />} />
      <Route path="/jobs/:id" element={<Board />} />
      <Route path="/applications" element={<Applications />} />
      <Route path="*" element={<Board />} />
    </Routes>
  );
}
```

另外需要 `src/vite-env.d.ts`，内容一行：`/// <reference types="vite/client" />`（用 Vite 模板创建时已经有了）。

### B.4 src/types.ts

`web/src/types.ts`

```ts
// Mirrors JobRow in api/src/queries.ts (the API returns camelCase columns).
export type Job = {
  id: string;
  category: "L" | "T" | "M" | "S" | "Q" | "C" | "R";
  titleEn: string;
  titleJa: string;
  descEn: string;
  descJa: string;
  tasksEn: string[];
  reqsEn: string[];
  tags: string[];
  languages: string[];
  jpLevel: number;
  payYen: number;
  payUnit: "hr" | "article" | "video_minute" | "finished_minute";
  hourlyEquivYen: number;
  hoursMin: number;
  hoursMax: number;
  liveStartMin: number | null;
  liveEndMin: number | null;
  liveDays: string | null;
  publishedAt: string | null;
  companyEn: string;
  companyJa: string;
  verified: boolean;
  applicants: number;
};

export type MatchResult = {
  source: "ai" | "keyword";
  note?: string;
  profile: { languages: string[]; japaneseLevel: string; skills: string[]; hoursPerWeek: number | null; summary: string };
  matches: { jobId: string; score: number; why: string }[];
};
```

### B.5 src/lib/api.ts、sse.ts、money.ts

`web/src/lib/api.ts`

```ts
// Thin fetch wrapper: JSON in and out, Bearer token, one error type.
const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
export const API_BASE = BASE;

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TOKEN_KEY = "hanare.token";
export const token = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(t: string | null) {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  },
};

export const authHeaders = (): Record<string, string> => {
  const t = token.get();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { ...(init.body === undefined ? {} : { "Content-Type": "application/json" }), ...authHeaders() },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token.get()) token.set(null); // expired session
    throw new ApiFailure(res.status, data?.error?.code ?? `http_${res.status}`, data?.error?.message ?? "The server did not answer. Try again.");
  }
  return data as T;
}
```

`web/src/lib/sse.ts`

```ts
import { API_BASE, ApiFailure, authHeaders } from "./api";

export type DraftParts = { en: string; ja: string };

export const splitDraft = (text: string): DraftParts => {
  const i = text.indexOf("===JA===");
  return i === -1 ? { en: text.trim(), ja: "" } : { en: text.slice(0, i).trim(), ja: text.slice(i + 8).trim() };
};

// Reads the /api/ai/draft event stream. EventSource cannot send a POST body, so the frames are parsed by hand.
export async function streamDraft(
  body: { jobId: string; bio: string; tz: string; place: string },
  onText: (parts: DraftParts) => void,
  signal?: AbortSignal,
): Promise<{ source: "ai" | "template"; truncated?: boolean }> {
  const res = await fetch(`${API_BASE}/api/ai/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new ApiFailure(res.status, data?.error?.code ?? `http_${res.status}`, data?.error?.message ?? "Drafting failed. Try again.");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = /^event: ?(.*)$/m.exec(frame)?.[1] ?? "message";
      const data = JSON.parse(/^data: ?(.*)$/m.exec(frame)?.[1] ?? "{}");
      if (event === "delta") {
        full += data.text;
        onText(splitDraft(full));
      } else if (event === "done") {
        return data;
      } else if (event === "error") {
        throw new ApiFailure(200, data.code, data.message);
      }
    }
  }
  throw new ApiFailure(0, "stream_closed", "The connection closed before the draft finished. Try again.");
}
```

`web/src/lib/money.ts`

```ts
// rates = units of currency per 1 yen, from GET /api/rates
export function localMoney(yen: number, currency: string, rates: Record<string, number>): string {
  const cur = rates[currency] ? currency : "USD";
  const v = yen * (rates[cur] ?? 0.0066);
  const digits = v >= 200 ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${cur} ${Math.round(v)}`;
  }
}
```

### B.6 src/components/ApplyComposer.tsx

`web/src/components/ApplyComposer.tsx`

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, ApiFailure } from "../lib/api";
import { streamDraft, type DraftParts } from "../lib/sse";

type Props = { jobId: string; bio: string; tz: string; place: string; onSent: () => void };

// Two text boxes (English for the applicant, Japanese for the employer), filled live by the AI draft.
export function ApplyComposer({ jobId, bio, tz, place, onSent }: Props) {
  const [draft, setDraft] = useState<DraftParts>({ en: "", ja: "" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  async function runDraft() {
    ctl.current = new AbortController();
    setBusy(true);
    setStatus("Thinking…");
    try {
      const r = await streamDraft({ jobId, bio, tz, place }, (parts) => { setDraft(parts); setStatus("Writing…"); }, ctl.current.signal);
      setStatus(
        r.source === "template" ? "Template filled in. Replace the parts in brackets."
        : r.truncated ? "The draft was cut short. Finish the last lines yourself."
        : "Draft ready. Read both versions and edit before sending.",
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setStatus("Stopped. Edit what is there, or draft again.");
      else setStatus(e instanceof ApiFailure ? e.message : "Drafting failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    try {
      await api("/applications", { body: { jobId, messageEn: draft.en, messageJa: draft.ja } });
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      onSent();
    } catch (e) {
      setStatus(e instanceof ApiFailure ? e.message : "Sending failed. Try again.");
    }
  }

  return (
    <div className="compose">
      <label htmlFor="msgEn">
        Your message (English)
        <textarea id="msgEn" rows={8} value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} />
      </label>
      <label htmlFor="msgJa">
        What the employer receives (日本語)
        <textarea id="msgJa" rows={8} lang="ja" value={draft.ja} onChange={(e) => setDraft({ ...draft, ja: e.target.value })} />
      </label>
      <div className="d-actions">
        <button type="button" className="btn" onClick={runDraft} disabled={busy}>{busy ? "Drafting…" : "Draft with AI"}</button>
        {busy && <button type="button" className="btn" onClick={() => ctl.current?.abort()}>Stop</button>}
        <button type="button" className="btn primary" onClick={send} disabled={busy}>Send application</button>
      </div>
      <p className="status" aria-live="polite">{status}</p>
    </div>
  );
}
```

### B.7 src/pages/Board.tsx 和 Applications.tsx（最简版）

`web/src/pages/Board.tsx`

```tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { ApplyComposer } from "../components/ApplyComposer";
import { api } from "../lib/api";
import { liveInfo } from "../lib/time";
import type { Job } from "../types";

// Minimal board: list on the left, the selected job on the right (/jobs/:id deep-links to it).
export function Board() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, isLoading, error } = useQuery({ queryKey: ["jobs"], queryFn: () => api<{ jobs: Job[] }>("/jobs") });
  const jobs = data?.jobs ?? [];
  const selected = jobs.find((j) => j.id === id) ?? jobs[0];

  if (isLoading) return <p className="wrap">Loading listings…</p>;
  if (error) return <p className="wrap">Could not load listings: {(error as Error).message}</p>;
  return (
    <div className="wrap board">
      <ul className="list">
        {jobs.map((j) => (
          <li key={j.id}>
            <button type="button" className="row" aria-current={j.id === selected?.id} onClick={() => navigate(`/jobs/${j.id}`)}>
              <span className="row-title">{j.titleEn}</span>
              <span className="row-co">{j.companyEn}</span>
              <span className="live">{liveInfo(j.liveStartMin, j.liveEndMin, tz).text}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <aside className="detail">
          <h2 className="d-title">{selected.titleEn}</h2>
          <p lang="ja">{selected.titleJa}</p>
          <p>{selected.descEn}</p>
          <ApplyComposer key={selected.id} jobId={selected.id} bio="" tz={tz} place={tz} onSent={() => navigate("/applications")} />
        </aside>
      )}
    </div>
  );
}
```

`web/src/pages/Applications.tsx`

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type Row = { id: string; stage: string; titleEn: string; companyEn: string; createdAt: string };
const STAGES = ["sent", "viewed", "interview", "offer"];

export function Applications() {
  const { data, error } = useQuery({ queryKey: ["applications"], queryFn: () => api<{ applications: Row[] }>("/applications") });
  if (error) return <p className="wrap">{(error as Error).message}</p>;
  return (
    <div className="wrap apps">
      <h2>Applications</h2>
      <ul className="apps-sec">
        {(data?.applications ?? []).map((a) => (
          <li key={a.id} className="app">
            <strong>{a.titleEn}</strong> · {a.companyEn}
            <ol className="track">
              {STAGES.map((s, i) => (
                <li key={s} className={i < STAGES.indexOf(a.stage) ? "done" : s === a.stage ? "now" : ""}>{s}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 附录 C：验证情况

在 Node 22、PostgreSQL 16 上实际运行过，依赖版本以附录中的 `package.json` 为准。

**已验证：**

- 前后端代码 TypeScript 类型检查通过，后端打包、前端生产构建成功。
- 表结构和种子数据导入成功（16 条职位、13 家公司、2 个演示账号）。
- 不带 API key 时，以下接口逐一调用结果正确：健康检查、汇率、注册（含重复邮箱、雇主缺公司名）、登录（含密码错误）、个人资料更新、职位列表的全部筛选和排序、雇主发布草稿、未填英文时拒绝发布、修改英文后发布、投递（含重复投递）、雇主查看申请并自动标记已查看、修改阶段、收藏、关键词匹配、模板求职信的事件流、CORS 预检、错误 JSON 和参数校验。
- 前端骨架在浏览器里连本地后端走通：加载列表、打开职位、流式生成求职信、未登录投递时显示"Sign in to continue."。
- `site/index.html` 在浏览器里以标准模式渲染，无报错。

**没有验证：**

- 真实的 Claude API 调用（本地没有 API key）。三处 AI 的请求结构已通过 SDK 类型检查，匹配的输出格式也确认能转换成 API 接受的 JSON Schema。部署后请用 7.6 的匹配命令确认 `source` 是 `"ai"`。
- 汇率接口的实时获取（本地网络访问不到，代码会退回内置示意汇率）。
- Render、Vercel、Supabase 上的实际部署，以及 Dockerfile 的构建。
