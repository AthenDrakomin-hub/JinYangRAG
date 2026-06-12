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
const STORAGE_KEY_SESSIONS = "jinYang_chat_sessions";
const STORAGE_KEY_MEMORIES = "jinYang_memory_items";
let defaultApiUrl = "https://jinyangrag-production.up.railway.app/api/rag"; // 默认切换为你最新部署的 Railway 后端

// 初始化 UI
document.addEventListener("DOMContentLoaded", async () => {
  setupStorageDefaults();
  setupUIEventHandlers();
  loadExtensionState();
  
  // 核心：触发当前活动网页信息的自动提取
  await extractAndProcessActivePage();
});

// 1. 设置存储默认值
async function setupStorageDefaults() {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["apiUrl", "apiKey", "userId", "currentStage"], (result) => {
      if (result.apiUrl) {
        document.getElementById("setting-api-url").value = result.apiUrl;
      } else {
        // 如果没有保存过，尝试设置当前运行站点的相对路径或默认主机
        const currentOrigin = window.location.origin;
        const fallbackUrl = currentOrigin.includes("chrome-extension") 
          ? defaultApiUrl 
          : `${currentOrigin}/api/rag`;
        document.getElementById("setting-api-url").value = fallbackUrl;
      }
      if (result.apiKey) {
        document.getElementById("setting-api-key").value = result.apiKey;
      }
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
    });
  }
}

function loadExtensionState() {
  try {
    const storedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
    const storedMemories = localStorage.getItem(STORAGE_KEY_MEMORIES);
    chatSessions = storedSessions ? JSON.parse(storedSessions) : [];
    memoryItems = storedMemories ? JSON.parse(storedMemories) : [];
    renderSessions();
    renderMemories();
  } catch (err) {
    console.warn("加载扩展历史数据失败：", err);
  }
}

function switchTab(tab) {
  const sections = document.querySelectorAll(".panel-section");
  sections.forEach((section) => {
    section.classList.toggle("hidden", section.id !== `${tab}-panel`);
  });
}

function renderSessions() {
  const sessionsList = document.getElementById("sessions-list");
  const sessionsEmpty = document.getElementById("sessions-empty");
  if (!sessionsList || !sessionsEmpty) return;

  sessionsList.innerHTML = "";
  if (!chatSessions.length) {
    sessionsEmpty.classList.remove("hidden");
    return;
  }

  sessionsEmpty.classList.add("hidden");
  chatSessions.slice().reverse().forEach((session) => {
    const item = document.createElement("div");
    item.className = "session-card";
    item.innerHTML = `
      <div class="session-card-header">
        <div>
          <div class="session-title">${session.title}</div>
          <div class="session-meta">${new Date(session.timestamp).toLocaleString()}</div>
        </div>
        <button class="btn-secondary session-toggle-btn" data-id="${session.timestamp}">查看</button>
      </div>
      <div class="session-content hidden">${formatMarkdown(session.answer || "[暂无回答]")}</div>
    `;
    sessionsList.appendChild(item);
    const toggleBtn = item.querySelector(".session-toggle-btn");
    const content = item.querySelector(".session-content");
    if (toggleBtn && content) {
      toggleBtn.addEventListener("click", () => {
        const expanded = content.classList.toggle("hidden");
        toggleBtn.textContent = expanded ? "查看" : "收起";
      });
    }
  });
}

function renderMemories() {
  const memoryList = document.getElementById("memory-list");
  const memoryEmpty = document.getElementById("memory-empty");
  if (!memoryList || !memoryEmpty) return;

  memoryList.innerHTML = "";
  if (!memoryItems.length) {
    memoryEmpty.classList.remove("hidden");
    return;
  }

  memoryEmpty.classList.add("hidden");
  memoryItems.slice().reverse().forEach((memory) => {
    const item = document.createElement("div");
    item.className = "memory-card";
    item.innerHTML = `
      <div class="memory-card-header">
        <div>
          <div class="memory-title">${memory.title}</div>
          <div class="memory-meta">${new Date(memory.timestamp).toLocaleString()} · 来源: ${memory.source || "本地"}</div>
        </div>
        <button class="btn-secondary memory-toggle-btn" data-id="${memory.timestamp}">详情</button>
      </div>
      <div class="memory-content hidden">${formatMarkdown(memory.content)}</div>
    `;
    memoryList.appendChild(item);
    const toggleBtn = item.querySelector(".memory-toggle-btn");
    const content = item.querySelector(".memory-content");
    if (toggleBtn && content) {
      toggleBtn.addEventListener("click", () => {
        const expanded = content.classList.toggle("hidden");
        toggleBtn.textContent = expanded ? "详情" : "收起";
      });
    }
  });
}

