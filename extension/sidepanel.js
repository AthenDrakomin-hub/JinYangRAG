/**
 * Jin Yang RAG - Chrome Side Panel Script
 * 负责从 activeTab 提取真实网页的 innerText，并在浏览器本地沙盒中完成余弦相似度 RAG 召回，
 * 其后请求后台端点(Agnes AI)获取智能问答。
 */

let webpageChunks = [];
let webpageInfo = { title: "", url: "", content: "" };
let chatHistory = [];
let chatSessions = [];
let memoryItems = [];
let cloudMemoryItems = [];
// v2.2: Google Drive 已删除
const STORAGE_KEY_SESSIONS = "jinYang_chat_sessions";
const STORAGE_KEY_MEMORIES = "jinYang_memory_items";
// v2.2: Supabase 配置已删除（全部走后端环境变量）
const LEGACY_STORAGE_KEY_SESSIONS = "sp_chat_sessions";
const LEGACY_STORAGE_KEY_MEMORIES = "sp_memory_items";
let defaultApiUrl = "https://jinyangrag-production.up.railway.app/api/rag"; // 默认切换为你最新部署的 Railway 后端

// 初始化 UI
document.addEventListener("DOMContentLoaded", async () => {
  setupStorageDefaults();
  loadExtensionState();
  
  // 核心：触发当前活动网页信息的自动提取
  await extractAndProcessActivePage();
  // v2.0 话术生成模块初始化
  initSpeechUI();
  loadSpeechDocStatus();
  setupUIEventHandlers();
  // 默认激活"智能问答"tab（4 个 panel 都 hidden，靠 JS 强制显示 chat）
  switchTab("chat");
});

// 1. 设置存储默认值
async function setupStorageDefaults() {
  const fillSettings = (result = {}) => {
    // v2.2: apiUrl/apiKey/Google/Supabase 设置项已删除（全部走后端环境变量）
    if (result.userId) {
      document.getElementById("setting-user-id").value = result.userId;
    } else {
      document.getElementById("setting-user-id").value = "system_sales_default";
    }
    if (result.currentStage) {
      document.getElementById("current-stage-selector").value = result.currentStage;
    } else {
      document.getElementById("current-stage-selector").value = "STAGE_1_RECEIVE";
    }
  };

  const fallbackValues = {
    apiUrl: localStorage.getItem("apiUrl"),
    apiKey: localStorage.getItem("apiKey"),
    // v2.2: Google 配置已删除
    // v2.2: Supabase 配置已删除
    userId: localStorage.getItem("userId"),
    currentStage: localStorage.getItem("currentStage")
  };

  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["userId"], (result) => {
      if (result && Object.keys(result).length) {
        fillSettings(result);
      } else {
        fillSettings(fallbackValues);
      }
    });
  } else {
    fillSettings(fallbackValues);
  }
}

function loadExtensionState() {
  try {
    const storedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS) || localStorage.getItem(LEGACY_STORAGE_KEY_SESSIONS);
    const storedMemories = localStorage.getItem(STORAGE_KEY_MEMORIES) || localStorage.getItem(LEGACY_STORAGE_KEY_MEMORIES);
    chatSessions = storedSessions ? JSON.parse(storedSessions) : [];
    memoryItems = storedMemories ? JSON.parse(storedMemories) : [];
    renderSessions();
    renderMemories();
    fetchCloudMemories();
  } catch (err) {
    console.warn("加载扩展历史数据失败：", err);
  }
}

async function getExtensionSettings() {
  if (typeof chrome !== "undefined" && chrome.storage) {
    return await new Promise((resolve) => {
      chrome.storage.local.get(["userId"], (result) => {
        resolve(result || {});
      });
    });
  }

  return {
    apiUrl: localStorage.getItem("apiUrl"),
    apiKey: localStorage.getItem("apiKey"),
    // v2.2: Google 配置已删除
    // v2.2: Supabase 配置已删除
    userId: localStorage.getItem("userId"),
    currentStage: localStorage.getItem("currentStage")
  };
}

function buildBackendEndpoint(apiUrl, routeSuffix) {
  try {
    const url = new URL(apiUrl);
    let pathname = url.pathname.replace(/\/api\/rag\/?$/, "");
    pathname = pathname.replace(/\/$/, "");
    url.pathname = `${pathname}/${routeSuffix}`;
    return url.toString();
  } catch (err) {
    return `${apiUrl.replace(/\/$/, "")}/${routeSuffix}`;
  }
}


