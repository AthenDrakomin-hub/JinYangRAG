/**
 * Jin Yang RAG - Chrome Popup Script
 * 负责从 activeTab 提取真实网页的 innerText，并在浏览器本地沙盒中完成余弦相似度 RAG 召回，
 * 其后请求后台端点(Agnes AI)获取智能问答。适用于 Popup 小窗快速问答。
 */

let webpageChunks = [];
let webpageInfo = { title: "", url: "", content: "" };
let chatHistory = [];
let chatSessions = [];
let memoryItems = [];
let cloudMemoryItems = [];
let googleDriveAccessToken = null;
const STORAGE_KEY_SESSIONS = "jinYang_chat_sessions";
const STORAGE_KEY_MEMORIES = "jinYang_memory_items";
const STORAGE_KEY_SUPABASE_URL = "jinYang_supabase_url";
const STORAGE_KEY_SUPABASE_KEY = "jinYang_supabase_key";
const STORAGE_KEY_GOOGLE_CLIENT_ID = "jinYang_google_client_id";
const STORAGE_KEY_GOOGLE_API_KEY = "jinYang_google_api_key";
const STORAGE_KEY_GOOGLE_APP_ID = "jinYang_google_app_id";
const LEGACY_STORAGE_KEY_SESSIONS = "sp_chat_sessions";
const LEGACY_STORAGE_KEY_MEMORIES = "sp_memory_items";
let activeTab = "chat";
let defaultApiUrl = "https://jinyangrag-production.up.railway.app/api/rag"; // 默认切换为你最新部署的 Railway 后端

// 初始化 UI
document.addEventListener("DOMContentLoaded", async () => {
  setupStorageDefaults();
  setupUIEventHandlers();
  loadExtensionState();
  switchTab("chat");
  
  // 核心：触发当前活动网页信息的自动提取
  await extractAndProcessActivePage();
});