function saveExtensionState() {
  localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(chatSessions));
  localStorage.setItem(STORAGE_KEY_MEMORIES, JSON.stringify(memoryItems));
}

function persistSession(session) {
  chatSessions.push(session);
  saveExtensionState();
  renderSessions();
}

function persistMemory(memory) {
  memoryItems.push(memory);
  saveExtensionState();
  renderMemories();
}

function clearSessions() {
  if (!confirm("确定要清空所有会话历史吗？此操作不可恢复。")) return;
  chatSessions = [];
  saveExtensionState();
  renderSessions();
}

function clearMemories() {
  if (!confirm("确定要清空所有记忆库内容吗？此操作不可恢复。")) return;
  memoryItems = [];
  saveExtensionState();
  renderMemories();
}

// 2. 交互节点配置
function setupUIEventHandlers() {
  // 设置面板显示与隐藏
  const toggleSettingsBtn = document.getElementById("toggle-settings-btn");
  const settingsPanel = document.getElementById("settings-panel");
  toggleSettingsBtn.addEventListener("click", () => {
    const isVisible = settingsPanel.style.display === "flex";
    settingsPanel.style.display = isVisible ? "none" : "flex";
  });

  // 阶段选择器变动自动存储
  const stageSelector = document.getElementById("current-stage-selector");
  if (stageSelector) {
    stageSelector.addEventListener("change", (e) => {
      const activeStage = e.target.value;
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ currentStage: activeStage });
      }
    });
  }

  // 保存设置按钮
  const saveSettingsBtn = document.getElementById("save-settings-btn");
  saveSettingsBtn.addEventListener("click", () => {
    const apiUrlValue = document.getElementById("setting-api-url").value.trim();
    const apiKeyValue = document.getElementById("setting-api-key").value.trim();
    const userIdValue = document.getElementById("setting-user-id").value.trim();
    
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ apiUrl: apiUrlValue, apiKey: apiKeyValue, userId: userIdValue }, () => {
        alert("配置已成功保存！");
        settingsPanel.style.display = "none";
      });
    } else {
      alert("本地浏览器存储不可用，配置已暂存内存中");
      settingsPanel.style.display = "none";
    }
  });

  // 刷新提取页按钮
  const refreshPageBtn = document.getElementById("refresh-page-btn");
  refreshPageBtn.addEventListener("click", async () => {
    const origStatus = refreshPageBtn.innerHTML;
    refreshPageBtn.disabled = true;
    refreshPageBtn.innerHTML = "...";
    await extractAndProcessActivePage();
    refreshPageBtn.disabled = false;
    refreshPageBtn.innerHTML = origStatus;
  });

  // 标签页切换
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      switchTab(button.dataset.tab);
    });
  });

  const refreshMemoryBtn = document.getElementById("refresh-memory-btn");
  if (refreshMemoryBtn) {
    refreshMemoryBtn.addEventListener("click", () => {
      loadExtensionState();
    });
  }

  const clearSessionsBtn = document.getElementById("clear-sessions-btn");
  if (clearSessionsBtn) {
    clearSessionsBtn.addEventListener("click", () => {
      clearSessions();
    });
  }

  const clearMemoryBtn = document.getElementById("clear-memory-btn");
  if (clearMemoryBtn) {
    clearMemoryBtn.addEventListener("click", () => {
      clearMemories();
    });
  }

  // 清空对话
  const clearChatBtn = document.getElementById("clear-chat-btn");
  clearChatBtn.addEventListener("click", () => {
    chatHistory = [];
    const chatHistoryDiv = document.getElementById("chat-history");
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
        <p>已经重置问答上下文。你可以再次输入新问题。</p>
        <p>当前页面已切片为 <strong>${webpageChunks.length}</strong> 个片段。</p>
      </div>
    `;
  });

  // 表单提问提交
  const chatForm = document.getElementById("chat-form");
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userInputField = document.getElementById("user-input");
    const query = userInputField.value.trim();
    if (!query) return;

    // 清理输入框
    userInputField.value = "";
    await handleUserQuestion(query);
  });
}

// 3. 提取活动标签页的文本内容并进行切片
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
      const activeTab = tabs[0];
      if (!activeTab) {
        webpageNameEl.textContent = "未找到活动标签页";
        return;
      }

      // 如果是 Chrome 系统标签页，则无法注入脚本
      if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://"))) {
        webpageNameEl.textContent = "无法对浏览器系统页面提取文本";
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

    persistSession({
      title: query,
      answer,
      timestamp: Date.now(),
    });

    if (matchedSources && matchedSources.length) {
      persistMemory({
        title: query,
        content: matchedSources.map((s) => `【${s.rank}】${truncateText(s.chunk.text, 120)}`).join("\n"),
        source: matchedSources[0]?.chunk?.url || webpageInfo.url || "本地",
        timestamp: Date.now(),
      });
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