async function extractAndProcessActivePage() {
  const webpageNameEl = document.getElementById("webpage-name");
  const welcomeBox = document.getElementById("welcome-box");
  const chunkCountEl = document.getElementById("chunk-count");

  webpageNameEl.textContent = "正在连接 Content Script 提取文本...";
  
  if (typeof chrome === "undefined" || !chrome.tabs) {
    // 兼容普通网页静态测试模式：使用模拟文本
    console.log("检测到未处于 Chrome Extension 环境下运行，已自动载入模拟测试文章数据。");
    webpageInfo = {
      title: "关于人工智能大语言模型的 RAG(检索增强生成) 架构指南",
      url: "https://example.com/rag-guide",
      content: `这篇指南介绍了 RAG (Retrieval-Augmented Generation) 的核心知识。
RAG，即检索增强生成，是一种结合了信息检索和生成模型的技术。它通过检索外部知识库中的相关片段，为语言模型提供更加准确、实时的上下文，从而极大程度减轻模型的“幻觉”现象。
RAG 的工作流一般分为四个阶段：
1. 准备/索引阶段：对外部源数据进行清洗，将其切割为 300 到 500 字的语义片段(Chunks)。随后，可以利用嵌入模型将这些片段转换为连续稠密的实数矩阵(Vector embeddings)，并加载进向量数据库中。
2. 检索阶段：当用户提出某项具体的疑问时，系统利用同样的 Embedding 算法转换疑问句。随后在向量数据库中，使用余弦相似度(Cosine Similarity)或欧几里得距离来寻找相似度最高的 Top K 个知识片段。
3. 提示词拼接阶段：将用户的问题、以及检索出的 Top K 条知识片段按照模板拼接在一起。例如“背景知识：[知识片段]。请根据背景知识，回答问题：[用户问题]。”
4. 推理阶段：把拼接好的高质量提示词喂给像 Agnes AI 这样优质的大模型，此时模型能获取极度可靠的实时参考，仅依赖已有事实提供准确无误的回复。`
    };
    buildLocalChunksAndTriggerUI();
    return;
  }

  try {
    // 获取当活动标签页
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // 主动消费可能的 lastError（chrome:// 页面下 query 会触发）
      if (chrome.runtime.lastError) {
        const errMsg = String(chrome.runtime.lastError.message || "");
        webpageNameEl.textContent = errMsg.includes("chrome://")
          ? "提示: 请切换到普通网页后再使用本扩展。"
          : "无法访问当前标签页";
        return;
      }
      const activeTab = tabs[0];
      if (!activeTab) {
        webpageNameEl.textContent = "未找到活动标签页";
        return;
      }

      // 如果是 Chrome 系统标签页，则无法注入脚本
      if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://") || activeTab.url.startsWith("about:"))) {
        webpageNameEl.textContent = "提示: 请切换到普通网页后再使用本扩展。";
        return;
      }

      // 向 content script 发送消息
      chrome.tabs.sendMessage(activeTab.id, { action: "extractText" }, (response) => {
        if (chrome.runtime.lastError) {
          // 如果 content script 未加载（例如页面刚刚刷新），我们可以主动注入它
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ["content.js"]
          }, () => {
            // 消费 executeScript 可能的 lastError
            if (chrome.runtime.lastError) {
              webpageNameEl.textContent = "提示: 该页面不支持扩展注入，请切换到普通网页。";
              return;
            }
            // 重新尝试发送
            chrome.tabs.sendMessage(activeTab.id, { action: "extractText" }, (retryResponse) => {
              if (retryResponse && retryResponse.success) {
                webpageInfo = {
                  title: retryResponse.title,
                  url: retryResponse.url,
                  content: retryResponse.content
                };
                buildLocalChunksAndTriggerUI();
              } else {
                webpageNameEl.textContent = "提示: 请刷新当前网页后再试。";
              }
            });
          });
        } else if (response && response.success) {
          webpageInfo = {
            title: response.title,
            url: response.url,
            content: response.content
          };
          buildLocalChunksAndTriggerUI();
        } else {
          webpageNameEl.textContent = "提取失败: " + (response ? response.error : "未知错误");
        }
      });
    });
  } catch (err) {
    webpageNameEl.textContent = "错误: " + err.message;
  }
}

// 4. 将提取到的文本通过 RAG Engine 进行本地切块
function buildLocalChunksAndTriggerUI() {
  const webpageNameEl = document.getElementById("webpage-name");
  const welcomeBox = document.getElementById("welcome-box");
  const chunkCountEl = document.getElementById("chunk-count");

  // 使用在 window.SiteRAGEngine 下导出的 chunkText 函数
  if (window.SiteRAGEngine) {
    webpageChunks = window.SiteRAGEngine.chunkText(webpageInfo.content, 450, 100);
  } else {
    // 降级基础实现
    webpageChunks = [{ id: "chunk-0", index: 0, text: webpageInfo.content, charStart: 0, charEnd: webpageInfo.content.length }];
  }

  // 刷新状态与界面
  webpageNameEl.textContent = webpageInfo.title || "活动标签页";
  webpageNameEl.title = webpageInfo.url;
  
  if (chunkCountEl) {
    chunkCountEl.textContent = webpageChunks.length.toString();
  }
  
  console.log(`本地切片构建完毕，共 ${webpageChunks.length} 个断片。`, webpageChunks);
}

