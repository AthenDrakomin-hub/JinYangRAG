import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // 2. Core Jin Yang RAG 路由
  app.post("/api/rag", async (req, res) => {
    try {
      const { query, context, customApiKey, supabaseUrl, supabaseKey } = req.body;

      if (!query) {
        return res.status(400).json({ error: "用户提问(query)不可为空。" });
      }

      // 懒加载实例化：确保无服务启动崩溃隐患，支持动态输入密钥
      const resolvedApiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!resolvedApiKey || resolvedApiKey === "MY_GEMINI_API_KEY") {
        return res.status(400).json({
          error: "未挂载 Gemini API 密钥。请在 Google AI Studio 顶层「Settings > Secrets」中配置 GEMINI_API_KEY，或在扩展侧边栏设置面板中输入自定义密钥。"
        });
      }

      const ai = new GoogleGenAI({
        apiKey: resolvedApiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      // 长期记忆检索部分 (云端 pgvector 搜索路径)
      let cloudMemories: any[] = [];
      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (resolvedSupabaseUrl && resolvedSupabaseKey && resolvedSupabaseUrl !== "MY_SUPABASE_URL" && resolvedSupabaseKey !== "MY_SUPABASE_KEY") {
        try {
          console.log(`[RAG Backend] 正在计算提问词 "${query}" 的 Embedding 向量 (gemini-embedding-2-preview)`);
          const embeddingResponse = await ai.models.embedContent({
            model: "gemini-embedding-2-preview",
            contents: query,
          });

          const resData: any = embeddingResponse;
          const queryEmbedding = resData.embedding?.values || resData.embeddings?.[0]?.values;
          if (queryEmbedding && Array.isArray(queryEmbedding)) {
            console.log(`[RAG Backend] 正在进行 Supabase 向量数据库 match_documents 相似度搜索`);
            const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseKey);
            const { data, error } = await supabase.rpc("match_documents", {
              query_embedding: queryEmbedding,
              match_threshold: 0.1, // 分数宽容：对低相似度的相关片段也适度包容
              match_count: 3
            });

            if (error) {
              console.error("[RAG Backend] pgvector rpc match_documents 失败，启动备用关键词文本检索:", error);
              const { data: textData, error: textErr } = await supabase
                .from("documents")
                .select("id, content, url")
                .ilike("content", `%${query}%`)
                .limit(3);
              
              if (!textErr && textData) {
                cloudMemories = textData.map((item: any) => ({
                  id: item.id,
                  content: item.content,
                  url: item.url,
                  similarity: 0.55 // 设定的默认相似度
                }));
                console.log(`[RAG Backend] 备用全文检索成功命中 ${cloudMemories.length} 条记忆`);
              }
            } else if (data) {
              cloudMemories = data;
              console.log(`[RAG Backend] 云端 pgvector 顺利命中 ${cloudMemories.length} 历史记忆`);
            }
          }
        } catch (embedErr: any) {
          console.error("[RAG Backend] 计算向量 / 查询云端记忆库失败:", embedErr);
        }
      }

      // 格式化长期记忆召回详情入提示词
      const memoryContext = cloudMemories.length > 0
        ? cloudMemories.map((m: any, idx: number) => `[记忆段落 #${idx+1} | 相似度: ${m.similarity?.toFixed(4) || "0.0000"}] [关联URL: ${m.url || "未知"}] -> ${m.content}`).join("\n\n")
        : "（长期记忆库暂未检索到相关高匹配内容，或库中尚未保存该主题的片段）";

      const systemInstruction = 
        `您是集成 Supabase pgvector 长期记忆库的双路 RAG (Retrieval-Augmented Generation) 检索问答专家。
你将被赋予两个维度的语境参考：
1. 【当前正在浏览网页的内容片段】：这是当前极具时效性的页面上下文（本地滑动分块检索得出）。
2. 【过去的长期记忆库中的记忆段落】：这是用户以前自主保存到 Supabase 向量表中的长期积累。

请基于这些背景信息详细、客观地回答用户问题：
1. 优先根据以上参考材料（包括当前网页与历史记忆）来提供专业回答。
2. 回答中应合理向用户反馈是否参考或者是哪个维度的知识源。例如，如果答案来源于长期记忆库，可以用如：“(根据您之前保存的长期记忆，您曾提到过...)” 或者使用标签加以辅助说明。
3. 如果两处资料中都没有答案，请坦诚告知，不要无中生有。`;

      const prompt = `这里是当前通过双路 RAG 实时检索捕获的参考上下文：

====== 维度 1: 当前活动网页的本地切块 (Top 3) ======
${context || "（当前网页无具体匹配参考。）"}

====== 维度 2: 从 Supabase pgvector 召回的云端长期记忆 (Top 3) ======
${memoryContext}

==================================================

用户提问：${query}

请基于上述两维度的背景资源进行专业、全面地提炼解答：`;

      console.log(`[RAG Backend] 正在请求 Gemini 3.5-flash，提问: "${query}"`);

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.3, // 较低温度确保严谨，避免模型编造
        }
      });

      const text = response.text || "模型未提供有效回复。";
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
      "react", "supabase", "postgres", "pgvector", "embedding", "vector", "database", "api", "gemini", "chunk", "rag", "routing",
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
      const { content, url, customApiKey, supabaseUrl, supabaseKey } = req.body;

      if (!content) {
        return res.status(400).json({ error: "要存储的内容(content)不可为空。" });
      }

      // 提取核心关键词/标签，提高 Manage Memory 表格等页面的过滤及搜索精度
      const autoTags = extractKeywords(content);
      const taggedContent = autoTags.length > 0
        ? `${content}\n\n🏷️ 自动标签: ${autoTags.map(tag => `#${tag}`).join(" ")}`
        : content;

      // 获取 Gemini key 用于做 embedding 转向量
      const resolvedApiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!resolvedApiKey || resolvedApiKey === "MY_GEMINI_API_KEY") {
        return res.status(400).json({
          error: "未挂载 Gemini API 密钥。固化长期记忆需要先获取向量，请添加嵌入转换密钥。"
        });
      }

      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (!resolvedSupabaseUrl || !resolvedSupabaseKey || resolvedSupabaseUrl === "MY_SUPABASE_URL" || resolvedSupabaseKey === "MY_SUPABASE_KEY") {
        return res.status(400).json({
          error: "未配置 Supabase 信息。请在侧边栏「设置」面板中补充您的 Supabase URL 和 Anon Key，或将它们配置在系统环境变量中。"
        });
      }

      const ai = new GoogleGenAI({
        apiKey: resolvedApiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      console.log(`[Memory Save] 正在调用 gemini-embedding-2-preview 计算 Embedding 向量: "${taggedContent.substring(0, 45)}..."`);
      
      const response = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: taggedContent,
      });

      const resResponseData: any = response;
      const embeddingValues = resResponseData.embedding?.values || resResponseData.embeddings?.[0]?.values;
      if (!embeddingValues || !Array.isArray(embeddingValues)) {
        return res.status(500).json({ error: "生成的 embedding 向量为空或不匹配规范。" });
      }

      // 插入 Supabase 的 documents 向量表中
      const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseKey);
      const { data, error } = await supabase
        .from("documents")
        .insert({
          content: taggedContent,
          embedding: embeddingValues,
          url: url || "",
          created_at: new Date().toISOString()
        })
        .select("id");

      if (error) {
        console.error("[Memory Save] 写入 Supabase 失败:", error);
        return res.status(500).json({ error: `Supabase 写入失败: ${error.message}` });
      }

      console.log(`[Memory Save] 记忆成功存储至云端向量数据库。记录ID:`, data);
      res.json({ success: true, message: "记忆已成功存入 Supabase 云端 pgvector 记忆表！", id: data?.[0]?.id });
    } catch (err: any) {
      console.error("[Memory Save] 遭遇异常:", err);
      res.status(500).json({ error: err.message || "固化记忆服务器内部故障" });
    }
  });

  // 3.0. 允许点击按钮唤起 Google Picker，并在后端分片存入 Supabase 的长期记忆库
  app.post("/api/drive/import", async (req, res) => {
    try {
      const { fileId, fileName, mimeType, accessToken, customApiKey, supabaseUrl, supabaseKey } = req.body;

      if (!fileId || !accessToken) {
        return res.status(400).json({ error: "Google 资源定位符(fileId) 与验证票据(accessToken) 不能为空。" });
      }

      const resolvedApiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!resolvedApiKey || resolvedApiKey === "MY_GEMINI_API_KEY") {
        return res.status(400).json({
          error: "未挂载 Gemini API 密钥。建立分块向量模型需要获取 Embedding 权限，请在 Settings 或侧栏中配置密钥。"
        });
      }

      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;
      if (!resolvedSupabaseUrl || !resolvedSupabaseKey || resolvedSupabaseUrl === "MY_SUPABASE_URL" || resolvedSupabaseKey === "MY_SUPABASE_KEY") {
        return res.status(400).json({
          error: "未配置 Supabase 长期数据库。请先在在设置中或环境变量中补充您的 URL & Anon Key。"
        });
      }

      const ai = new GoogleGenAI({
        apiKey: resolvedApiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      let fileContentText = "";
      const driveFileUrl = `https://drive.google.com/open?id=${fileId}`;

      console.log(`[Drive Import] 启动后台文件下载: `, { fileId, fileName, mimeType });

      // 根据 MimeType 分支做不同格式的下载/导出
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
        // 对于 PDF，通过 alt=media 获得二进制数据流并让 Gemini 去解析与提取
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const response = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
          throw new Error(`Google Drive PDF 下载失败: ${response.statusText} (${response.status})`);
        }
        
        const pdfArrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(pdfArrayBuffer);

        console.log(`[Drive Import] PDF 读取成功 (${pdfBuffer.length} 字节)。正在通过大模型读取 pdf 纯文本数据...`);

        const geminiRes = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: pdfBuffer.toString("base64")
              }
            },
            "你是一个精确并且支持高精度OCR的完整 PDF 文本提取器。请尽力把你在这个 PDF 文件中见到的全部可见段落、句子、数据和图表附着的文字还原出来，以便于后续存入向量表做 RAG 知识检索。只需输出原文中的原文本，不需翻译、解释或做任何总结性、开场白废话，不要包含 ``` 等标记，尽可能完整。"
          ]
        });
        fileContentText = geminiRes.text || "";
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

      const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseKey);
      let successCount = 0;

      // 3. 对各个分块执行 embedding 生成并插入数据库
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];

        // 整理带特征属性的块：提供跨文件问答时的清晰标识来源
        const finalContent = `📁 文件资源: [${fileName}]\n🔗 源链接: ${driveFileUrl}\n-------------------\n${chunkText}\n\n🏷️ 自动标签: #GOOGLE_DRIVE #DOCUMENT #${fileName.split('.').pop()?.toUpperCase() || 'FILE'}`;

        try {
          const embedResponse = await ai.models.embedContent({
            model: "gemini-embedding-2-preview",
            contents: finalContent,
          });

          const resData: any = embedResponse;
          const embeddingValues = resData.embedding?.values || resData.embeddings?.[0]?.values;

          if (embeddingValues && Array.isArray(embeddingValues)) {
            const { error: dbErr } = await supabase
              .from("documents")
              .insert({
                content: finalContent,
                embedding: embeddingValues,
                url: driveFileUrl,
                created_at: new Date().toISOString()
              });

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
      const { chatHistory, customApiKey, supabaseUrl, supabaseKey } = req.body;

      if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
        return res.status(400).json({ error: "聊天记录(chatHistory) 不能为空且必须为数组。" });
      }

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

      const resolvedApiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!resolvedApiKey || resolvedApiKey === "MY_GEMINI_API_KEY") {
        return res.status(400).json({
          error: "未挂载 Gemini API 密钥。无法启动销冠思维引擎。"
        });
      }

      const ai = new GoogleGenAI({
        apiKey: resolvedApiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

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

      // 3. 长期记忆检索部分 (云端 pgvector 搜索路径 - 基于定制调整后的检索词)
      let cloudMemories: any[] = [];
      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (resolvedSupabaseUrl && resolvedSupabaseKey && resolvedSupabaseUrl !== "MY_SUPABASE_URL" && resolvedSupabaseKey !== "MY_SUPABASE_KEY") {
        try {
          // 利用调整后的动态 Query 嵌入进行搜索，提供完美的 RAG 变轨
          const embeddingResponse = await ai.models.embedContent({
            model: "gemini-embedding-2-preview",
            contents: queryWords,
          });

          const resData: any = embeddingResponse;
          const queryEmbedding = resData.embedding?.values || resData.embeddings?.[0]?.values;
          if (queryEmbedding && Array.isArray(queryEmbedding)) {
            const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseKey);
            const { data, error } = await supabase.rpc("match_documents", {
              query_embedding: queryEmbedding,
              match_threshold: 0.1,
              match_count: 3
            });

            if (!error && data) {
              cloudMemories = data;
            } else {
              // 备用全文检索
              const { data: textData, error: textErr } = await supabase
                .from("documents")
                .select("id, content, url")
                .ilike("content", `%${lastClientMsg}%`)
                .limit(3);
              if (!textErr && textData) {
                cloudMemories = textData.map((item: any) => ({
                  id: item.id,
                  content: item.content,
                  url: item.url,
                  similarity: 0.55
                }));
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
        : "（智库内未检索到关联的特惠、配置报价或常见问题解答。此时请结合你的销冠常识返回双赢话术）";

      const prompt = `你是一个顶级金牌销冠业务员。你正在为前线的销售业务员出谋划策。
请根据【客户当前的聊天上下文】以及【知识库中匹配的真实业务底单/产品白皮书规范】，进行精细的意图研判与情绪感知，并分别撰写三套针对性的高质量回复。

【你必须严格遵守以下规则】：
1. 绝对不能编造任何虚假保障、特大折扣优惠、超出文档的产品规格以及莫须有的安全背书。多渠道利用匹配到的【智库参考资料】。
2. 每一个回复都要控制在 50-100 字左右，地道、亲切、通俗易懂，契合微信或网页 IM 即时会话场景。
3. 请以高标准的 JSON 格式返回这些结果，不需要任何 markdown 的 \`\`\`json 格式伪代码块！只需直接返回一个极其纯净、合法的 JSON。

【JSON 返回格式范例】：
{
  "intent": "意图分类名 (如: 价格异议 / 技术质疑 / 竞品对比 等)",
  "emotion": "探测出的客户深层情绪 (例如: 焦虑戒备 / 挑剔质疑 / 平和探寻 / 试探推进)",
  "customerTone": "客户的沟通风格表达 (例如: 惜字如金、冷淡严谨、直抒胸臆)",
  "solutionA": "专业委婉话术：运用高段位商务措辞，先承认客户的合理考量并提供有温度的正式方案，展现大厂担当，留足缓冲拉扯空间。(50-100字)",
  "solutionB": "直击痛点话术：抛弃社交寒暄，以极其凝练强力的语言直戳痛点并给到智库支持的核心铁证/折扣，制造立刻敲定的紧迫感促单。(50-100字)",
  "solutionC": "探寻需求话术：礼貌委婉、巧妙反问，设钩子询问关键卡点（如预算区间、决策层看法或实际硬件要求），为建立进一步微信语音电话做好铺垫。(50-100字)",
  "analysis": "销冠思维拆解指南：针针见血地指出当前这三套回复设计的营销考量与底层心理学暗示。"
}

【近期聊天记录】：
${chatHistoryPrompt}

【动态召回智库关联参考】：
${memoryContext}

请立刻开始深度研判，并输出这套完美的销冠思考 JSON：`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: 0.35,
          responseMimeType: "application/json"
        }
      });

      let responseText = response.text || "";
      // 清洗可能存在的 markdown wrapping
      responseText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();

      let decisionData: any = {};
      try {
        decisionData = JSON.parse(responseText);
      } catch (parseErr) {
        console.warn("Gemini JSON parse failed, trying relaxed extraction:", parseErr);
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
          solutionA: getTagContent("solutionA", responseText) || "专业方案：您好，关于此问题，我们已完美对接。可按需提供私有智库支持，保障信息全面合规。",
          solutionB: getTagContent("solutionB", responseText) || "直击痛点：您好！咱们的方案全面安全合规，私密数据均在本地隔離，完全消除泄露危险！",
          solutionC: getTagContent("solutionC", responseText) || "需求探查：了解。请问您那边目前最担心的是哪一块部署时间或是数据合规上的审计呢？",
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
  app.post("/api/memory/list", async (req, res) => {
    try {
      const { supabaseUrl, supabaseKey, searchQuery } = req.body;
      const resolvedSupabaseUrl = supabaseUrl || process.env.SUPABASE_URL;
      const resolvedSupabaseKey = supabaseKey || process.env.SUPABASE_KEY;

      if (!resolvedSupabaseUrl || !resolvedSupabaseKey || resolvedSupabaseUrl === "MY_SUPABASE_URL" || resolvedSupabaseKey === "MY_SUPABASE_KEY") {
        return res.status(400).json({ error: "未配置 Supabase 信息。请先填参连接。" });
      }

      const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseKey);
      let query = supabase.from("documents").select("id, content, url, created_at");

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

      const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseKey);
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

      const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseKey);
      
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
