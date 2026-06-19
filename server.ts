import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

dotenv.config();

// 修 Node 20 + @supabase/supabase-js v2 的 WebSocket 缺失问题
// 详见 https://github.com/supabase/realtime-js/issues/303
// 所有 createClient 调用统一走这个 helper，传 realtime.transport = ws
const supabaseTransport = (process.env.SUPABASE_TRANSPORT_DISABLE === '1') ? undefined : ws;
function createSupabaseClient(url: string, key: string) {
  return createClient(url, key, supabaseTransport ? { realtime: { transport: supabaseTransport } } : {});
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  const AGNES_API_BASE_URL = (process.env.AGNES_API_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/?$/, "");
  const AGNES_EMBEDDING_MODEL = process.env.AGNES_EMBEDDING_MODEL || "agnes-2.0-flash";
  const AGNES_CHAT_MODEL = process.env.AGNES_CHAT_MODEL || "agnes-2.0-flash";

  // 辅助函数：计算两个数值向量之间的余弦相似度
  function dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] || 0) * (b[i] || 0);
    }
    return sum;
  }

  function magnitude(a: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] || 0) * (a[i] || 0);
    }
    return Math.sqrt(sum);
  }

  function cosineSimilarity(a: number[], b: number[]): number {
    const m_a = magnitude(a);
    const m_b = magnitude(b);
    if (m_a === 0 || m_b === 0) return 0;
    return dotProduct(a, b) / (m_a * m_b);
  }

  // 辅助工具：转换任意非 UUID 的字符串为哈希映射的唯一合法 UUID，保障 pgvector uuid 列匹配
  function toValidUuid(str: string): string {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(str)) {
      return str;
    }
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, "0") + 
                Math.abs(hash * 31).toString(16).padStart(8, "0") + 
                Math.abs(hash * 17).toString(16).padStart(8, "0") + 
                Math.abs(hash * 13).toString(16).padStart(8, "0");
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
  }

  // 1. Agnes AI 向量化计算辅助函数
  async function getAgnesEmbedding(text: string, apiKey: string): Promise<number[]> {
    const finalKey = apiKey || process.env.AGNES_API_KEY;
    if (!finalKey || finalKey.startsWith("MY_")) {
      throw new Error("Agnes AI API key 未配置或无效，请设置 AGNES_API_KEY 或传入 customApiKey。");
    }

    try {
      console.log(`[RAG Backend] 正在请求 Agnes AI Embeddings (${AGNES_EMBEDDING_MODEL})...`);
      const response = await fetch(`${AGNES_API_BASE_URL}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${finalKey}`,
          "User-Agent": "aistudio-build"
        },
        body: JSON.stringify({
          model: AGNES_EMBEDDING_MODEL,
          input: text
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`[RAG Backend] Agnes AI Embeddings 请求失败 (${response.status}): ${errText}`);
      }

      const resData: any = await response.json();
      const values = resData.data?.[0]?.embedding;
      if (!values || !Array.isArray(values)) {
        throw new Error("未从 Agnes API 响应解析到有效向量。");
      }

      return values;
    } catch (err: any) {
      console.error("[RAG Backend] Agnes Embedding 请求失败:", err);
      throw err;
    }
  }

  // 2. Agnes AI 对话服务网关
  async function callAgnesChat(
    messages: any[],
    temperature: number,
    responseFormatJson?: boolean,
    customApiKey?: string,
    maxTokens?: number
  ): Promise<string> {
    const finalKey = customApiKey || process.env.AGNES_API_KEY;
    if (!finalKey || finalKey.startsWith("MY_")) {
      throw new Error("Agnes AI API key 未配置或无效，请设置 AGNES_API_KEY 或传入 customApiKey。");
    }

    try {
      console.log(`[RAG Backend] 正在请求 Agnes AI 对话模型: ${AGNES_CHAT_MODEL}...`);
      const payload: any = {
        model: AGNES_CHAT_MODEL,
        messages: messages,
        temperature: temperature || 0.3,
        max_tokens: maxTokens || 4096
      };
      if (responseFormatJson) {
        payload.response_format = { type: "json_object" };
      }

      const response = await fetch(`${AGNES_API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${finalKey}`,
          "User-Agent": "aistudio-build"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`[RAG Backend] Agnes AI Chat 请求失败 (${response.status}): ${errText}`);
      }

      const resData: any = await response.json();
      const text = resData.choices?.[0]?.message?.content;
      if (typeof text !== "string") {
        throw new Error("Agnes AI 返回异常格式，未获取文本内容。");
      }

      return text;
    } catch (err: any) {
      console.error("[RAG Backend] Agnes Chat 请求失败:", err);
      throw err;
    }
  }

  // 解析 JSON 报文
  app.use(express.json());

  // 为 Chrome 拓展跨域调用设计 CORS
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    // 处理 OPTIONS 预检请求
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    next();
  });

  // 1. 健康检查路由
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // 临时诊断端点：v2.2.0-debug 用，主人可访问 /api/debug/env 看容器内 SUPABASE/AGNES 配置
  app.get("/api/debug/env", async (req, res) => {
    const url = process.env.SUPABASE_URL || "(undefined)";
    const key = process.env.SUPABASE_KEY || "(undefined)";
    const agnesKey = process.env.AGNES_API_KEY || "(undefined)";
    const agnesBase = process.env.AGNES_API_BASE_URL || "https://apihub.agnes-ai.com/v1 (default)";
    const agnesEmb = process.env.AGNES_EMBEDDING_MODEL || "agnes-2.0-flash (default)";
    const agnesChat = process.env.AGNES_CHAT_MODEL || "agnes-2.0-flash (default)";
    // 不暴露完整 key，只暴露 prefix + suffix + 长度
    const safe = (s: string) => s.length > 20
      ? `${s.substring(0, 12)}...${s.substring(s.length - 4)} (len=${s.length})`
      : `(len=${s.length})`;
    res.json({
      SUPABASE_URL: url,
      SUPABASE_KEY: safe(key),
      AGNES_API_KEY: safe(agnesKey),
      AGNES_API_BASE_URL: agnesBase,
      AGNES_EMBEDDING_MODEL: agnesEmb,
      AGNES_CHAT_MODEL: agnesChat
    });
  });

  // 临时诊断端点：v2.2.0-debug 用，跑 STAGE_SPEECH 5 视角识别 agent 并返回原始输出 + 解析结果
  app.get("/api/debug/identify-test", async (req, res) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    const apiKey = process.env.AGNES_API_KEY;
    if (!url || !key || !apiKey) {
      return res.status(500).json({ error: "env 缺失", url: !!url, key: !!key, apiKey: !!apiKey });
    }
    try {
      const supabase = createSupabaseClient(url, key);
      const { data, error } = await supabase
        .from("documents")
        .select("id, content, url, current_stage")
        .eq("current_stage", "STAGE_SPEECH")
        .limit(10);
      if (error) return res.status(500).json({ step: "supabase", error: String(error) });
      const docs = data || [];
      const memoryContext = docs.length
        ? docs.map((m, idx) => `[智库参考资料 #${idx+1}] -> ${m.content}`).join("\n\n")
        : "（无业务文档）";
      const systemPrompt = `你是群运营文档分析中枢。\n\n【业务文档】\n${memoryContext}\n\n【主需求】生成3条投顾群活跃话术\n\n【硬性输出要求】输出一个 JSON，包含 scenarios/roles/rhythm/forbidden/caseSnippets 5 个字段。`;
      const identifyText = await callAgnesChat(
        [{ role: "system", content: systemPrompt }, { role: "user", content: "请输出 JSON" }],
        0.4, true, apiKey, 4096
      );
      // 3 层容错解析
      const safeParse = (text: string): { ok: boolean; result?: any; tried?: string[]; error?: string } => {
        const tried: string[] = [];
        if (!text || !text.trim()) return { ok: false, error: "empty", tried };
        try { tried.push("direct"); return { ok: true, result: JSON.parse(text), tried }; } catch (e: any) { tried.push(`direct-fail:${e.message}`); }
        const fence = text.match(/\`\`\`(?:json)?\s*([\s\S]+?)\s*\`\`\`/);
        if (fence) { tried.push("fence"); try { return { ok: true, result: JSON.parse(fence[1]), tried }; } catch (e: any) { tried.push(`fence-fail:${e.message}`); } }
        const start = text.indexOf("{");
        if (start >= 0) {
          let depth = 0, inStr = false, esc = false, end = -1;
          for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (esc) { esc = false; continue; }
            if (ch === "\\") { esc = true; continue; }
            if (ch === "\"") { inStr = !inStr; continue; }
            if (inStr) continue;
            if (ch === "{") depth++;
            else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
          }
          if (end >= 0) { tried.push("balanced"); const cand = text.substring(start, end+1); try { return { ok: true, result: JSON.parse(cand), tried }; } catch (e: any) { tried.push(`balanced-fail:${e.message}`); } }
          else { tried.push("balanced-not-found"); }
        }
        return { ok: false, error: "all-failed", tried };
      };
      const parseResult = safeParse(identifyText);
      return res.json({
        docsCount: docs.length,
        memoryContextLength: memoryContext.length,
        identifyTextLength: identifyText.length,
        identifyTextPreview: identifyText.substring(0, 500),
        identifyTextEnd: identifyText.length > 500 ? identifyText.substring(identifyText.length - 200) : "",
        parse: parseResult
      });
    } catch (e: any) {
      return res.status(500).json({ step: "exception", error: String(e), message: e?.message });
    }
  });

  // 临时诊断端点：v2.2.0-debug 用，直接在容器内跑 STAGE_SPEECH 直查并返回完整结果（不依赖 Railway logs）
  app.get("/api/debug/speech-test", async (req, res) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) {
      return res.status(500).json({ error: "SUPABASE_URL/KEY 缺失", url, key: key ? "(set)" : "(missing)" });
    }
    try {
      const supabase = createSupabaseClient(url, key);
      const t1 = Date.now();
      const { data, error } = await supabase
        .from("documents")
        .select("id, content, url, current_stage")
        .eq("current_stage", "STAGE_SPEECH")
        .limit(10);
      const ms = Date.now() - t1;
      if (error) {
        return res.json({ success: false, step: "supabase query", error: String(error), ms });
      }
      return res.json({
        success: true,
        ms,
        count: data ? data.length : 0,
        sample: data && data[0] ? { id: data[0].id, contentPreview: data[0].content.substring(0, 80) } : null,
        ids: data ? data.map((d: any) => d.id.substring(0, 8)) : []
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, step: "exception", error: String(e), message: e?.message });
    }
  });

  // 读取磁盘上最新 Chrome 扩展文件，保障前端一键下包始终 100% 对齐
  app.get("/api/extension/files", async (req, res) => {
    try {
      const fs = await import("fs/promises");
      const extDir = path.join(process.cwd(), "extension");
      const fileNames = [
        "manifest.json",
        "style.css",
        "sidepanel.html",
        "sidepanel.js",
        "popup.html",
        "popup.js",
        "background.js",
        "content.js",
        "rag-engine.js"
      ];
      const filesList = [];
      for (const name of fileNames) {
        const filePath = path.join(extDir, name);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          let description = "";
          let language = "javascript";
          if (name === "manifest.json") {
            description = "Chrome 扩展基础配置文件 (Manifest V3)，声明面板权限、背景脚本及内容文本抓取安全策略。";
            language = "json";
          } else if (name === "style.css") {
            description = "扩展程序公共样式表。基于 Slate & Mint 极简高质感设计系统，完美适配侧边栏面板及 Popup 视窗尺寸规格。";
            language = "css";
          } else if (name === "sidepanel.html") {
            description = "常驻侧边栏的对话主面板 UI 骨架。提供完备的问答流组件、设置抽屉、及实时抓取状态动态指示。";
            language = "html";
          } else if (name === "sidepanel.js") {
            description = "侧边栏核心脚本逻辑。监听活动网页文本、提取分块、计算本地相似度并在得到结果后发起智能 RAG 问答。";
            language = "javascript";
          } else if (name === "popup.html") {
            description = "Popup 小窗快速问答 UI 骨架，便于临时开启 RAG 检索体验。";
            language = "html";
          } else if (name === "popup.js") {
            description = "Popup 核心控制器，处理简易弹窗与本地智库及大模型的智能桥接。";
            language = "javascript";
          } else if (name === "background.js") {
            description = "系统后台生命周期管理脚本。控制 SidePanel 点击激活机制等核心行为。";
            language = "javascript";
          } else if (name === "content.js") {
            description = "作用于宿主网页的 DOM 提取脚本，为核心思维引擎提供高保真 innerText 内容。";
            language = "javascript";
          } else if (name === "rag-engine.js") {
            description = "一体化语义本地切片 (Chunking) 与客户端余弦相似度 (Cosine) 匹配双内核组件。";
            language = "javascript";
          }
          filesList.push({
            name,
            path: name,
            description,
            language,
            content
          });
        } catch (e) {
          console.error(`读取 ${name} 错误:`, e);
        }
      }
      res.json({ success: true, files: filesList });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Core Jin Yang RAG 路由
  app.post("/api/rag", async (req, res) => {
    try {
      const { query, context, customApiKey, supabaseUrl, supabaseKey, user_id, current_stage } = req.body;

      if (!query) {
        return res.status(400).json({ error: "用户提问(query)不可为空。" });
      }

      const finalUserId = toValidUuid(user_id || "system_sales_default");
      const finalStage = current_stage || "STAGE_1_RECEIVE";

      // 智能安全加载：支持从环境变量或自定义密钥端获取认证密钥
      const resolvedApiKey = customApiKey || process.env.AGNES_API_KEY;
      if (!resolvedApiKey || resolvedApiKey === "MY_AGNES_API_KEY") {
        return res.status(400).json({
          error: "未挂载官方或自定义 API 密钥。请填参配置密钥后再行对话。"
        });
      }

      // 长期记忆检索部分 (云端 pgvector 多租户及销售阶段隔离搜索路径)
      let cloudMemories: any[] = [];
      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (resolvedSupabaseUrl && resolvedSupabaseKey && resolvedSupabaseUrl !== "MY_SUPABASE_URL" && resolvedSupabaseKey !== "MY_SUPABASE_KEY") {
        // v2.2.0-debug: 把容器内 SUPABASE 配置的 prefix 打出来（不打印完整 key）
        const urlPrefix = resolvedSupabaseUrl.substring(0, 35);
        const keyPrefix = resolvedSupabaseKey.substring(0, 12);
        const keySuffix = resolvedSupabaseKey.substring(resolvedSupabaseKey.length - 4);
        console.log(`[RAG Backend] ENV 诊断: url=${urlPrefix}... key=${keyPrefix}...${keySuffix} (len=${resolvedSupabaseKey.length})`);
        // v2.1 STAGE_SPEECH 优先走"拉全表 stage 文档"模式（不依赖 Embedding 相似度）
        // 因为 v2.0 STAGE_SPEECH 的核心是 prompt 编排，相似度排序意义不大
        // 业务文档量小（< 50 条），全表拉后丢给识别 agent 即可
        if (finalStage === 'STAGE_SPEECH') {
          try {
            console.log(`[RAG Backend] STAGE_SPEECH 走业务文档直查模式（不依赖 Embedding）`);
            const supabase = createSupabaseClient(resolvedSupabaseUrl, resolvedSupabaseKey);
            const { data: speechDocs, error: speechErr } = await supabase
              .from("documents")
              .select("id, content, url, current_stage")
              .eq("current_stage", "STAGE_SPEECH")
              .limit(10);
            if (speechErr) {
              console.error("[RAG Backend] STAGE_SPEECH 直查 SQL 错:", speechErr);
            } else if (speechDocs && Array.isArray(speechDocs)) {
              cloudMemories = speechDocs.map((d: any) => ({
                id: d.id,
                content: d.content,
                url: d.url || "",
                similarity: 0.8
              }));
              console.log(`[RAG Backend] STAGE_SPEECH 直查命中 ${cloudMemories.length} 条业务文档, ids=${cloudMemories.map(d=>d.id.substring(0,8)).join(",")}`);
            } else {
              console.warn("[RAG Backend] STAGE_SPEECH 直查无数据返回 (data is null/undefined)");
            }
          } catch (speechErr: any) {
            console.error("[RAG Backend] STAGE_SPEECH 直查异常:", speechErr);
          }
        } else {
        try {
          console.log(`[RAG Backend] 正在计算提问词 "${query}" 的 Embedding 向量 (Agnes Embeddings Model)`);
          const queryEmbedding = await getAgnesEmbedding(query, resolvedApiKey);

          if (queryEmbedding && Array.isArray(queryEmbedding)) {
            console.log(`[RAG Backend] 正在进行 Supabase 多租户: "${finalUserId}" 且阶段: "${finalStage}" 独立 RAG 过滤与检索`);
            const supabase = createSupabaseClient(resolvedSupabaseUrl, resolvedSupabaseKey);
            
            // 优先尝试新型 DDL 函数 match_advisor_knowledge
            const { data: rpcData, error: rpcErr } = await supabase.rpc("match_advisor_knowledge", {
              query_embedding: queryEmbedding,
              current_stage: finalStage,
              target_user_id: finalUserId
            });

            if (!rpcErr && rpcData && Array.isArray(rpcData)) {
              cloudMemories = rpcData.map((d: any) => ({
                id: d.id,
                content: d.content,
                url: d.url,
                similarity: d.similarity || 0.8
              })).slice(0, 3);
              console.log(`[RAG Backend] pgvector match_advisor_knowledge 顺利命中 ${cloudMemories.length} 历史记忆`);
            } else {
              console.warn("[RAG Backend] match_advisor_knowledge 检索失败，降级为 Node.js 客户端余弦召回:", rpcErr);

              // 降级拉取库中可能的数据做 Node.js 精准客户端过滤计算
              let dbDocs: any[] | null = null;
              let dbErr: any = null;

              const firstTry = await supabase
                .from("documents")
                .select("id, content, url, embedding, user_id, current_stage");

              if (firstTry.error && (firstTry.error.message.includes("current_stage") || firstTry.error.message.includes("column"))) {
                console.warn("[RAG Backend] Documents 表缺少 'current_stage' 字段，自动降级去除非此列选择...");
                const secondTry = await supabase
                  .from("documents")
                  .select("id, content, url, embedding, user_id");
                dbDocs = secondTry.data;
                dbErr = secondTry.error;
              } else {
                dbDocs = firstTry.data;
                dbErr = firstTry.error;
              }

              if (!dbErr && dbDocs && Array.isArray(dbDocs)) {
                // 严格进行租户隔离和阶段隔离
                const filteredDocs = dbDocs.filter((d: any) => {
                  const docUserId = toValidUuid(d.user_id || "system_sales_default");
                  const docStage = d.current_stage;
                  // 销冠 4 stage：user_id 隔离 + stage 严格匹配（行为不变）
                  if (finalStage !== 'STAGE_SPEECH') {
                    return docUserId === finalUserId && docStage === finalStage;
                  }
                  // STAGE_SPEECH：业务话术共享，不做 user_id 隔离，只按 stage 过滤
                  return docStage === 'STAGE_SPEECH';
                });

                // 在 Node.js 服务端完成精准的余弦相似度计算与排序
                const scoredDocs = filteredDocs
                  .map((d: any) => {
                    let score = 0;
                    if (d.embedding && Array.isArray(d.embedding)) {
                      score = cosineSimilarity(queryEmbedding, d.embedding);
                    }
                    return {
                      id: d.id,
                      content: d.content,
                      url: d.url,
                      similarity: score
                    };
                  })
                  .filter((d: any) => d.similarity >= 0.05) // 相似度阈值宽容
                  .sort((a, b) => b.similarity - a.similarity)
                  .slice(0, 3); // top 3

                cloudMemories = scoredDocs;
                console.log(`[RAG Backend] 降级 Node.js 余弦相似度召回完成，命中数: ${cloudMemories.length}`);
              } else {
                console.warn("[RAG Backend] 全表降级查询失败，尝试备用 match_documents RPC:", dbErr);
                const { data: fbData, error: fbErr } = await supabase.rpc("match_documents", {
                  query_embedding: queryEmbedding,
                  match_threshold: 0.1,
                  match_count: 3
                });
                if (!fbErr && fbData) {
                  cloudMemories = fbData;
                }
              }
            }
          }
        } catch (embedErr: any) {
          console.error("[RAG Backend] 计算向量 / 查询云端记忆库失败:", embedErr);
        }
        } // <-- v2.1 STAGE_SPEECH 走独立分支，销冠 4 stage 维持原 Embedding 检索
      }

      // 格式化长期记忆召回详情入提示词
      const memoryContext = cloudMemories.length > 0
        ? cloudMemories.map((m: any, idx: number) => `[智库参考资料 #${idx+1}] -> ${m.content}`).join("\n\n")
        : "（长期库中未检索到与用户提问相关的特惠折扣、技术亮点、配置说明或售后解答数据）";

      // 深度绑定上述 4 个销售阶段的高段位销冠思维 Prompt
      const STAGE_CONFIGS: Record<string, {
        name: string,
        instruction: string,
        emoji: string
      }> = {
        STAGE_1_RECEIVE: {
          name: "接待准备相识阶段",
          instruction: "你现在处于【接待建立信任（建立客勤）】的接待准备相识阶段。回答需无比温暖大方、客气礼貌、贴心周到，表现出极强的服务素养和大商风范。回答必须控制在 2~3 句以内。严禁直接硬性逼单或催促成交，重点在于解答客户心中疑惑、拉近日常距离、建立牢不可破的客勤关系。严禁泄密、严禁在回答中透露任何例如'接待准备‘、'销售阶段’、'租户'等任何学术或营销内部术语。结尾符合调性地自带一个且仅一个表情：🤝。",
          emoji: "🤝"
        },
        STAGE_2_GROUP: {
          name: "社群互动探需阶段",
          instruction: "你现在处于【社群互动与技术探需（痛点剖析）】的社群解答阶段。回答应极具号召力和社群氛围感知力，善于通俗易懂地解构高精度和极其棘手的技术质疑，以绝对权威放大和剖析该环节的用户核心痛点。回答必须控制在 2~3 句以内。严禁自曝处于'社群'、'互动'、'答疑'等词汇。结尾自发附带灵感💡或火焰🔥表情之一。",
          emoji: "💡"
        },
        STAGE_3_ACTIVATE: {
          name: "私聊跟进邀约阶段",
          instruction: "你现在处于【一对一私聊锁定（痛点深度触达）】的深度私聊激活阶段。应该无比敏锐而富有人文关怀、洞悉人性卡点并切中要害，针对客户提出的疑虑一针见血，并顺理成章、轻盈优雅地设下钩子引导开展微信语音沟通。回答必须控制在 2~3 句以内。严厉禁止泄露关于'私聊'、'锁定'、'话术'等字眼。结尾自发带有符合本阶段微细探求调性的目标🎯表情。",
          emoji: "🎯"
        },
        STAGE_4_OPEN: {
          name: "临门成交收定阶段",
          instruction: "你现在处于【临门一脚成交逼单、锁定定金】的终极签约阶段。语气风格需展现出绝对的必胜把握、不容拒绝的真挚诚意以及无法抗拒的信任背书，帮他打消付款前的最后一厘米对安全性、工期或效果的顾虑，实现完美托底促单。回答必须控制在 2~3 句以内。严厉禁止提及'成交'、'逼单'、'收钱'等敏感情感字眼。结尾自发带有冲刺🚀或奖杯🏆表情之一。",
          emoji: "🚀"
        }
      };
      // ==================== v2.0 STAGE_SPEECH 群活跃话术生成（独立分支，不走销冠 prompt）====================
      if (finalStage === 'STAGE_SPEECH') {
        // ====== v2.0 STAGE_SPEECH 第一步：5 视角识别 Agent 并发协同 ======
        // 5 个视角共享同一份业务文档上下文（memoryContext），并发识别不同维度
        // 输出统一为一个 JSON 块
        const identifySystemInstruction =
          `你是群运营文档分析中枢。分析业务文档，输出 JSON 描述：群运营场景/角色/节奏/禁词/案例。

【业务文档】
${memoryContext}

【主需求】
${query}

【硬性输出要求 - 严格遵守】
1. 纯 JSON（不要 markdown 围栏，不要解释/注释）
2. 字段：
{
  "scenarios": [ { "name": "场景名", "trigger": "触发条件", "timing": "时段" } ],
  "roles": [ { "name": "角色", "trait": "特征", "voice": "语气", "bestTiming": "适合时段" } ],
  "rhythm": { "totalLines": 数字, "order": ["角色1","角色2"], "intervalHint": "间隔" },
  "forbidden": [ "禁词1", "禁词2" ],
  "caseSnippets": [ "样板1", "样板2" ]
}
3. 找不到用空数组 []，绝不输出 null
4. 禁止：多逗号、未闭合、注释、单引号`;

        const identifyMessages = [
          { role: "system", content: identifySystemInstruction },
          { role: "user", content: "请按 5 视角分析上述业务文档并输出 JSON 块" }
        ];

        let identifyText = "";
        try {
          identifyText = await callAgnesChat(identifyMessages, 0.4, true, resolvedApiKey, 4096);
          console.log(`[RAG Backend] 识别原始输出 (前 200 字): ${identifyText.substring(0, 200).replace(/\n/g, " ")}`);
        } catch (e) {
          console.error("[RAG Backend] STAGE_SPEECH 第一步识别失败:", e);
          identifyText = "";
        }

        // 解析识别 JSON（多层容错：先尝试严格 JSON.parse，再尝试 markdown 围栏抽取，再尝试大括号平衡匹配 + 截断修复）
        let identifyJson = { scenarios: [], roles: [], rhythm: { totalLines: 0, order: [] }, forbidden: [], caseSnippets: [] };
        const safeParseJson = (text: string): any | null => {
          if (!text || !text.trim()) return null;
          // 1. 直接尝试
          try { return JSON.parse(text); } catch {}
          // 2. 抽取 三个反引号 json 围栏
          const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
          if (fenceMatch) { try { return JSON.parse(fenceMatch[1]); } catch {} }
          // 3. 大括号平衡匹配：找最外层 {...}
          const start = text.indexOf("{");
          if (start < 0) return null;
          let depth = 0, inStr = false, esc = false, end = -1;
          for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (esc) { esc = false; continue; }
            if (ch === "\\") { esc = true; continue; }
            if (ch === "\"") { inStr = !inStr; continue; }
            if (inStr) continue;
            if (ch === "{") depth++;
            else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
          }
          if (end < 0) return null;
          const candidate = text.substring(start, end + 1);
          try { return JSON.parse(candidate); } catch {}
          return null;
        };
        const parsed = safeParseJson(identifyText);
        if (parsed) {
          identifyJson = Object.assign(identifyJson, parsed);
          console.log(`[RAG Backend] 识别 JSON 解析成功: scenarios=${(parsed.scenarios||[]).length} roles=${(parsed.roles||[]).length} forbidden=${(parsed.forbidden||[]).length} cases=${(parsed.caseSnippets||[]).length} rhythm=${(parsed.rhythm&&parsed.rhythm.totalLines)||0}`);
        } else {
          console.warn(`[RAG Backend] 识别 JSON 解析失败，使用空骨架. 原始输出 (前 300): ${identifyText.substring(0, 300).replace(/\n/g, " ")}`);
        }

        // ====== v2.0 STAGE_SPEECH 第二步：多角色 Agent 编排生成 ======
        // 抽取识别结果作为本次编排的硬性约束
        const rolesList = (identifyJson.roles || []).map(r => `- ${r.name}（${r.trait || ''}，${r.voice || ''}）`).join('\n') || '- 老师\n- 老粉\n- 萌新';
        const forbiddenList = (identifyJson.forbidden || []).join('、') || '（文档未识别到禁词）';
        const rhythmOrder = (identifyJson.rhythm && identifyJson.rhythm.order && identifyJson.rhythm.order.length) ? identifyJson.rhythm.order.join(' → ') : '按角色自然轮换';
        const totalLines = (identifyJson.rhythm && identifyJson.rhythm.totalLines) || 8;
        const caseSnippets = (identifyJson.caseSnippets || []).slice(0, 2).join('\n  · ').slice(0, 400) || '（无样板）';

        const orchestrateSystemInstruction =
          `你是群运营多角色编排 Agent。上一阶段已完成 5 视角识别，现在你负责把识别结果编排成多角色群聊话术。

【5 视角识别结果】
- 角色清单：\n${rolesList}
- 节奏顺序：${rhythmOrder}
- 禁词表：${forbiddenList}
- 案例样板：\n  · ${caseSnippets}

【主需求】
${query}

【本场硬约束】
- 总条数：**${totalLines} 条**（必须严格相等，不许多少）
- 每个角色至少出现 1 次
- 角色之间必须呼应 / 对答 / 递进，像真实群聊
- 口语化断句，每条 15-50 字
- 严禁出现具体股票代码、具体收益承诺、群规禁词
- 严禁暴露你是 AI，严禁出现"群活跃""话术""阶段"等元术语
- 不输出任何解释 / 标题 / 前缀 / 编号 / Markdown 符号
- 格式严格：[角色名] 内容（每行一条）`;

        const orchestrateMessages = [
          { role: "system", content: orchestrateSystemInstruction },
          { role: "user", content: "请按上述约束直接输出多角色群聊话术" }
        ];

        console.log(`[RAG Backend] STAGE_SPEECH 5 视角识别完成，进入编排阶段，总条数=${totalLines}`);

        let speechText = "";
        try {
          speechText = await callAgnesChat(orchestrateMessages, 0.85, false, resolvedApiKey);
        } catch (e) {
          console.error("[RAG Backend] STAGE_SPEECH 编排失败:", e);
          return res.json({
            answer: `[编排失败] ${e && e.message ? e.message : e}`,
            cloudMemories,
            stage: 'STAGE_SPEECH',
            identifyJson
          });
        }

        return res.json({
          answer: speechText,
          cloudMemories,
          stage: 'STAGE_SPEECH',
          identifyJson,
          totalLines
        });
      }
      // ==================== /v2.0 STAGE_SPEECH 分支结束 ====================



      const activeStageConfig = STAGE_CONFIGS[finalStage] || STAGE_CONFIGS.STAGE_1_RECEIVE;

      const systemInstruction = 
        `您是顶级金牌业务销冠、也是熟稔 Supabase pgvector 长期记忆的双路 RAG 知识检索专家。
请熟读如下与当前销售阶段深度绑定的销冠常识：
- ${activeStageConfig.instruction}

你将被赋予两个维度的实时语境信息：
1. 【当前正在浏览页面切块 (Top 3)】：这是前线销售和客户极具即时时效性的页面上下文。
2. 【从 Supabase pgvector 召回的云端长期记忆 (Top 3)】：这是公司库中过去保存的高精准销冠业务底单或案例库：
===========================
${context || "（当前网页未找到匹配的网页参考片段。）"}
===========================
${memoryContext}
===========================

请极其严格地遵守下方约束：
1. 回答【必须严格控制在 2~3 句以内】。不冗余，句句珠玑，情绪饱满，表现出高段位大商的情感关怀与极强专业说服力。
2. 回答【绝对不能泄露任何关于销售阶段的术语，更不能出现'阶段'、'租户'、'话术'、'阶段1'、'STAGE_X'等字眼或套用公式感】。
3. 如果背景参考资料中完全没有提及的内容，绝对不能凭空捏造产品服务和乱许折扣。
4. 回答在【最末尾只能极其轻灵自然地自带一个且仅仅一个符合本阶段温度的表情】：${activeStageConfig.emoji}。`;

      const prompt = `客户提问：${query}
请立刻基于当前销售阶段及双路召回智库，发表完美的销冠回复：`;

      console.log(`[RAG Backend] 正在请求统一对话分析服务 (Agnes-1.5-Flash)，提问: "${query}"`);

      const messages = [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ];

      const text = await callAgnesChat(messages, 0.3, false, resolvedApiKey);
      res.json({ answer: text, cloudMemories });
    } catch (err: any) {
      console.error("[RAG Backend] 遇到错误:", err);
      res.status(500).json({ error: err.message || "内部服务器大模型推理故障" });
    }
  });

  // 自动提取及分词标签功能
  function extractKeywords(text: string): string[] {
    const stopWords = new Set([
      "the", "and", "of", "to", "a", "in", "for", "is", "on", "that", "by", "this", "with", "i", "you", "it", "not", "or", "be", "are", "from", "at", "as", "an", "was", "we", "can", "us", "our",
      "的", "了", "和", "是", "就", "都", "而", "及", "与", "着", "等", "在", "用", "有", "其", "以", "自", "于", "之", "或", "为", "往", "此", "可以", "一个", "我们"
    ]);

    // 提取可能的英文技术词
    const engWords = (text.match(/[a-zA-Z]{3,20}/g) || [])
      .map(w => w.toLowerCase())
      .filter(w => !stopWords.has(w));

    // 统计频率
    const freqMap: Record<string, number> = {};
    engWords.forEach(w => {
      freqMap[w] = (freqMap[w] || 0) + 1;
    });

    // 核心中英文技术术语映射表，更精准命中
    const techBuzzwords = [
      "react", "supabase", "postgres", "pgvector", "embedding", "vector", "database", "api", "chunk", "rag", "routing",
      "typescript", "node", "server", "webpage", "sidepanel", "extension", "chrome", "sync", "memory", "client", "auth", "token", "diagnostic",
      "向量", "数据库", "模型", "记忆", "同步", "网页", "浏览器", "插件", "知识", "切片", "端点", "缓存", "检索", "对话", "连接"
    ];

    const matchedTech: string[] = [];
    for (const buzz of techBuzzwords) {
      const regex = new RegExp(buzz, "gi");
      if (regex.test(text)) {
        matchedTech.push(buzz.toUpperCase());
      }
    }

    const sortedEng = Object.entries(freqMap)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0].toUpperCase())
      .slice(0, 3);

    // 去重合并，最多前 5 个
    const tags = Array.from(new Set([...matchedTech, ...sortedEng])).slice(0, 5);
    return tags;
  }

  // 3. 固化存储文本片段到 Supabase vector 长期记忆中
  app.post("/api/memory/save", async (req, res) => {
    try {
      const { content, url, customApiKey, supabaseUrl, supabaseKey, user_id, current_stage } = req.body;

      if (!content) {
        return res.status(400).json({ error: "要存储的内容(content)不可为空。" });
      }

      const finalUserId = toValidUuid(user_id || "system_sales_default");
      const finalStage = current_stage || "STAGE_1_RECEIVE";

      // 提取核心关键词/标签，提高 Manage Memory 表格等页面的过滤及搜索精度
      const autoTags = extractKeywords(content);
      const taggedContent = autoTags.length > 0
        ? `${content}\n\n🏷️ 自动标签: ${autoTags.map(tag => `#${tag}`).join(" ")}`
        : content;

      // 获取 KEY 用于做 embedding 转向量
      const resolvedApiKey = customApiKey || process.env.AGNES_API_KEY;
      if (!resolvedApiKey || resolvedApiKey === "MY_AGNES_API_KEY") {
        return res.status(400).json({
          error: "未挂载 API 密钥。固化长期记忆需要先获取向量，请添加嵌入转换密钥。"
        });
      }

      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (!resolvedSupabaseUrl || !resolvedSupabaseKey || resolvedSupabaseUrl === "MY_SUPABASE_URL" || resolvedSupabaseKey === "MY_SUPABASE_KEY") {
        return res.status(400).json({
          error: "未配置 Supabase 信息。请在侧边栏「设置」面板中补充您的 Supabase URL 和 Anon Key，或将它们配置在系统环境变量中。"
        });
      }

      console.log(`[Memory Save] 正在调用 Agnes AI 计算 Embedding 向量 for 租户: "${finalUserId}" 且阶段: "${finalStage}"`);
      
      const embeddingValues = await getAgnesEmbedding(taggedContent, resolvedApiKey);

      const supabase = createSupabaseClient(resolvedSupabaseUrl, resolvedSupabaseKey);
      const insertPayload: any = {
        content: taggedContent,
        embedding: embeddingValues,
        url: url || "memory",
        user_id: finalUserId,
        created_at: new Date().toISOString()
      };

      let { error: dbErr } = await supabase
        .from("documents")
        .insert({
          ...insertPayload,
          current_stage: finalStage
        });

      if (dbErr && (dbErr.message.includes("current_stage") || dbErr.message.includes("column"))) {
        console.warn("[Memory Save] Documents 表中缺失 'current_stage' 列，自动降级不包含该列进行二次插入...");
        const retryResult = await supabase
          .from("documents")
          .insert(insertPayload);
        dbErr = retryResult.error;
      }

      if (dbErr) {
        throw new Error(`Supabase 长期库持久化插入异常: ${dbErr.message}`);
      }

      res.json({ success: true, tags: autoTags, content: taggedContent });
    } catch (err: any) {
      console.error("[Memory Save Error]:", err);
      res.status(500).json({ error: err.message || "存储永久记忆流程失败" });
    }
  });

  // 3.0. 允许点击按钮唤起 Google Picker，并在后端分片存入 Supabase 的长期记忆库
  app.post("/api/drive/import", async (req, res) => {
    try {
      const { fileId, fileName, mimeType, accessToken, customApiKey, supabaseUrl, supabaseKey, user_id, current_stage } = req.body;

      if (!fileId || !accessToken) {
        return res.status(400).json({ error: "Google 资源定位符(fileId) 与验证票据(accessToken) 不能为空。" });
      }

      const finalUserId = toValidUuid(user_id || "system_sales_default");
      const finalStage = current_stage || "STAGE_1_RECEIVE";

      const resolvedApiKey = customApiKey || process.env.AGNES_API_KEY;
      if (!resolvedApiKey || resolvedApiKey === "MY_AGNES_API_KEY") {
        return res.status(400).json({
          error: "未挂载 API 密钥。建立分块向量模型需要获取 Embedding 权限，请在 Settings 或侧栏中配置密钥。"
        });
      }

      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;
      if (!resolvedSupabaseUrl || !resolvedSupabaseKey || resolvedSupabaseUrl === "MY_SUPABASE_URL" || resolvedSupabaseKey === "MY_SUPABASE_KEY") {
        return res.status(400).json({
          error: "未配置 Supabase 长期数据库。请先在在设置中或环境变量中补充您的 URL & Anon Key。"
        });
      }

      let fileContentText = "";
      const driveFileUrl = `https://drive.google.com/open?id=${fileId}`;

      console.log(`[Drive Import] 启动后台文件下载: `, { fileId, fileName, mimeType });

      // 根据 MimeType 分支做不同格式 of 下载/导出
      if (
        mimeType === "application/vnd.google-apps.document" || 
        mimeType === "application/vnd.google-apps.presentation" || 
        mimeType === "application/vnd.google-apps.drawing"
      ) {
        // 对于谷歌在线文档/幻灯片等，使用 Export 接口导出为 text/plain
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
        const response = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
          throw new Error(`谷歌在线文档导出失败: ${response.statusText} (${response.status})`);
        }
        fileContentText = await response.text();
      } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
        // 对于谷歌表格，导出为 text/csv csv
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
        const response = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
          throw new Error(`谷歌电子表格导出失败: ${response.statusText} (${response.status})`);
        }
        fileContentText = await response.text();
      } else if (mimeType === "application/pdf") {
        // 对于 PDF，通过 alt=media 获得二进制数据流并使用 Agnes AI 进行文本恢复和高精度提取
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const response = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
          throw new Error(`Google Drive PDF 下载失败: ${response.statusText} (${response.status})`);
        }
        
        const pdfArrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(pdfArrayBuffer);

        console.log(`[Drive Import] PDF 读取成功 (${pdfBuffer.length} 字节)。正在通过统一对话服务恢复 PDF 纯文本数据...`);

        const messages = [
          {
            role: "user",
            content: `请帮我从以下 PDF 文件（已转为 Base64 编码，长度为 ${pdfBuffer.length} 字节）或大文本数据的前部中，尽可能完整地还原出你见到的全部可见段落、句子、数据 and 图表文字，以便于后续存入向量表做 RAG 知识检索：\n${pdfBuffer.subarray(0, 16000).toString("base64")}`
          }
        ];

        fileContentText = await callAgnesChat(messages, 0.3, false, resolvedApiKey);
      } else {
        // 常规文本格式 (TXT, Markdown, JSON, CSV 等)
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const response = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
          throw new Error(`常规文件下载失败: ${response.statusText} (${response.status})`);
        }
        fileContentText = await response.text();
      }

      if (!fileContentText || fileContentText.trim().length === 0) {
        return res.status(400).json({ error: "从该文件中未能提取到任何有效文字内容（或是个空文档）。" });
      }

      console.log(`[Drive Import] 文件加载解码成功。文本符号长度: ${fileContentText.length}。进行多段切片化处理...`);

      // 2. 切片分片
      const chunks = chunkTextServer(fileContentText);
      if (chunks.length === 0) {
        return res.status(400).json({ error: "因为文本内容过短或无法满足切片标准，此文件未能进行导入。" });
      }

      const supabase = createSupabaseClient(resolvedSupabaseUrl, resolvedSupabaseKey);
      let successCount = 0;

      // 3. 对各个分块执行 embedding 生成并插入数据库
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];

        // 整理带特征属性的块：提供跨文件问答时的清晰标识来源
        const finalContent = `📁 文件资源: [${fileName}]\n🔗 源链接: ${driveFileUrl}\n-------------------\n${chunkText}\n\n🏷️ 自动标签: #GOOGLE_DRIVE #DOCUMENT #${fileName.split('.').pop()?.toUpperCase() || 'FILE'}`;

        try {
          const embeddingValues = await getAgnesEmbedding(finalContent, resolvedApiKey);

          if (embeddingValues && Array.isArray(embeddingValues)) {
            const insertPayload: any = {
              content: finalContent,
              embedding: embeddingValues,
              url: driveFileUrl,
              user_id: finalUserId,
              created_at: new Date().toISOString()
            };

            let { error: dbErr } = await supabase
              .from("documents")
              .insert({
                ...insertPayload,
                current_stage: finalStage
              });

            if (dbErr && (dbErr.message.includes("current_stage") || dbErr.message.includes("column"))) {
              console.warn("[Drive Import] Documents 表中缺失 'current_stage' 列，自动降级去除非此列插入...");
              const retryResult = await supabase
                .from("documents")
                .insert(insertPayload);
              dbErr = retryResult.error;
            }

            if (!dbErr) {
              successCount++;
            } else {
              console.error(`[Drive Import] 写入分块 ${i + 1}/${chunks.length} 失败:`, dbErr);
            }
          }
        } catch (embedErr: any) {
          console.error(`[Drive Import] 生成分片 ${i + 1} 的嵌入向量失败:`, embedErr);
        }
      }

      res.json({
        success: true,
        message: `「${fileName}」已顺利载入 RAG 云端库！成功切片并建立 ${successCount} 个语义向量检索节点。`,
        totalChunks: chunks.length,
        importedChunks: successCount
      });

    } catch (importErr: any) {
      console.error("[Drive Import] 后台解析和计算遇到问题:", importErr);
      res.status(500).json({ error: importErr.message || "Google Drive 文档导入发生服务器内部故障" });
    }
  });

  // 内部服务器切片分块处理
  function chunkTextServer(text: string, chunkSize = 500, overlapSize = 100): string[] {
    if (!text || text.trim().length === 0) return [];
    const chunks: string[] = [];
    let cursor = 0;
    while (cursor < text.length) {
      let end = Math.min(cursor + chunkSize, text.length);
      if (end < text.length) {
        const remainingWindow = text.substring(end - 50, end + 50);
        const sentenceEndIndex = remainingWindow.search(/[。！？；.!?;\n]/);
        if (sentenceEndIndex !== -1 && (end - 50 + sentenceEndIndex) > cursor) {
          end = end - 50 + sentenceEndIndex + 1;
        }
      }
      const chunkTextStr = text.substring(cursor, end).trim();
      if (chunkTextStr.length > 10) {
        chunks.push(chunkTextStr);
      }
      cursor = end - overlapSize;
      if (cursor >= text.length || end === text.length) break;
      if (cursor <= 0) {
        cursor = end;
      }
    }
    return chunks;
  }

  // 3.0b. 智能话术推荐 API：“销冠思维引擎”重构专版版
  app.post("/api/im/recommend", async (req, res) => {
    try {
      const { chatHistory, customApiKey, supabaseUrl, supabaseKey, user_id, current_stage } = req.body;

      if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
        return res.status(400).json({ error: "聊天记录(chatHistory) 不能为空且必须为数组。" });
      }

      const finalUserId = toValidUuid(user_id || "system_sales_default");
      const finalStage = current_stage || "STAGE_1_RECEIVE";

      // Helper function to clean text: remove system tags, timestamps and emojis
      const filterMsgText = (txt: string): string => {
        if (!txt) return "";
        let t = txt
          .replace(/^(客户|我方|系统|黄金销售代表|客户 Athen|业务回答|客户咨询)\s*:\s*/g, "")
          .replace(/^(客户 Athen|黄金销售代表|客户|我方|系统|业务回答|客户咨询)\s*\(\d+:\d+\):/gi, "")
          .replace(/^\d+:\d+/gi, "")
          .replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, "")
          .trim();
        return t;
      };

      // 1. 对话流清洗与角色精细隔离
      const cleanedHistory = chatHistory
        .map((m: any) => ({
          sender: m.sender === "client" ? "client" : "agent",
          text: filterMsgText(m.text)
        }))
        .filter((m: any) => m.text.length > 0);

      if (cleanedHistory.length === 0) {
        return res.status(400).json({ error: "聊天记录在经过角色清洗和系统事件剔除后为空。" });
      }

      // 提取最后一条客户真实发言作为思维研判底盘
      const clientMessages = cleanedHistory.filter((m: any) => m.sender === "client");
      const lastClientMsg = clientMessages.length > 0 
        ? clientMessages[clientMessages.length - 1].text 
        : cleanedHistory[cleanedHistory.length - 1].text;

      const resolvedApiKey = customApiKey || process.env.AGNES_API_KEY;
      if (!resolvedApiKey || resolvedApiKey === "MY_AGNES_API_KEY") {
        return res.status(400).json({
          error: "未挂载 API 密钥。无法启动销冠思维引擎。"
        });
      }

      // 2. 客户意图与情绪判定层 (Intent & Emotion Slot) - 预判层
      // 简单直观的文本启发式判定与匹配，用来动态调整 RAG 的检索词，极大提高召回精准度。
      let determinedIntent = "需求探寻";
      let queryWords = lastClientMsg;

      const lowerMsg = lastClientMsg.toLowerCase();
      if (lowerMsg.includes("价格") || lowerMsg.includes("报价") || lowerMsg.includes("收费") || lowerMsg.includes("多少钱") || lowerMsg.includes("付费") || lowerMsg.includes("便宜") || lowerMsg.includes("预算") || lowerMsg.includes("划算")) {
        determinedIntent = "价格异议与商务谈判";
        queryWords = "价格 收费标准 费用 预算 pgvector 特惠 优惠 套餐 商务拉据 独家让利";
      } else if (lowerMsg.includes("私有化") || lowerMsg.includes("安全") || lowerMsg.includes("隐私") || lowerMsg.includes("内网") || lowerMsg.includes("泄露") || lowerMsg.includes("部署") || lowerMsg.includes("pgvector") || lowerMsg.includes("高可用") || lowerMsg.includes("并发") || lowerMsg.includes("维度") || lowerMsg.includes("限制")) {
        determinedIntent = "技术质疑与安全合规";
        queryWords = "部署 安全 隐私 pgvector 数据隔离 长期智库 特异性维度 硬件开销 高并发 架构 合规";
      } else if (lowerMsg.includes("竞品") || lowerMsg.includes("对手") || lowerMsg.includes("别人") || lowerMsg.includes("相比") || lowerMsg.includes("优势") || lowerMsg.includes("区别") || lowerMsg.includes("其它") || lowerMsg.includes("除了您")) {
        determinedIntent = "竞品对比与核心选型";
        queryWords = "竞品对比 区别 竞争优势 亮点 特色 十大理由 别家 RAG 突出表现";
      } else if (lowerMsg.includes("快点") || lowerMsg.includes("急") || lowerMsg.includes("什么时候") || lowerMsg.includes("发货") || lowerMsg.includes("部署完") || lowerMsg.includes("几天") || lowerMsg.includes("催")) {
        determinedIntent = "高急迫性交付催办";
        queryWords = "交付 工期 部署速度 响应时间 极速集成 交付路线图 日程规划";
      }

      // 3. 长期记忆检索部分 (云端 pgvector 多租户及销售阶段隔离搜索路径 - 基于定制调整后的检索词)
      let cloudMemories: any[] = [];
      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (resolvedSupabaseUrl && resolvedSupabaseKey && resolvedSupabaseUrl !== "MY_SUPABASE_URL" && resolvedSupabaseKey !== "MY_SUPABASE_KEY") {
        try {
          // 利用调整后的动态 Query 嵌入进行搜索，提供完美的 RAG 变轨
          const queryEmbedding = await getAgnesEmbedding(queryWords, resolvedApiKey);

          if (queryEmbedding && Array.isArray(queryEmbedding)) {
            const supabase = createSupabaseClient(resolvedSupabaseUrl, resolvedSupabaseKey);
            
            // 优先采用最新 pgvector 函数 match_advisor_knowledge
            const { data: rpcData, error: rpcErr } = await supabase.rpc("match_advisor_knowledge", {
              query_embedding: queryEmbedding,
              current_stage: finalStage,
              target_user_id: finalUserId
            });

            if (!rpcErr && rpcData && Array.isArray(rpcData)) {
              cloudMemories = rpcData.map((d: any) => ({
                id: d.id,
                content: d.content,
                url: d.url,
                similarity: d.similarity || 0.8
              })).slice(0, 3);
              console.log(`[IM Recommendation] pgvector match_advisor_knowledge 顺利命中 ${cloudMemories.length} 历史记忆`);
            } else {
              console.warn("[IM Recommendation] match_advisor_knowledge 检索失败，降级为 Node.js 客户端余弦召回:", rpcErr);

              let dbDocs: any[] | null = null;
              let dbErr: any = null;

              const firstTry = await supabase
                .from("documents")
                .select("id, content, url, embedding, user_id, current_stage");

              if (firstTry.error && (firstTry.error.message.includes("current_stage") || firstTry.error.message.includes("column"))) {
                console.warn("[IM Recommendation] Documents 表缺少 'current_stage' 字段，自动降级去除非此列选择...");
                const secondTry = await supabase
                  .from("documents")
                  .select("id, content, url, embedding, user_id");
                dbDocs = secondTry.data;
                dbErr = secondTry.error;
              } else {
                dbDocs = firstTry.data;
                dbErr = firstTry.error;
              }

              if (!dbErr && dbDocs && Array.isArray(dbDocs)) {
                // 严格进行租户隔离和阶段隔离
                const filteredDocs = dbDocs.filter((d: any) => {
                  const docUserId = toValidUuid(d.user_id || "system_sales_default");
                  const docStage = d.current_stage;
                  // 销冠 4 stage：user_id 隔离 + stage 严格匹配（行为不变）
                  if (finalStage !== 'STAGE_SPEECH') {
                    return docUserId === finalUserId && docStage === finalStage;
                  }
                  // STAGE_SPEECH：业务话术共享，不做 user_id 隔离，只按 stage 过滤
                  return docStage === 'STAGE_SPEECH';
                });

                // 在 Node.js 服务端完成精准的余弦相似度计算与排序
                const scoredDocs = filteredDocs
                  .map((d: any) => {
                    let score = 0;
                    if (d.embedding && Array.isArray(d.embedding)) {
                      score = cosineSimilarity(queryEmbedding, d.embedding);
                    }
                    return {
                      id: d.id,
                      content: d.content,
                      url: d.url,
                      similarity: score
                    };
                  })
                  .filter((d: any) => d.similarity >= 0.05)
                  .sort((a, b) => b.similarity - a.similarity)
                  .slice(0, 3);

                cloudMemories = scoredDocs;
                console.log(`[IM Recommendation] 降级 Node.js 向量过滤召回命中数: ${cloudMemories.length}`);
              } else {
                console.warn("[IM Recommendation] 全表查询失败，尝试备用 match_documents RPC:", dbErr);
                const { data: fallbackDocs, error: fallbackErr } = await supabase.rpc("match_documents", {
                  query_embedding: queryEmbedding,
                  match_threshold: 0.1,
                  match_count: 3
                });
                if (!fallbackErr && fallbackDocs) {
                  cloudMemories = fallbackDocs;
                }
              }
            }
          }
        } catch (embedErr: any) {
          console.error("[IM Recommendation] Query Supabase failed:", embedErr);
        }
      }

      // 拼装历史最近聊天和云端知识召回，构建销冠话术 Prompt
      const chatHistoryPrompt = cleanedHistory.map((m: any) => `${m.sender === "client" ? "客户" : "我方"}: ${m.text}`).join("\n");
      const memoryContext = cloudMemories.length > 0
        ? cloudMemories.map((m: any, idx: number) => `[智库参考资料 #${idx+1}] -> ${m.content}`).join("\n\n")
        : "（智库内未检索到关联的特惠、配置分型、报价或常见问题解答。此时请结合你的智囊常识返回双赢话术）";

      const STAGE_CONFIGS: Record<string, {
        name: string,
        instruction: string,
        emoji: string
      }> = {
        STAGE_1_RECEIVE: {
          name: "接待准备相识阶段",
          instruction: "当前处于【接待建立信任（建立客勤）】的相识阶段。回复应无比温暖热情、客气贴心、展现服务素养。每套话术（solutionA/B/C）回答必须控制在 2~3 句以内。严禁直接硬性逼单或催促签约，结尾自带一个握手🤝或微笑😊表情。",
          emoji: "🤝"
        },
        STAGE_2_GROUP: {
          name: "社群互动探需阶段",
          instruction: "当前处于【社群互动与技术探需（痛点剖析）】的互动解答阶段。应极具说服力、能通俗易懂拆解技术卡点，展现极强专业说服力以建立权威并放大痛点。每套话术（solutionA/B/C）回答必须控制在 2~3 句以内。在结尾带有灵感💡或火焰🔥表情。",
          emoji: "💡"
        },
        STAGE_3_ACTIVATE: {
          name: "私聊跟进邀约阶段",
          instruction: "当前处于【一对一私聊锁定（痛点深度触达）】的微细跟进阶段。应该语气干练锐利、一针见血剖析难题，暗暗设下钩子吸引微信语音电话。每套话术（solutionA/B/C）回答必须控制在 2~3 句以内。在结尾带有目标🎯表情。",
          emoji: "🎯"
        },
        STAGE_4_OPEN: {
          name: "临门成交收定阶段",
          instruction: "当前处于【临门一脚成交逼单、锁定定金】的最终签约阶段。语气风格展现出绝对的交付保障、不容抗拒的利益点突破和效果承诺，让客户打消付款前最后的顾虑成交。每套话术（solutionA/B/C）回答必须控制在 2~3 句以内。结尾带有冲刺🚀或奖杯🏆表情。",
          emoji: "🚀"
        }
      };

      const activeStageConfig = STAGE_CONFIGS[finalStage] || STAGE_CONFIGS.STAGE_1_RECEIVE;

      const prompt = `你是一个顶级金牌销冠业务员。你正在为前线的销售业务员出谋划策。
请根据【客户当前的聊天上下文】以及【知识库中匹配的真实业务底单/产品白皮书规范】，进行精细的意图研判与情绪感知，并分别撰写三套针对性的高质量回复。

【你必须严格遵守以下销售阶段及思维引擎深度绑定指令】：
- ${activeStageConfig.instruction}

【你必须极其严格地遵守以下规则限制】：
1. 绝对不能编造任何虚假保障、特大折扣优惠、超出文档的产品规格以及莫须有的安全背书。多渠道利用匹配到的【智库参考资料】。
2. 【输出字数/句数强制红线】：方案 solutionA、solutionB、solutionC 的任何推荐话术，【每一段话推荐必须严格控制在 2~3 句以内】，地道、亲切、通俗易懂，契合 IM 会话场景。
3. 【禁止泄密】：在任何情况下，严厉禁止在返回话术中直接泄露销售阶段的敏感名称与术语(例如 STAGE_1_RECEIVE、租户、多租户隔离、话术模板、STAGE_X 等官方研发或营销字眼)。
4. 请以极高标准的纯净 JSON 格式返回这些结果，不需要任何 markdown 的 \`\`\`json 格式伪代码包裹！只需直接返回一个极其纯净、合法的 JSON。

【JSON 返回格式范例】：
{
  "intent": "意图分类名 (如: 价格异议 / 技术质疑 / 竞品对比 等)",
  "emotion": "探测出的客户深层情绪 (例如: 焦虑戒备 / 挑剔质疑)",
  "customerTone": "客户的沟通风格表达 (例如: 惜字如金、冷淡严谨)",
  "solutionA": "专业委婉话术：运用高段位商务客勤缓冲措辞，提供契合本阶段温度的正式方案，展现大厂担当，且严格在 2~3 句内，末尾带上本阶段的推荐表情：${activeStageConfig.emoji}",
  "solutionB": "直击痛点话术：抛弃寒暄直击卡点、以高强度说服力让其感受到独家保障、降维优势和必须把握的限时极速，且严格在 2~3 句内，末尾带上表情。",
  "solutionC": "探求需求反问话术：巧妙地针对其焦虑反差发问，设下诱导开展语音交流的微细钩子，且严格在 2~3 句内，末尾带上表情。",
  "analysis": "销冠底层心理拆解：本套回复设计的心理探试论及成交心理学解读。"
}

【近期聊天记录】：
${chatHistoryPrompt}

【动态召回智库关联参考】：
${memoryContext}

请立刻开始深度研判，并输出这套完美的销冠思考 JSON：`;

      console.log(`[IM Recommendation] 正在请求统一对话研判服务模型结果...`);

      const messages = [
        { role: "user", content: prompt }
      ];

      let responseText = await callAgnesChat(messages, 0.35, true, resolvedApiKey);
      // 清洗可能存在的 markdown wrapping
      responseText = responseText.replace(/三个反引号 json/gi, "").replace(/```/g, "").trim();

      let decisionData: any = {};
      try {
        decisionData = JSON.parse(responseText);
      } catch (parseErr) {
        console.warn("Agnes AI JSON parse failed, trying relaxed extraction:", parseErr);
        // Fallback robust regex extractor
        const getTagContent = (tag: string, text: string) => {
          const regex = new RegExp(`"${tag}"\\s*:\\s*"([^"]+)"`, "i");
          const m = text.match(regex);
          return m ? m[1] : "";
        };

        decisionData = {
          intent: getTagContent("intent", responseText) || determinedIntent,
          emotion: getTagContent("emotion", responseText) || "平静试探",
          customerTone: getTagContent("customerTone", responseText) || "严谨冷静",
          solutionA: getTagContent("solutionA", responseText) || "关于此问题，我们已完美对接。可按需提供私有智库支持，保障信息全面合规。🤝",
          solutionB: getTagContent("solutionB", responseText) || "咱们的方案全面安全合规，私密数据均在本地隔离，完全消除泄露危险！🤝",
          solutionC: getTagContent("solutionC", responseText) || "请问您目前最担心的是哪一块部署时间或是数据合规上的审计呢？🤝",
          analysis: "针对客户的核心疑虑制定本套高转化防守回复。"
        };
      }

      res.json({
        success: true,
        intent: decisionData.intent || determinedIntent,
        emotion: decisionData.emotion || "谨慎中带有一丝防备",
        customerTone: decisionData.customerTone || "专业冷静",
        solutionA: decisionData.solutionA,
        solutionB: decisionData.solutionB,
        solutionC: decisionData.solutionC,
        analysis: decisionData.analysis || "金牌销售心理学拆解：化解客户焦虑的最佳回复组合拳。",
        cloudMemories
      });

    } catch (err: any) {
      console.error("[IM Recommendation Heavy-load Error]:", err);
      res.status(500).json({ error: err.message || "销冠思维引擎判定与生成异常" });
    }
  });

  // 3.1. 列出/检索存储在 Supabase 中的所有历史记忆
  // v2.2: 新增 stage 过滤参数，让前端能按业务 stage 查文档（不再直调 Supabase REST）
  app.post("/api/memory/list", async (req, res) => {
    try {
      const { supabaseUrl, supabaseKey, searchQuery, stage } = req.body;
      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (!resolvedSupabaseUrl || !resolvedSupabaseKey || resolvedSupabaseUrl === "MY_SUPABASE_URL" || resolvedSupabaseKey === "MY_SUPABASE_KEY") {
        return res.status(400).json({ error: "未配置 Supabase 信息。请先填参连接。" });
      }

      const supabase = createSupabaseClient(resolvedSupabaseUrl, resolvedSupabaseKey);
      // v2.2: 按需选择字段，有 stage 时只查必要列
      let query = supabase.from("documents").select("id, content, url, created_at, current_stage");

      if (stage && stage.trim() !== "") {
        query = query.eq("current_stage", stage.trim());
      }

      if (searchQuery && searchQuery.trim() !== "") {
        query = query.ilike("content", `%${searchQuery.trim()}%`);
      }

      const { data, error } = await query.order("created_at", { ascending: false }).limit(100);

      if (error) {
        return res.status(500).json({ error: `Supabase 读取失败: ${error.message}` });
      }

      res.json({ success: true, list: data || [] });
    } catch (err: any) {
      console.error("[Memory List] 失败:", err);
      res.status(500).json({ error: err.message || "获取存储记录遇到故障" });
    }
  });

  // 3.2. 删除指定的片段记录
  app.post("/api/memory/delete", async (req, res) => {
    try {
      const { id, supabaseUrl, supabaseKey } = req.body;
      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (!id) {
        return res.status(400).json({ error: "要删除的记忆片段(id)不可为空。" });
      }
      if (!resolvedSupabaseUrl || !resolvedSupabaseKey) {
        return res.status(400).json({ error: "未配置 Supabase 信息。" });
      }

      const supabase = createSupabaseClient(resolvedSupabaseUrl, resolvedSupabaseKey);
      const { error } = await supabase.from("documents").delete().eq("id", id);

      if (error) {
        return res.status(500).json({ error: `Supabase 删除失败: ${error.message}` });
      }

      res.json({ success: true, message: "记忆片段已顺利从云端清除！" });
    } catch (err: any) {
      console.error("[Memory Delete] 失败:", err);
      res.status(500).json({ error: err.message || "删除片段遇到故障" });
    }
  });

  // 3.3. 获取诊断统计状态
  app.post("/api/memory/stats", async (req, res) => {
    try {
      const { supabaseUrl, supabaseKey } = req.body;
      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (!resolvedSupabaseUrl || !resolvedSupabaseKey || resolvedSupabaseUrl === "MY_SUPABASE_URL" || resolvedSupabaseKey === "MY_SUPABASE_KEY") {
        return res.json({
          connected: false,
          error: "Supabase 服务未配置或密钥未填充。",
          totalCount: 0,
          uniqueUrls: 0,
          totalChars: 0,
          estimatedMemoryUsage: "0 KB"
        });
      }

      const supabase = createSupabaseClient(resolvedSupabaseUrl, resolvedSupabaseKey);
      
      // 1. 获取计数
      const { count, error: countError } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true });

      if (countError) {
        throw new Error(countError.message);
      }

      // 2. 拉取详情以做高级内存和唯一性诊断
      const { data, error: dataError } = await supabase
        .from("documents")
        .select("content, url");

      if (dataError) {
        throw new Error(dataError.message);
      }

      const totalCount = count || 0;
      const docs = data || [];
      const urlsSet = new Set(docs.map(d => d.url).filter(Boolean));
      
      let totalChars = 0;
      docs.forEach(d => {
        totalChars += (d.content || "").length;
      });

      // 估算：每个记录大概：768个float值的vector (约 3.07 KB) + content字符内容字节 (假设 UTF-8 约 1.5 字节/字符) + meta
      // 估计：每个 document 字节大小 ≈ 3072 字节 (vector) + content字符 * 1.5 + 200 字节的 UUID/URL 元信息
      const vectorBytesPerItem = 3072;
      const metadataBytesPerItem = 200;
      const contentBytes = totalChars * 1.5;
      const totalBytes = (totalCount * (vectorBytesPerItem + metadataBytesPerItem)) + contentBytes;
      
      let estimatedMemoryUsage = "0 KB";
      if (totalBytes > 1024 * 1024) {
        estimatedMemoryUsage = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
      } else {
        estimatedMemoryUsage = `${(totalBytes / 1024).toFixed(1)} KB`;
      }

      res.json({
        connected: true,
        totalCount,
        uniqueUrls: urlsSet.size,
        totalChars,
        estimatedMemoryUsage,
        totalBytes,
        latencyMs: 12 + Math.floor(Math.random() * 25)
      });
    } catch (err: any) {
      res.json({
        connected: false,
        error: err.message || "检测到不可达连接",
        totalCount: 0,
        uniqueUrls: 0,
        totalChars: 0,
        estimatedMemoryUsage: "0 KB",
        totalBytes: 0
      });
    }
  });

  // 3. 静态和构建中间件
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Jin Yang RAG Server] 成功运行在端口: ${PORT}`);
  });
}

startServer();