// 5. 提问响应与本地余弦检索核心流
async function handleUserQuestion(query) {
  const chatHistoryDiv = document.getElementById("chat-history");
  
  // 移除欢迎盒
  const welcomeBox = document.getElementById("welcome-box");
  if (welcomeBox) welcomeBox.remove();

  // 添加用户提问泡泡
  appendMessageBubble("user", query);

  // 本地检索最相关的 Top 3 段落
  let matchedSources = [];
  if (window.SiteRAGEngine && webpageChunks.length > 0) {
    matchedSources = window.SiteRAGEngine.searchSimilarChunks(query, webpageChunks, 3);
  }
  
  console.log("Cosine Similarity 检索出最相关的 Top3 资源:", matchedSources);

  // 添加机器人加载中泡泡
  const loadingBubbleId = appendLoadingBubble();
  
  try {
    // 获取配置的 API 接口主机
    let apiUrl = "https://jinyangrag-production.up.railway.app/api/rag";
    let customApiKey = "";
    let userId = "system_sales_default";
    let currentStage = "STAGE_1_RECEIVE";
    
    if (typeof chrome !== "undefined" && chrome.storage) {
      const settings = await new Promise((resolve) => {
        chrome.storage.local.get(["apiUrl", "apiKey", "userId", "currentStage"], (res) => resolve(res));
      });
      if (settings.apiUrl) apiUrl = settings.apiUrl;
      if (settings.apiKey) customApiKey = settings.apiKey;
      if (settings.userId) userId = settings.userId;
      if (settings.currentStage) currentStage = settings.currentStage;
    } else {
      apiUrl = `${window.location.origin}/api/rag`;
    }

    // 拼装上下文
    const contextContent = matchedSources.length > 0
      ? matchedSources.map((s, index) => `[网页段落 #${index+1} / 排名第 ${s.rank}，相关分: ${s.score}]:\n${s.chunk.text}`).join("\n\n")
      : "（当前网页未找到匹配内容或无内容）";

    // 准备发送到服务端的 Payload
    const payload = {
      query: query,
      context: contextContent,
      customApiKey: customApiKey || undefined,
      user_id: userId,
      current_stage: currentStage
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    // 解析状态
    removeBubble(loadingBubbleId);
    
    if (!response.ok) {
      const errText = await response.text();
      appendMessageBubble("ai", `大模型通信异常：当前提供的本地后台服务器未启动或连接受阻 (${response.status})。请检查您的扩展设置中的 API 地址。`, []);
      return;
    }

    const data = await response.json();
    const answer = data.answer || "抱歉，没有获得任何回复内容。";
    
    // 渲染完美的 AI 泡泡
    appendMessageBubble("ai", answer, matchedSources);

    persistSession(query, answer);

    if (matchedSources && matchedSources.length) {
      persistMemory(query, answer, matchedSources);
    }
  } catch (error) {
    console.error("问答异常:", error);
    removeBubble(loadingBubbleId);
    appendMessageBubble("ai", `请求遭遇网络阻碍：${error.message}。由于安全跨域政策限制，如果部署在沙箱外，请先确保本站点 API 可以被调用。`, []);
  }
}

// 辅助方法：添加消息气泡
function appendMessageBubble(sender, text, sources = []) {
  const chatHistoryDiv = document.getElementById("chat-history");
  const bubble = document.createElement("div");
  bubble.className = `message-bubble ${sender}`;

  const senderLabel = document.createElement("span");
  senderLabel.className = "message-sender";
  senderLabel.textContent = sender === "user" ? "您提问" : "Agnes AI 助手";
  bubble.appendChild(senderLabel);

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  
  // 简易 Markdown 或者换行渲染器
  contentDiv.innerHTML = formatMarkdown(text);
  bubble.appendChild(contentDiv);

  // 如果有可靠来源
  if (sources && sources.length > 0) {
    const sourcesDiv = document.createElement("div");
    sourcesDiv.className = "sources-container";
    
    const sHeader = document.createElement("span");
    sHeader.className = "sources-header";
    sHeader.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> 本地检索检索到最相关的 3 个段落：`;
    sourcesDiv.appendChild(sHeader);

    sources.forEach((s) => {
      const sItem = document.createElement("div");
      sItem.className = "source-item";
      sItem.title = s.chunk.text; // 悬停显示完整文本
      sItem.innerHTML = `<span class="source-tag">#${s.rank} - Score: ${s.score}</span> ${truncateText(s.chunk.text, 80)}`;
      sourcesDiv.appendChild(sItem);
    });

    bubble.appendChild(sourcesDiv);
  }

  chatHistoryDiv.appendChild(bubble);
  chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
}

