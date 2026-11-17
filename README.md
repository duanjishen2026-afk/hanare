# Hanare

让住在日本以外的人远程给日本公司做兼职的招聘平台。黑客松项目（AI + 出海赛道）。

- 求职者用任意语言写自我介绍，AI 推荐职位并说明理由
- 职位的在线时段换算成求职者当地时间，薪资显示日元和当地货币
- AI 生成英文和商务日语两版求职信
- 雇主用日语发布职位，AI 生成英文版

完整方案（架构、数据库、接口、AI 设计、部署步骤）见 [docs/hanare-fullstack.md](docs/hanare-fullstack.md)。

## 目录

| 路径 | 内容 |
|---|---|
| `prototype/index.html` | 单文件原型，也是种子数据的来源 |
| `site/index.html` | 原型的可部署版本，放到任意静态托管即可 |
| `api/` | 后端：Node + Hono + Postgres + Claude API |
| `web/` | 前端起步骨架：Vite + React |
| `render.yaml` | Render 部署配置 |
| `docker-compose.yml` | 本地 Postgres |

## 本地运行

需要 Node 20.6 以上和 Docker。

```bash
docker compose up -d db
```

```bash
cd api && npm install && cp .env.example .env && npm run dev
```

```bash
cd web && npm install && cp .env.example .env && npm run dev
```

打开 http://localhost:5173 。`ANTHROPIC_API_KEY` 留空也能运行，AI 会退回关键词匹配和模板求职信。

演示账号：`employer@demo.hanare`、`worker@demo.hanare`，密码都是 `hanare-demo`。

部署步骤见文档第 7 节。