// 1. 设置存储默认值
async function setupStorageDefaults() {
  const fillSettings = (result = {}) => {
    if (result.apiUrl) {
      document.getElementById("setting-api-url").value = result.apiUrl;
    } else {
      const currentOrigin = window.location.origin;
      const fallbackUrl = currentOrigin.includes("chrome-extension") 
        ? defaultApiUrl 
        : `${currentOrigin}/api/rag`;
      document.getElementById("setting-api-url").value = fallbackUrl;
    }
    if (result.apiKey) {
      document.getElementById("setting-api-key").value = result.apiKey;
    }
    if (result.googleClientId) {
      document.getElementById("setting-google-client-id").value = result.googleClientId;
    }
    if (result.googleApiKey) {
      document.getElementById("setting-google-api-key").value = result.googleApiKey;
    }
    if (result.googleAppId) {
      document.getElementById("setting-google-app-id").value = result.googleAppId;
    }
    if (result.supabaseUrl) {
      document.getElementById("setting-supabase-url").value = result.supabaseUrl;
    }
    if (result.supabaseKey) {
      document.getElementById("setting-supabase-key").value = result.supabaseKey;
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
  };

  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["apiUrl", "apiKey", "googleClientId", "googleApiKey", "googleAppId", "supabaseUrl", "supabaseKey", "userId", "currentStage"], (result) => {
      if (result && Object.keys(result).length) {
        fillSettings(result);
        return;
      }

      fillSettings({
        apiUrl: localStorage.getItem("apiUrl"),
        apiKey: localStorage.getItem("apiKey"),
        googleClientId: localStorage.getItem(STORAGE_KEY_GOOGLE_CLIENT_ID),
        googleApiKey: localStorage.getItem(STORAGE_KEY_GOOGLE_API_KEY),
        googleAppId: localStorage.getItem(STORAGE_KEY_GOOGLE_APP_ID),
        supabaseUrl: localStorage.getItem(STORAGE_KEY_SUPABASE_URL),
        supabaseKey: localStorage.getItem(STORAGE_KEY_SUPABASE_KEY),
        userId: localStorage.getItem("userId"),
        currentStage: localStorage.getItem("currentStage")
      });
    });
  } else {
    fillSettings({
      apiUrl: localStorage.getItem("apiUrl"),
      apiKey: localStorage.getItem("apiKey"),
      googleClientId: localStorage.getItem(STORAGE_KEY_GOOGLE_CLIENT_ID),
      googleApiKey: localStorage.getItem(STORAGE_KEY_GOOGLE_API_KEY),
      googleAppId: localStorage.getItem(STORAGE_KEY_GOOGLE_APP_ID),
      supabaseUrl: localStorage.getItem(STORAGE_KEY_SUPABASE_URL),
      supabaseKey: localStorage.getItem(STORAGE_KEY_SUPABASE_KEY),
      userId: localStorage.getItem("userId"),
      currentStage: localStorage.getItem("currentStage")
    });
  }
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
    const googleClientIdValue = document.getElementById("setting-google-client-id").value.trim();
    const googleApiKeyValue = document.getElementById("setting-google-api-key").value.trim();
    const googleAppIdValue = document.getElementById("setting-google-app-id").value.trim();
    const supabaseUrlValue = document.getElementById("setting-supabase-url").value.trim();
    const supabaseKeyValue = document.getElementById("setting-supabase-key").value.trim();
    const userIdValue = document.getElementById("setting-user-id").value.trim();
    
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ apiUrl: apiUrlValue, apiKey: apiKeyValue, googleClientId: googleClientIdValue, googleApiKey: googleApiKeyValue, googleAppId: googleAppIdValue, supabaseUrl: supabaseUrlValue, supabaseKey: supabaseKeyValue, userId: userIdValue }, () => {
        alert("配置已成功保存！");
        settingsPanel.style.display = "none";
      });
    } else {
      localStorage.setItem("apiUrl", apiUrlValue);
      localStorage.setItem("apiKey", apiKeyValue);
      localStorage.setItem(STORAGE_KEY_GOOGLE_CLIENT_ID, googleClientIdValue);
      localStorage.setItem(STORAGE_KEY_GOOGLE_API_KEY, googleApiKeyValue);
      localStorage.setItem(STORAGE_KEY_GOOGLE_APP_ID, googleAppIdValue);
      localStorage.setItem(STORAGE_KEY_SUPABASE_URL, supabaseUrlValue);
      localStorage.setItem(STORAGE_KEY_SUPABASE_KEY, supabaseKeyValue);
      localStorage.setItem("userId", userIdValue);
      alert("配置已成功保存！");
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

  // 标签切换
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab) switchTab(tab);
    });
  });

  const refreshMemoryBtn = document.getElementById("refresh-memory-btn");
  if (refreshMemoryBtn) {
    refreshMemoryBtn.addEventListener("click", async () => {
      refreshMemoryBtn.disabled = true;
      refreshMemoryBtn.textContent = "刷新中...";
      await fetchCloudMemories();
      refreshMemoryBtn.disabled = false;
      refreshMemoryBtn.textContent = "刷新记忆库";
      alert("记忆库已刷新。请检查记忆列表。");
    });
  }

  const connectDriveBtn = document.getElementById("connect-drive-btn");
  if (connectDriveBtn) {
    connectDriveBtn.addEventListener("click", async () => {
      connectDriveBtn.disabled = true;
      connectDriveBtn.textContent = "连接中...";
      await handleGoogleDriveConnect();
      connectDriveBtn.disabled = false;
      connectDriveBtn.textContent = "连接 Google Drive";
    });
  }

  const openDrivePickerBtn = document.getElementById("open-drive-picker-btn");
  if (openDrivePickerBtn) {
    openDrivePickerBtn.addEventListener("click", async () => {
      openDrivePickerBtn.disabled = true;
      openDrivePickerBtn.textContent = "打开中...";
      await handleOpenDrivePicker();
      openDrivePickerBtn.disabled = false;
      openDrivePickerBtn.textContent = "从 Drive 导入";
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
        <div class="logo-icon-container medium">
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
        <h2 style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600;">欢迎使用 Jin Yang RAG</h2>
        <p style="font-size: 11px;">已经重置问答上下文。你可以再次输入新问题。</p>
        <p style="font-size: 11px;">当前页面已切片为 <strong>${webpageChunks.length}</strong> 个片段。</p>
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

  webpageNameEl.textContent = "正在提取当前标签页文本...";
  
  if (typeof chrome === "undefined" || !chrome.tabs) {
    // 兼容普通网页静态测试模式
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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab) {
        webpageNameEl.textContent = "未找到活动标签页";
        return;
      }

      if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://"))) {
        webpageNameEl.textContent = "无法对浏览器系统页面提取文本";
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { action: "extractText" }, (response) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ["content.js"]
          }, () => {
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
  const chunkCountEl = document.getElementById("chunk-count");

  if (window.SiteRAGEngine) {
    webpageChunks = window.SiteRAGEngine.chunkText(webpageInfo.content, 450, 100);
  } else {
    webpageChunks = [{ id: "chunk-0", index: 0, text: webpageInfo.content, charStart: 0, charEnd: webpageInfo.content.length }];
  }

  webpageNameEl.textContent = webpageInfo.title || "活动标签页";
  webpageNameEl.title = webpageInfo.url;
  
  if (chunkCountEl) {
    chunkCountEl.textContent = webpageChunks.length.toString();
  }
}

function loadExtensionState() {
  const storedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS) || localStorage.getItem(LEGACY_STORAGE_KEY_SESSIONS);
  if (storedSessions) {
    try {
      chatSessions = JSON.parse(storedSessions);
    } catch (e) {
      chatSessions = [];
    }
  }
  const storedMemories = localStorage.getItem(STORAGE_KEY_MEMORIES) || localStorage.getItem(LEGACY_STORAGE_KEY_MEMORIES);
  if (storedMemories) {
    try {
      memoryItems = JSON.parse(storedMemories);
    } catch (e) {
      memoryItems = [];
    }
  }
  renderSessions();
  renderMemories();
  fetchCloudMemories();
}

async function getExtensionSettings() {
  if (typeof chrome !== "undefined" && chrome.storage) {
    return await new Promise((resolve) => {
      chrome.storage.local.get(["apiUrl", "apiKey", "googleClientId", "googleApiKey", "googleAppId", "supabaseUrl", "supabaseKey", "userId", "currentStage"], (result) => {
        resolve(result || {});
      });
    });
  }

  return {
    apiUrl: localStorage.getItem("apiUrl"),
    apiKey: localStorage.getItem("apiKey"),
    googleClientId: localStorage.getItem(STORAGE_KEY_GOOGLE_CLIENT_ID),
    googleApiKey: localStorage.getItem(STORAGE_KEY_GOOGLE_API_KEY),
    googleAppId: localStorage.getItem(STORAGE_KEY_GOOGLE_APP_ID),
    supabaseUrl: localStorage.getItem(STORAGE_KEY_SUPABASE_URL),
    supabaseKey: localStorage.getItem(STORAGE_KEY_SUPABASE_KEY),
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

async function fetchCloudMemories() {
  const settings = await getExtensionSettings();
  const apiUrl = settings.apiUrl || defaultApiUrl;
  const supabaseUrl = settings.supabaseUrl || localStorage.getItem(STORAGE_KEY_SUPABASE_URL);
  const supabaseKey = settings.supabaseKey || localStorage.getItem(STORAGE_KEY_SUPABASE_KEY);

  if (!supabaseUrl || !supabaseKey) {
    cloudMemoryItems = [];
    renderMemories();
    return;
  }

  const memoryEndpoint = buildBackendEndpoint(apiUrl, "api/memory/list");
  try {
    const response = await fetch(memoryEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supabaseUrl, supabaseKey })
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

function updateDriveStatus(text, isError = false) {
  const statusEl = document.getElementById("drive-status");
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#f87171" : "#9ca3af";
}

function parseUrlFragment(fragment) {
  const params = {};
  const stripped = fragment.startsWith("#") ? fragment.substring(1) : fragment;
  stripped.split("&").forEach((pair) => {
    const [key, value] = pair.split("=");
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || "");
    }
  });
  return params;
}

async function getGoogleDriveToken() {
  if (googleDriveAccessToken) {
    return googleDriveAccessToken;
  }

  const settings = await getExtensionSettings();
  const clientId = settings.googleClientId;
  if (!clientId) {
    throw new Error("请先在设置中填写 Google OAuth 客户端 ID。\n可在 Google Cloud Console 创建一个 OAuth 2.0 Client ID。");
  }

  const redirectUri = chrome.identity.getRedirectURL("google-drive");
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("https://www.googleapis.com/auth/drive.readonly")}&include_granted_scopes=true&prompt=consent`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!redirectUrl) {
        reject(new Error("Google 登录返回结果为空。"));
        return;
      }
      const url = new URL(redirectUrl);
      const params = parseUrlFragment(url.hash);
      if (!params.access_token) {
        reject(new Error("未能获取到 Google 访问令牌，请检查 OAuth 客户端 ID 和授权设置。"));
        return;
      }
      googleDriveAccessToken = params.access_token;
      updateDriveStatus(`Google Drive 已连接 (${new Date().toLocaleTimeString()})`);
      resolve(googleDriveAccessToken);
    });
  });
}

async function loadGooglePicker() {
  if (window.google && window.google.picker) {
    return;
  }

  if (document.getElementById("google-gapi-script")) {
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (window.gapi && window.gapi.load) {
          clearInterval(timer);
          window.gapi.load("picker", {
            callback: () => resolve(undefined),
            onerror: (err) => reject(err)
          });
        }
      }, 100);
      setTimeout(() => {
        clearInterval(timer);
        reject(new Error("加载 Google API 脚本超时。"));
      }, 7000);
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "google-gapi-script";
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      if (!window.gapi) {
        reject(new Error("Google API 脚本未正确加载。"));
        return;
      }
      window.gapi.load("picker", {
        callback: () => resolve(undefined),
        onerror: (err) => reject(new Error("Google Picker 模块加载失败：" + err))
      });
    };
    script.onerror = (err) => reject(new Error("Google API 脚本加载失败：" + err));
    document.body.appendChild(script);
  });
}

async function createDrivePicker(accessToken, onFileSelected) {
  const settings = await getExtensionSettings();
  const developerKey = settings.googleApiKey;
  const appId = settings.googleAppId;

  if (!developerKey || !appId) {
    throw new Error("请先在设置中填写 Google API Key 和 Google Project ID/App ID。" );
  }

  await loadGooglePicker();
  const google = window.google;
  if (!google || !google.picker) {
    throw new Error("Google Picker 未正确初始化。请检查网络并刷新扩展。" );
  }

  const view = new google.picker.View(google.picker.ViewId.DOCS);
  view.setMimeTypes(
    "application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation,application/pdf,text/plain,text/markdown,text/csv,application/octet-stream"
  );

  const picker = new google.picker.PickerBuilder()
    .enableFeature(google.picker.Feature.NAV_HIDDEN)
    .setAppId(appId)
    .setDeveloperKey(developerKey)
    .setOAuthToken(accessToken)
    .addView(view)
    .setCallback((data) => {
      if (data.action === google.picker.Action.PICKED && Array.isArray(data.docs)) {
        data.docs.forEach((doc) => {
          onFileSelected({ id: doc.id, name: doc.name, mimeType: doc.mimeType });
        });
      } else if (data.action === google.picker.Action.CANCEL) {
        updateDriveStatus("Google Drive 导入已取消。", false);
      }
    })
    .build();

  picker.setVisible(true);
}

async function handleGoogleDriveConnect() {
  try {
    updateDriveStatus("正在连接 Google Drive...", false);
    await getGoogleDriveToken();
    updateDriveStatus("Google Drive 已连接。可继续点击“从 Drive 导入”。", false);
  } catch (error) {
    console.error(error);
    updateDriveStatus(`Google Drive 连接失败：${error.message}`, true);
  }
}

async function handleOpenDrivePicker() {
  try {
    const token = await getGoogleDriveToken();
    await createDrivePicker(token, async (file) => {
      updateDriveStatus(`已选择文件：${file.name}，开始导入...`, false);
      await importDriveFile(file);
    });
  } catch (error) {
    console.error(error);
    updateDriveStatus(`打开 Google Picker 失败：${error.message}`, true);
  }
}

async function importDriveFile(file) {
  const settings = await getExtensionSettings();
  const apiUrl = settings.apiUrl || defaultApiUrl;
  const supabaseUrl = settings.supabaseUrl || localStorage.getItem(STORAGE_KEY_SUPABASE_URL);
  const supabaseKey = settings.supabaseKey || localStorage.getItem(STORAGE_KEY_SUPABASE_KEY);
  const userId = settings.userId || "system_sales_default";
  const currentStage = settings.currentStage || "STAGE_1_RECEIVE";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("请先配置 Supabase URL 和 Supabase Key，才能完成 Google Drive 文档导入。" );
  }
  if (!googleDriveAccessToken) {
    throw new Error("当前尚未获取 Google Drive 访问权限，请先点击连接 Google Drive。" );
  }

  const importEndpoint = buildBackendEndpoint(apiUrl, "api/drive/import");
  const response = await fetch(importEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
      accessToken: googleDriveAccessToken,
      supabaseUrl,
      supabaseKey,
      user_id: userId,
      current_stage: currentStage
    })
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || `导入失败，HTTP ${response.status}`);
  }
  updateDriveStatus(`导入成功：${file.name}，共 ${data.importedChunks || 0}/${data.totalChunks || 0} 个片段。`, false);
  await fetchCloudMemories();
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });
  document.querySelectorAll(".panel-section").forEach((section) => {
    section.classList.toggle("hidden", section.id !== `${tab}-panel`);
  });
  if (tab === "sessions") {
    renderSessions();
  }
  if (tab === "memory") {
    renderMemories();
    fetchCloudMemories();
  }
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

function saveExtensionState() {
  const sessionData = JSON.stringify(chatSessions);
  const memoryData = JSON.stringify(memoryItems);
  localStorage.setItem(STORAGE_KEY_SESSIONS, sessionData);
  localStorage.setItem(LEGACY_STORAGE_KEY_SESSIONS, sessionData);
  localStorage.setItem(STORAGE_KEY_MEMORIES, memoryData);
  localStorage.setItem(LEGACY_STORAGE_KEY_MEMORIES, memoryData);
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

// 5. 提问响应与本地余弦检索核心流
async function handleUserQuestion(query) {
  const chatHistoryDiv = document.getElementById("chat-history");
  
  const welcomeBox = document.getElementById("welcome-box");
  if (welcomeBox) welcomeBox.remove();

  appendMessageBubble("user", query);

  let matchedSources = [];
  if (window.SiteRAGEngine && webpageChunks.length > 0) {
    matchedSources = window.SiteRAGEngine.searchSimilarChunks(query, webpageChunks, 3);
  }

  const loadingBubbleId = appendLoadingBubble();
  
  try {
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

    const contextContent = matchedSources.length > 0
      ? matchedSources.map((s, index) => `[网页段落 #${index+1} / 排名第 ${s.rank}，相关分: ${s.score}]:\n${s.chunk.text}`).join("\n\n")
      : "（当前网页未找到匹配内容或无内容）";

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

    removeBubble(loadingBubbleId);
    
    if (!response.ok) {
      appendMessageBubble("ai", `大模型通信异常：当前提供的本地后台服务器未启动 (${response.status})。请检查您的设置中的 API 地址。`, []);
      return;
    }

    const data = await response.json();
    const answer = data.answer || "抱歉，没有获得任何回复内容。";
    
    persistSession(query, answer);
    persistMemory(query, answer, matchedSources);
    appendMessageBubble("ai", answer, matchedSources);
  } catch (error) {
    removeBubble(loadingBubbleId);
    appendMessageBubble("ai", `请求异常: ${error.message}`, []);
  }
}

// 辅助方法：添加消息气泡
function appendMessageBubble(sender, text, sources = []) {
  const chatHistoryDiv = document.getElementById("chat-history");
  const bubble = document.createElement("div");
  bubble.className = `message-bubble ${sender}`;

  const senderLabel = document.createElement("span");
  senderLabel.className = "message-sender";
  senderLabel.textContent = sender === "user" ? "您提问" : "Agnes AI";
  bubble.appendChild(senderLabel);

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.innerHTML = formatMarkdown(text);
  bubble.appendChild(contentDiv);

  if (sources && sources.length > 0) {
    const sourcesDiv = document.createElement("div");
    sourcesDiv.className = "sources-container";
    
    const sHeader = document.createElement("span");
    sHeader.className = "sources-header";
    sHeader.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> 匹配参考 (Top 3)：`;
    sourcesDiv.appendChild(sHeader);

    sources.forEach((s) => {
      const sItem = document.createElement("div");
      sItem.className = "source-item";
      sItem.title = s.chunk.text;
      sItem.innerHTML = `<span class="source-tag">#${s.rank}</span> ${truncateText(s.chunk.text, 50)}`;
      sourcesDiv.appendChild(sItem);
    });

    bubble.appendChild(sourcesDiv);
  }

  chatHistoryDiv.appendChild(bubble);
  chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
}

function appendLoadingBubble() {
  const chatHistoryDiv = document.getElementById("chat-history");
  const bubbleId = "loading-" + Date.now();
  
  const bubble = document.createElement("div");
  bubble.className = "message-bubble ai";
  bubble.id = bubbleId;

  const senderLabel = document.createElement("span");
  senderLabel.className = "message-sender";
  senderLabel.textContent = "Agnes AI 思考中...";
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

function truncateText(str, maxLen = 60) {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + "...";
}

function formatMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/`(.*?)`/g, "<code style='background:#f4f4f5; padding:2px 4px; border-radius:3px; font-family:monospace; font-size:11px;'>$1</code>");
  html = html.replace(/\n/g, "<br>");
  return html;
}