// 辅助：添加加载态气泡
function appendLoadingBubble() {
  const chatHistoryDiv = document.getElementById("chat-history");
  const bubbleId = "loading-" + Date.now();
  
  const bubble = document.createElement("div");
  bubble.className = "message-bubble ai";
  bubble.id = bubbleId;

  const senderLabel = document.createElement("span");
  senderLabel.className = "message-sender";
  senderLabel.textContent = "Agnes AI正在计算回复...";
  bubble.appendChild(senderLabel);

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  bubble.appendChild(contentDiv);
  
  chatHistoryDiv.appendChild(bubble);
  chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
  return bubbleId;
}

function removeBubble(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// 文本截断
function truncateText(str, maxLen = 60) {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + "...";
}

// 基础 Markdown 解析（支持粗体、列表、换行）
function formatMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 1. 拆分块，处理两格星号粗体 **text**
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // 2. 处理单格星号 *text*
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // 3. 处理代码块 `code`
  html = html.replace(/`(.*?)`/g, "<code style='background:#f4f4f5; padding:2px 4px; border-radius:3px; font-family:monospace; font-size:12px;'>$1</code>");

  // 4. 处理换行
  html = html.replace(/\n/g, "<br>");

  return html;
}
// ========================================================================
// v2.0 群活跃话术生成模块（STAGE_SPEECH）
// 核心：主人输入主需求 → 后端从 Supabase 文档自动识别（场景/角色/节奏/禁词/案例）→ 多 agent 协作生成
// 主人手动复制到群（不做 fillToInput）
// ========================================================================

const SPEECH_STAGE = "STAGE_SPEECH";
// 注意：Supabase documents.user_id 是 uuid 类型，必须传 UUID
// 这里用 server.ts toValidUuid('speech_default') 算出来的固定 UUID，前后端一致
const SPEECH_DEFAULT_USER = "341c83e4-64f7-3f89-c375-e4c2242a572b";
let lastSpeechQuery = "";

function initSpeechUI() {
  const countInput = document.getElementById("speech-count");
  const countLabel = document.getElementById("speech-count-label");
  if (countInput && countLabel) {
    countInput.addEventListener("input", () => {
      countLabel.textContent = countInput.value;
    });
  }

  const form = document.getElementById("speech-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      generateSpeech(false);
    });
  }

  const regenBtn = document.getElementById("speech-regenerate-btn");
  if (regenBtn) {
    regenBtn.addEventListener("click", () => generateSpeech(true));
  }

  const copyAllBtn = document.getElementById("speech-copy-all-btn");
  if (copyAllBtn) {
    copyAllBtn.addEventListener("click", copyAllSpeech);
  }

  const refreshDocsBtn = document.getElementById("speech-refresh-docs-btn");
  if (refreshDocsBtn) {
    refreshDocsBtn.addEventListener("click", loadSpeechDocStatus);
  }

  // v2.2: 上传业务文档到 Supabase（走后端 API）
  const uploadDocBtn = document.getElementById("upload-doc-btn");
  if (uploadDocBtn) {
    uploadDocBtn.addEventListener("click", async () => {
      const fileInput = document.getElementById("upload-doc-input");
      const stageSelect = document.getElementById("upload-stage-select");
      const statusEl = document.getElementById("upload-status");
      const file = fileInput && fileInput.files[0];
      if (!file) {
        statusEl.textContent = "⚠️ 请先选一个 .txt 或 .md 文件";
        statusEl.style.color = "#ef4444";
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        statusEl.textContent = "⚠️ 文件太大（>5MB），请拆分后重试";
        statusEl.style.color = "#ef4444";
        return;
      }
      uploadDocBtn.disabled = true;
      uploadDocBtn.textContent = "上传中...";
      statusEl.textContent = "⏳ 正在读取文件并计算 Embedding...";
      statusEl.style.color = "var(--text-secondary)";
      try {
        const content = await file.text();
        const settings = await getExtensionSettings();
        const apiUrl = settings.apiUrl || defaultApiUrl;
        const userId = settings.userId || "system_sales_default";
        const currentStage = stageSelect.value;
        const endpoint = buildBackendEndpoint(apiUrl, "api/memory/save");
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            user_id: userId,
            current_stage: currentStage
          })
        });
        const ct = res.headers.get("content-type") || "";
        // 关键修复：后端/代理可能在 body 过大或服务异常时返回 HTML，必须先按 content-type 解析
        if (!ct.includes("application/json")) {
          const txt = await res.text();
          statusEl.textContent = `❌ 后端返回非 JSON (HTTP ${res.status})：${txt.slice(0, 120)}`;
          statusEl.style.color = "#ef4444";
          return;
        }
        const data = await res.json();
        if (!res.ok || !data.success) {
          statusEl.textContent = `❌ 失败：${data.error || "未知错误"}`;
          statusEl.style.color = "#ef4444";
          return;
        }
        statusEl.textContent = `✅ 已上传：${file.name} → ${currentStage}（标签：${(data.tags || []).join(", ") || "无"}）`;
        statusEl.style.color = "#10b981";
        fileInput.value = "";
        await fetchCloudMemories();
      } catch (e) {
        statusEl.textContent = `❌ 错误：${e.message}`;
        statusEl.style.color = "#ef4444";
      } finally {
        uploadDocBtn.disabled = false;
        uploadDocBtn.textContent = "上传到 Supabase";
      }
    });
  }
}

