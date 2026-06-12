# Jin Yang RAG

一个基于 Agnes AI 与 Supabase 的 RAG（检索增强生成）系统，包含：

- `server.ts`：Express 后端，负责 API 路由、Agnes AI 调用、Supabase 向量检索和长期记忆处理。
- `src/`：React + Vite 前端界面。
- `extension/`：Chrome 扩展侧边面板、Popup 与内容脚本实现。

本仓库适合部署后端服务，并通过扩展或网页前端调用该服务。

## 主要功能

- Agnes AI 聊天与文本生成
- Supabase pgvector 向量存储与检索
- Google Drive / Google Docs 导入（扩展端）
- Chrome 扩展侧边栏集成
- 本地网页内容切片与 RAG 提问

## 本地运行

### 前置条件

- Node.js >= 18
- npm

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制环境模板：

```bash
cp .env.example .env
```

然后编辑 `.env`，至少设置：

- `AGNES_API_KEY`
- `AGNES_API_BASE_URL`
- `AGNES_CHAT_MODEL`
- `AGNES_EMBEDDING_MODEL`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `APP_URL`

如果本地运行，可填写：

```env
APP_URL="http://localhost:3000"
```

### 启动开发环境

```bash
npm run dev
```

服务默认监听 `3000` 端口。

## 生产构建

```bash
npm run build
```

然后启动构建产物：

```bash
npm start
```

## 环境变量说明

```env
AGNES_API_KEY="YOUR_AGNES_API_KEY"
AGNES_API_BASE_URL="https://apihub.agnes-ai.com/v1"
AGNES_EMBEDDING_MODEL="agnes-2.0-flash"
AGNES_CHAT_MODEL="agnes-2.0-flash"
APP_URL="http://localhost:3000"
SUPABASE_URL="YOUR_SUPABASE_URL"
SUPABASE_KEY="YOUR_SUPABASE_KEY"
```

- `AGNES_API_KEY`：Agnes AI 访问密钥。
- `AGNES_API_BASE_URL`：Agnes API 基础地址，默认 `https://apihub.agnes-ai.com/v1`。
- `AGNES_EMBEDDING_MODEL` / `AGNES_CHAT_MODEL`：Agnes 模型名，当前推荐 `agnes-2.0-flash`。
- `APP_URL`：应用公共地址，部署时请改为线上域名。
- `SUPABASE_URL`、`SUPABASE_KEY`：Supabase 项目连接信息。

## 托管到 Railway

Railway 适合托管本项目后端：

1. 将仓库推到 GitHub。
2. 在 Railway 创建新项目并连接 GitHub 仓库。
3. 设置环境变量：
   - `AGNES_API_KEY`
   - `AGNES_API_BASE_URL`
   - `AGNES_EMBEDDING_MODEL`
   - `AGNES_CHAT_MODEL`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `APP_URL`
4. Railway 会自动运行 `npm install`，并执行 `heroku-postbuild` 构建。
5. 部署完成后，获取运行地址并更新扩展中的 `API URL`。

## Chrome 扩展使用

扩展本身不是完全独立的应用，它需要调用后端 API：

- 将 `extension/` 目录加载为 Chrome 已解压扩展。
- 打开扩展设置，填写后端 API 地址，例如：
  - `https://your-railway-app.up.railway.app/api/rag`
- 如果使用本地后端，填写：
  - `http://localhost:3000/api/rag`
- 填入 `API Key` 和 `Supabase` 信息。

## Supabase 作用

Supabase 只作为数据库与向量存储层：

- 保存向量 embedding
- 存储长期记忆文档
- 支持 pgvector 检索

它不是当前项目的完整后端，仍然需要 `server.ts` 这段 Express 业务逻辑来处理 Agnes 调用与路由。

## 代码结构

- `server.ts`：后端入口
- `src/`：前端 React 源码
- `extension/`：Chrome 扩展资源
- `.env.example`：环境变量模板
- `package.json`：脚本与依赖

## 其他说明

- 默认端口已支持 `process.env.PORT`，适合 Railway / Heroku / Render 等云平台。
- 如果需要更换模型，可在 `.env` 中修改 `AGNES_CHAT_MODEL` 和 `AGNES_EMBEDDING_MODEL`。
- 如果要关闭扩展中的 Google 导入功能，可保留 `extension/` 但不配置 Google 相关项。
