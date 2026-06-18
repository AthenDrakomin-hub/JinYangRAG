# Jin Yang RAG v2.0 · 群活跃话术智能体

> 销冠思维引擎（v1.0.1）原样保留。v2.0 在侧栏新增"话术生成" tab，自动从 Supabase 业务文档识别 → 多 agent 协作生成多角色群聊话术。主人手动复制到群。

## v2.0 新增能力

| 能力 | 路径 | 说明 |
|---|---|---|
| 文档自动识别 | 后端 5 视角 Agent | 场景 / 角色 / 节奏 / 禁词 / 案例从文档抽取 |
| 多 agent 编排 | 后端 Group Chat | 识别结果驱动角色轮流发言 |
| 侧栏"话术生成" | 默认 tab | 主需求 textarea + 数量 slider + 一键复制 |
| 文档隔离 | Supabase `current_stage` | STAGE_SPEECH 文档独立于 STAGE_SALES |

不做：场景 / 角色 / 时段 / 情绪的预设 chip。**所有维度由文档驱动，主人只填主需求**。

## 准备（首次部署必做）

### 1. Supabase 初始化
Supabase Studio → SQL Editor → 粘贴执行 `supabase_init.sql`

**作用**：
- 给 documents 表加 `current_stage` 索引
- 新建 `speech_history` 表（生成历史）
- 插入一份测试用群运营文档模板

**验**：`SELECT count(*) FROM documents WHERE current_stage = 'STAGE_SPEECH'` 应 ≥ 1。

### 2. 主人配置
侧栏 → ⚙ 设置：
- `Supabase URL`：已有
- `Supabase Anon Key`：已有
- `租户用户识别码`：`speech_default`（或自定）

## 使用流程

| 步 | 操作 | 工具响应 |
|---|---|---|
| 1 | 切到"话术生成" tab | 显示文档状态："已加载 N 份群运营文档" |
| 2 | 主需求 textarea 写一句话 | 例：早盘引导关注 AI 算力，老师开课讲解主线 |
| 3 | 数量 slider 拉 | 3-20 条，默认 8 |
| 4 | 点"生成话术" | 后端跑 2 步：① 5 视角识别 → JSON；② 编排多角色群聊 |
| 5 | 按角色分组渲染 | 每条独立，复制按钮 = 单条；"全部复制"= 整段 [角色] 内容 |
| 6 | 主人手动粘到群 | 不做自动发群（合规+节奏考量） |

## 后端新增

`server.ts` 新增 `STAGE_SPEECH` 独立分支（line 390~），销冠 4 个 stage 代码 0 改动：

```
步骤 1：identifyAgent（temperature 0.4，JSON mode）→ 输出 5 视角识别 JSON
步骤 2：orchestrateAgent（temperature 0.85）→ 基于识别结果编排多角色群聊
回包：{ answer, cloudMemories, stage: 'STAGE_SPEECH', identifyJson, totalLines }
```

## 技术栈

- 前端：v1.0.1 Chrome 扩展（manifest v3，侧栏 + popup）
- 后端：Node.js + Express + TypeScript（Railway 部署）
- LLM：Agnes 2.0 Flash（主人侧 API Hub）
- 向量：Supabase pgvector（`match_advisor_knowledge` RPC）
- 文档：Supabase `documents` 表，stage 隔离

## 目录

```
JinYangRAG-temp/
├── server.ts                # 后端（v1.0.1 + STAGE_SPEECH 增量）
├── supabase_init.sql        # v2.0 Supabase 初始化脚本
├── extension/
│   ├── manifest.json        # v1.0.1 不动
│   ├── background.js        # v1.0.1 不动
│   ├── content.js           # v1.0.1 不动
│   ├── popup.html/.js/.css  # v1.0.1 弹窗（销冠问答）原样保留
│   ├── sidepanel.html/.js   # v1.0.1 侧栏 + v2.0 "话术生成" tab
│   ├── rag-engine.js        # v1.0.1 不动
│   └── ...
└── JinYangRAG-v2.0.0.zip    # 打包后的扩展
```

## 上线检查

- [ ] Supabase SQL 跑过
- [ ] 扩展加载 → 侧栏默认进"话术生成" tab
- [ ] 文档状态显示"已加载 N 份"
- [ ] 输入主需求 → 点"生成话术" → 看到多角色分组结果
- [ ] "全部复制" → 粘到群 → 格式正确