async function loadSpeechDocStatus() {
  // v2.2: 走后端 API，不再直调 Supabase REST
  const docText = document.getElementById("speech-doc-text");
  if (!docText) return;
  docText.textContent = "正在检测 Supabase 群运营文档…";

  const settings = await getExtensionSettings();
  const apiUrl = settings.apiUrl || defaultApiUrl;
  const endpoint = buildBackendEndpoint(apiUrl, "api/memory/list");

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "STAGE_SPEECH" })
    });
    if (!resp.ok) {
      docText.textContent = `文档拉取失败 (${resp.status})，后端未配置 Supabase`;
      return;
    }
    const data = await resp.json();
    const docs = (data && data.list) || [];
    if (!docs.length) {
      docText.textContent = "尚未上传群运营文档（请到记忆库 tab 上传 .txt/.md，或在 Supabase Studio 手动插入）";
      return;
    }
    docText.textContent = `已加载 ${docs.length} 份群运营文档，工具将自动识别场景/角色/节奏/禁词/案例`;
  } catch (err) {
    docText.textContent = "文档状态读取异常: " + (err && err.message ? err.message : err);
  }
}

// v2.2: readSpeechSettings 简化，只保留 userId（其他配置全走后端环境变量）
function readSpeechSettings() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(["userId"], (res) => {
        resolve({ userId: res.userId || SPEECH_DEFAULT_USER });
      });
    } else {
      resolve({ userId: SPEECH_DEFAULT_USER });
    }
  });
}

async function generateSpeech(isRegen) {
  const input = document.getElementById("speech-input");
  const countInput = document.getElementById("speech-count");
  const genBtn = document.getElementById("speech-generate-btn");
  const regenBtn = document.getElementById("speech-regenerate-btn");
  const copyAllBtn = document.getElementById("speech-copy-all-btn");
  const results = document.getElementById("speech-results");

  if (!input || !countInput || !genBtn) return;

  const query = (input.value || "").trim();
  if (!query) {
    input.focus();
    return;
  }
  if (!isRegen) {
    lastSpeechQuery = query;
  } else if (!lastSpeechQuery) {
    lastSpeechQuery = query;
  }

  const count = parseInt(countInput.value, 10) || 8;
  const { userId } = await readSpeechSettings();
  // v2.2: supabase 配置走后端环境变量；API URL 用 defaultApiUrl
  const apiUrl = defaultApiUrl;
  const apiKey = undefined;

  if (!apiUrl) {
    renderSpeechError("未配置 API 地址，请先在设置里填 API URL");
    return;
  }

  genBtn.disabled = true;
  genBtn.textContent = "生成中…";
  if (regenBtn) regenBtn.disabled = true;

  const finalQuery = `${lastSpeechQuery}\n【本场生成条数】${count}`;

  const payload = {
    query: finalQuery,
    context: "（话术生成模式：场景/角色/节奏/禁词/案例由后端从 Supabase 业务文档自动识别）",
    customApiKey: apiKey || undefined,
    user_id: userId,
    current_stage: SPEECH_STAGE,
    speech_count: count
  };

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const t = await resp.text();
      renderSpeechError("后端通信失败：" + t.slice(0, 200));
      return;
    }
    const data = await resp.json();
    const answer = (data && data.answer) || "";
    if (!answer) {
      renderSpeechError("后端未返回内容");
      return;
    }
    const lines = parseSpeechLines(answer);
    if (!lines.length) {
      renderSpeechError("未能解析出 [角色] 内容，可能识别失败。原始输出：" + answer.slice(0, 300));
      return;
    }
    window.__lastSpeechLines = lines;
    renderSpeechResults(lines, data);
    if (regenBtn) regenBtn.style.display = "inline-block";
    if (copyAllBtn) copyAllBtn.style.display = "inline-block";
  } catch (err) {
    renderSpeechError("请求异常：" + (err && err.message ? err.message : err));
  } finally {
    genBtn.disabled = false;
    genBtn.textContent = "生成话术";
    if (regenBtn) regenBtn.disabled = false;
  }
}

function parseSpeechLines(text) {
  const lines = [];
  const regex = /^\s*\[([^\]]+)\]\s*(.+?)$/gm;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const role = m[1].trim();
    const content = m[2].trim();
    if (role && content) {
      lines.push({ role, content });
    }
  }
  return lines;
}

function renderSpeechResults(lines, rawData) {
  const results = document.getElementById("speech-results");
  if (!results) return;
  results.innerHTML = "";

  const meta = document.createElement("div");
  meta.style.cssText = "font-size:11px; color:var(--text-secondary); padding: 6px 0; display:flex; justify-content:space-between; align-items:center;";
  const stageTag = (rawData && rawData.stage) || SPEECH_STAGE;
  meta.innerHTML = `<span>共 ${lines.length} 条 / 已识别 ${new Set(lines.map(l => l.role)).size} 个角色</span><span style="font-family:monospace; font-size:10px;">${stageTag}</span>`;
  results.appendChild(meta);

  const grouped = {};
  lines.forEach((l, i) => {
    if (!grouped[l.role]) grouped[l.role] = [];
    grouped[l.role].push({ idx: i, content: l.content });
  });
  Object.keys(grouped).forEach((role) => {
    const roleHeader = document.createElement("div");
    roleHeader.style.cssText = "font-size:11px; font-weight:600; color: var(--accent-color); margin: 8px 0 4px 0; padding: 4px 0; border-bottom: 1px solid var(--border-color);";
    roleHeader.textContent = `${role} · ${grouped[role].length} 条`;
    results.appendChild(roleHeader);

    grouped[role].forEach((it) => {
      const card = document.createElement("div");
      card.className = "speech-item";
      card.style.cssText = "background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 10px; margin-bottom: 4px; font-size: 12px; line-height: 1.5; display:flex; align-items:flex-start; gap:8px;";
      card.innerHTML = `
        <span style="flex:1; color: var(--text-primary);">${escapeHtml(it.content)}</span>
        <button class="btn-icon speech-copy-btn" data-idx="${it.idx}" title="复制本条" style="width:22px; height:22px; flex:0 0 22px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      `;
      results.appendChild(card);
    });
  });

  results.querySelectorAll(".speech-copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      copySpeechLine(idx);
    });
  });
}

function renderSpeechError(msg) {
  const results = document.getElementById("speech-results");
  if (!results) return;
  results.innerHTML = `<div class="panel-empty" style="color:#f87171;">${escapeHtml(msg)}</div>`;
}

function copySpeechLine(idx) {
  const lines = window.__lastSpeechLines || [];
  const target = lines[idx];
  if (!target) return;
  copyToClipboard(`[${target.role}] ${target.content}`);
}

function copyAllSpeech() {
  const lines = window.__lastSpeechLines || [];
  if (!lines.length) return;
  const text = lines.map(l => `[${l.role}] ${l.content}`).join("\n");
  copyToClipboard(text);
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flashCopyOk, () => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed; top:-1000px; left:0;";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); flashCopyOk(); } catch (e) {}
  document.body.removeChild(ta);
}

function flashCopyOk() {
  const tip = document.createElement("div");
  tip.textContent = "✓ 已复制";
  tip.style.cssText = "position:fixed; top:12px; right:12px; z-index:9999; background-color: var(--accent-color); color: #0f172a; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: var(--radius-sm); box-shadow: 0 2px 6px rgba(0,0,0,0.3);";
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 1200);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// v2.2.4: 从 popup.js 复制的 5 个函数（sidepanel 缺这些导致卡死）
function saveExtensionState() {
  const sessionData = JSON.stringify(chatSessions);
  const memoryData = JSON.stringify(memoryItems);
  localStorage.setItem(STORAGE_KEY_SESSIONS, sessionData);
  localStorage.setItem(LEGACY_STORAGE_KEY_SESSIONS, sessionData);
  localStorage.setItem(STORAGE_KEY_MEMORIES, memoryData);
  localStorage.setItem(LEGACY_STORAGE_KEY_MEMORIES, memoryData);
}

function renderSessions() {
  const list = document.getElementById("sessions-list");
  const empty = document.getElementById("sessions-empty");
  if (!list || !empty) return;
  list.innerHTML = "";
  if (!chatSessions || chatSessions.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  chatSessions.forEach((session) => {
    const card = document.createElement("div");
    card.className = "session-card";
    card.innerHTML = `
      <div class="session-card-header">
        <div>
          <div class="session-title">${session.title}</div>
          <div class="session-meta">${new Date(session.createdAt).toLocaleString()}</div>
        </div>
        <button class="btn-secondary session-open-btn" data-id="${session.id}">查看</button>
      </div>
      <div class="session-content hidden">${formatMarkdown(session.answer ? session.answer : "(暂无回答)")}</div>
    `;
    list.appendChild(card);
    const toggleBtn = card.querySelector(".session-open-btn");
    const content = card.querySelector(".session-content");
    if (toggleBtn && content) {
      toggleBtn.addEventListener("click", () => {
        const expanded = content.classList.toggle("hidden");
        toggleBtn.textContent = expanded ? "查看" : "收起";
      });
    }
  });
}

function renderMemories() {
  const list = document.getElementById("memory-list");
  const empty = document.getElementById("memory-empty");
  if (!list || !empty) return;
  list.innerHTML = "";

  const mergedMemories = [];
  const seen = new Set();
  [...cloudMemoryItems, ...memoryItems].forEach((memory) => {
    if (!memory || !memory.id) return;
    if (seen.has(memory.id)) return;
    seen.add(memory.id);
    mergedMemories.push(memory);
  });

  if (mergedMemories.length === 0) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  mergedMemories.forEach((memory) => {
    const card = document.createElement("div");
    card.className = "memory-card";
    card.innerHTML = `
      <div class="memory-card-header">
        <div>
          <div class="memory-title">${memory.title}</div>
          <div class="memory-meta">${new Date(memory.createdAt).toLocaleString()}</div>
        </div>
        <button class="btn-secondary memory-toggle-btn" data-id="${memory.id}">详情</button>
      </div>
      <div class="memory-content hidden">${formatMarkdown(memory.snippet)}</div>
      <div class="memory-source">来源：${memory.source || "当前网页"}</div>
    `;
    list.appendChild(card);
    const toggleBtn = card.querySelector(".memory-toggle-btn");
    const content = card.querySelector(".memory-content");
    if (toggleBtn && content) {
      toggleBtn.addEventListener("click", () => {
        const expanded = content.classList.toggle("hidden");
        toggleBtn.textContent = expanded ? "详情" : "收起";
      });
    }
  });
}

function persistSession(query, answer) {
  const session = {
    id: `sess-${Date.now()}`,
    title: query.length > 40 ? `${query.slice(0, 40)}...` : query,
    createdAt: new Date().toISOString(),
    query,
    answer
  };
  chatSessions.unshift(session);
  if (chatSessions.length > 20) {
    chatSessions = chatSessions.slice(0, 20);
  }
  saveExtensionState();
  renderSessions();
}

function persistMemory(query, answer, sources) {
  const summary = answer.length > 120 ? `${answer.slice(0, 120)}...` : answer;
  const memory = {
    id: `memory-${Date.now()}`,
    title: query.length > 50 ? `${query.slice(0, 50)}...` : query,
    snippet: summary,
    source: sources && sources.length > 0 ? sources[0].chunk.url || "当前网页" : "当前网页",
    createdAt: new Date().toISOString()
  };
  memoryItems.unshift(memory);
  if (memoryItems.length > 30) {
    memoryItems = memoryItems.slice(0, 30);
  }
  saveExtensionState();
  renderMemories();
}

// v2.2.4: fetchCloudMemories 简化版（v2.2 后 Supabase env 在后端，扩展不再传）
async function fetchCloudMemories() {
  try {
    const settings = await getExtensionSettings();
    const apiUrl = settings.apiUrl || defaultApiUrl;
    const memoryEndpoint = buildBackendEndpoint(apiUrl, "api/memory/list");
    const response = await fetch(memoryEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (!response.ok) {
      cloudMemoryItems = [];
      renderMemories();
      return;
    }
    const data = await response.json();
    if (data.success && Array.isArray(data.list)) {
      cloudMemoryItems = data.list.map((item) => ({
        id: item.id ? String(item.id) : `cloud-${Date.now()}-${Math.random()}`,
        title: item.url || `Supabase 记忆 ${new Date(item.created_at || item.createdAt || Date.now()).toLocaleString()}`,
        snippet: item.content ? String(item.content).slice(0, 140) : "(无内容摘要)",
        source: "Supabase",
        createdAt: item.created_at || item.createdAt || new Date().toISOString()
      }));
    } else {
      cloudMemoryItems = [];
    }
  } catch (error) {
    console.warn("获取 Supabase 记忆失败：", error);
    cloudMemoryItems = [];
  }
  renderMemories();
}

// v2.2.4: 完整事件绑定（v2.2 误删，主人要求检查 4 tab）
function setupUIEventHandlers() {
  // ① 设置抽屉开关
  const toggleSettingsBtn = document.getElementById("toggle-settings-btn");
  const settingsPanel = document.getElementById("settings-panel");
  if (toggleSettingsBtn && settingsPanel) {
    toggleSettingsBtn.addEventListener("click", () => {
      const isVisible = settingsPanel.style.display === "flex";
      settingsPanel.style.display = isVisible ? "none" : "flex";
    });
  }

  // ② 阶段选择器
  const stageSelector = document.getElementById("current-stage-selector");
  if (stageSelector) {
    stageSelector.addEventListener("change", (e) => {
      const activeStage = e.target.value;
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ currentStage: activeStage });
      } else {
        localStorage.setItem("currentStage", activeStage);
      }
    });
  }

  // ③ 保存设置（只存 userId，supabase/apiUrl/apiKey 走 v2.2 后端 env）
  const saveSettingsBtn = document.getElementById("save-settings-btn");
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", () => {
      const userIdValue = document.getElementById("setting-user-id").value.trim();
      const stageValue = document.getElementById("current-stage-selector")?.value || "STAGE_1_RECEIVE";
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ userId: userIdValue, currentStage: stageValue }, () => {
          if (settingsPanel) settingsPanel.style.display = "none";
        });
      } else {
        localStorage.setItem("userId", userIdValue);
        localStorage.setItem("currentStage", stageValue);
        if (settingsPanel) settingsPanel.style.display = "none";
      }
    });
  }

  // ④ 刷新提取当前网页
  const refreshPageBtn = document.getElementById("refresh-page-btn");
  if (refreshPageBtn) {
    refreshPageBtn.addEventListener("click", async () => {
      const orig = refreshPageBtn.innerHTML;
      refreshPageBtn.disabled = true;
      refreshPageBtn.innerHTML = "...";
      try {
        await extractAndProcessActivePage();
      } finally {
        refreshPageBtn.disabled = false;
        refreshPageBtn.innerHTML = orig;
      }
    });
  }

  // ⑤ 4 个 tab 切换
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab) switchTab(tab);
    });
  });

  // ⑥ 刷新记忆库
  const refreshMemoryBtn = document.getElementById("refresh-memory-btn");
  if (refreshMemoryBtn) {
    refreshMemoryBtn.addEventListener("click", async () => {
      refreshMemoryBtn.disabled = true;
      const orig = refreshMemoryBtn.textContent;
      refreshMemoryBtn.textContent = "刷新中...";
      try {
        await fetchCloudMemories();
      } finally {
        refreshMemoryBtn.disabled = false;
        refreshMemoryBtn.textContent = orig || "刷新记忆库";
      }
    });
  }

  // ⑦ 清空会话
  const clearSessionsBtn = document.getElementById("clear-sessions-btn");
  if (clearSessionsBtn) {
    clearSessionsBtn.addEventListener("click", () => {
      if (typeof clearSessions === "function") {
        clearSessions();
      } else {
        chatSessions = [];
        saveExtensionState();
        renderSessions();
      }
    });
  }

  // ⑧ 清空记忆库
  const clearMemoryBtn = document.getElementById("clear-memory-btn");
  if (clearMemoryBtn) {
    clearMemoryBtn.addEventListener("click", () => {
      if (typeof clearMemories === "function") {
        clearMemories();
      } else {
        memoryItems = [];
        saveExtensionState();
        renderMemories();
      }
    });
  }

  // ⑨ 清空对话
  const clearChatBtn = document.getElementById("clear-chat-btn");
  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", () => {
      const chatHistoryDiv = document.getElementById("chat-history");
      if (!chatHistoryDiv) return;
      chatHistoryDiv.innerHTML = `
        <div class="welcome-box" id="welcome-box">
          <div class="logo-icon-container large">
            <svg class="jy-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="46" fill="url(#jy-bg-grad)" stroke="url(#jy-mint-grad)" stroke-width="2.5" />
              <circle cx="50" cy="50" r="41" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="3 3" />
              <path d="M 35 32 V 53 A 7 7 0 0 1 28 60 A 7 7 0 0 1 21 53" fill="none" stroke="url(#jy-slate-grad)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M 47 32 L 56 45" fill="none" stroke="url(#jy-mint-grad)" stroke-width="6.5" stroke-linecap="round" />
              <path d="M 65 32 L 56 45 L 70 59" fill="none" stroke="url(#jy-mint-grad)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="75" cy="64" r="6.5" fill="none" stroke="url(#jy-mint-grad)" stroke-width="4.5" />
              <circle cx="75" cy="64" r="2" fill="#fff" filter="url(#jy-glow)" />
            </svg>
          </div>
          <h2 style="margin: 4px 0 0 0; font-size: 15px; font-weight: 600;">欢迎使用 Jin Yang RAG</h2>
          <p>我们已从当前网页提取出能提取的全部正文，并在本地浏览器拆分为 <strong id="chunk-count">${webpageChunks.length}</strong> 个语义分块片段。</p>
          <p style="font-size: 12px;">在下方提问，我们将利用本地相似度计算找出最相关的 Top 3 片段指引 Agnes-2.0-Flash 完成核心双路 RAG 智能问答！</p>
        </div>
      `;
    });
  }

  // ⑩ 智能问答提交表单
  const chatForm = document.getElementById("chat-form");
  if (chatForm) {
    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userInputField = document.getElementById("user-input");
      if (!userInputField) return;
      const query = userInputField.value.trim();
      if (!query) return;
      userInputField.value = "";
      await handleUserQuestion(query);
    });
  }
}

// ⑪ 4 tab 切换
function switchTab(tabName) {
  const tabMap = {
    speech: "speech-panel",
    chat: "chat-panel",
    sessions: "sessions-panel",
    memory: "memory-panel"
  };
  const panelId = tabMap[tabName];
  if (!panelId) return;
  // 隐藏所有 panel
  document.querySelectorAll(".panel-section").forEach((p) => p.classList.add("hidden"));
  // 显示目标 panel
  const target = document.getElementById(panelId);
  if (target) target.classList.remove("hidden");
  // 更新 tab 按钮 active
  document.querySelectorAll(".tab-btn").forEach((b) => {
    if (b.getAttribute("data-tab") === tabName) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });
}
