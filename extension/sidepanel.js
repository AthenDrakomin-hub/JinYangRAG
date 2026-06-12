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
let googleDriveAccessToken = null;
const STORAGE_KEY_SESSIONS = "jinYang_chat_sessions";
const STORAGE_KEY_MEMORIES = "jinYang_memory_items";
const STORAGE_KEY_SUPABASE_URL = "jinYang_supabase_url";
const STORAGE_KEY_SUPABASE_KEY = "jinYang_supabase_key";
const LEGACY_STORAGE_KEY_SESSIONS = "sp_chat_sessions";
const LEGACY_STORAGE_KEY_MEMORIES = "sp_memory_items";
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

  const fallbackValues = {
    apiUrl: localStorage.getItem("apiUrl"),
    apiKey: localStorage.getItem("apiKey"),
    googleClientId: localStorage.getItem("googleClientId"),
    googleApiKey: localStorage.getItem("googleApiKey"),
    googleAppId: localStorage.getItem("googleAppId"),
    supabaseUrl: localStorage.getItem(STORAGE_KEY_SUPABASE_URL),
    supabaseKey: localStorage.getItem(STORAGE_KEY_SUPABASE_KEY),
    userId: localStorage.getItem("userId"),
    currentStage: localStorage.getItem("currentStage")
  };

  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["apiUrl", "apiKey", "googleClientId", "googleApiKey", "googleAppId", "supabaseUrl", "supabaseKey", "userId", "currentStage"], (result) => {
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
      chrome.storage.local.get(["apiUrl", "apiKey", "googleClientId", "googleApiKey", "googleAppId", "supabaseUrl", "supabaseKey", "userId", "currentStage"], (result) => {
        resolve(result || {});
      });
    });
  }

  return {
    apiUrl: localStorage.getItem("apiUrl"),
    apiKey: localStorage.getItem("apiKey"),
    googleClientId: localStorage.getItem("googleClientId"),
    googleApiKey: localStorage.getItem("googleApiKey"),
    googleAppId: localStorage.getItem("googleAppId"),
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

async function fetchGoogleDriveFiles(accessToken) {
  const queryParts = [
    "mimeType = 'application/vnd.google-apps.document'",
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    "mimeType = 'application/vnd.google-apps.presentation'",
    "mimeType = 'application/pdf'",
    "mimeType = 'text/plain'",
    "mimeType = 'text/markdown'",
    "mimeType = 'text/csv'",
    "mimeType = 'application/octet-stream'"
  ];
  const q = `trashed = false and (${queryParts.join(" or ")})`;
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("pageSize", "30");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,size)");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 401) {
    googleDriveAccessToken = null;
    throw new Error("Google Drive 访问令牌已失效，请重新连接。");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`获取 Drive 文件列表失败：${response.status} ${response.statusText} ${text}`);
  }

  const data = await response.json();
  return Array.isArray(data.files) ? data.files : [];
}

function showGoogleDriveFileSelector(files) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("google-drive-file-selector-overlay");
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = "google-drive-file-selector-overlay";
    overlay.style = "position:fixed; inset:0; background: rgba(0,0,0,0.45); z-index:9999; display:flex; align-items:center; justify-content:center; padding:12px;";

    const panel = document.createElement("div");
    panel.style = "width:min(680px,100%); max-height:calc(100vh - 48px); background:#0f172a; border:1px solid #334155; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; color:#e2e8f0; box-shadow:0 20px 50px rgba(0,0,0,0.45);";
    panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:#111827; border-bottom:1px solid #334155;">
        <div>
          <div style="font-size:14px; font-weight:700;">选择要导入的 Google Drive 文件</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:4px;">仅列出最近 30 个非回收站文件，支持文档、表格、幻灯片、PDF、文本等格式。</div>
        </div>
        <button id="google-drive-file-selector-close" style="border:none; background:none; color:#f8fafc; font-size:20px; cursor:pointer;">×</button>
      </div>
      <div id="google-drive-file-selector-list" style="overflow:auto; flex:1; padding:10px; display:grid; gap:8px; background:#0f172a;"></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; background:#111827; border-top:1px solid #334155;">
        <button id="google-drive-file-selector-cancel" style="padding:8px 14px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; cursor:pointer;">取消</button>
      </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const listEl = panel.querySelector("#google-drive-file-selector-list");
    const closeBtn = panel.querySelector("#google-drive-file-selector-close");
    const cancelBtn = panel.querySelector("#google-drive-file-selector-cancel");
    if (!listEl || !closeBtn || !cancelBtn) {
      reject(new Error("Drive 文件选择器初始化失败。"));
      return;
    }

    const cleanup = () => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    };

    const createFileItem = (file, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.style = "text-align:left; width:100%; padding:12px 14px; border:none; border-radius:10px; background:#111827; color:#e2e8f0; cursor:pointer; display:flex; justify-content:space-between; align-items:center; box-shadow: inset 0 0 0 1px rgba(148,163,184,0.08);";
      item.innerHTML = `
        <div style="max-width: calc(100% - 90px);">
          <div style="font-size:13px; font-weight:600;">${index + 1}. ${file.name}</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:4px;">${file.mimeType} · ${file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : "未知修改时间"}</div>
        </div>
        <span style="font-size:11px; color:#7c3aed; margin-left:12px;">选择</span>
      `;
      item.addEventListener("click", () => {
        cleanup();
        resolve(file);
      });
      return item;
    };

    files.forEach((file, index) => listEl.appendChild(createFileItem(file, index)));
    if (files.length === 0) {
      listEl.innerHTML = `<div style="padding:18px; color:#cbd5e1;">未找到可导入的文件。</div>`;
    }

    const onCancel = () => {
      cleanup();
      reject(new Error("已取消 Google Drive 文件选择。"));
    };

    closeBtn.addEventListener("click", onCancel);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        onCancel();
      }
    });
  });
}

async function openGoogleDriveFileBrowser(accessToken) {
  const files = await fetchGoogleDriveFiles(accessToken);
  if (!files.length) {
    throw new Error("未找到可导入的 Google Drive 文件。请确认 Drive 中存在可访问的文档或 PDF。");
  }
  return showGoogleDriveFileSelector(files);
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
    const file = await openGoogleDriveFileBrowser(token);
    updateDriveStatus(`已选择文件：${file.name}，开始导入...`, false);
    await importDriveFile(file);
  } catch (error) {
    console.error(error);
    updateDriveStatus(`从 Google Drive 导入失败：${error.message}`, true);
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
    throw new Error("请先配置 Supabase URL 和 Supabase Key，才能完成 Google Drive 文档导入。");
  }
  if (!googleDriveAccessToken) {
    throw new Error("当前尚未获取 Google Drive 访问权限，请先点击连接 Google Drive。");
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

function switchTab(tab) {
  const sections = document.querySelectorAll(".panel-section");
  sections.forEach((section) => {
    section.classList.toggle("hidden", section.id !== `${tab}-panel`);
  });
  if (tab === "memory") {
    renderMemories();
    fetchCloudMemories();
  }
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

  const mergedMemories = [];
  const seen = new Set();
  [...cloudMemoryItems.slice().reverse(), ...memoryItems.slice().reverse()].forEach((memory) => {
    if (!memory || !memory.id) return;
    if (seen.has(memory.id)) return;
    seen.add(memory.id);
    mergedMemories.push(memory);
  });

  if (mergedMemories.length === 0) {
    memoryEmpty.classList.remove("hidden");
    return;
  }

  memoryEmpty.classList.add("hidden");
  mergedMemories.forEach((memory) => {
    const item = document.createElement("div");
    item.className = "memory-card";
    item.innerHTML = `
      <div class="memory-card-header">
        <div>
          <div class="memory-title">${memory.title}</div>
          <div class="memory-meta">${new Date(memory.timestamp || memory.createdAt).toLocaleString()} · 来源: ${memory.source || "本地"}</div>
        </div>
        <button class="btn-secondary memory-toggle-btn" data-id="${memory.timestamp || memory.id}">详情</button>
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
  const sessionData = JSON.stringify(chatSessions);
  const memoryData = JSON.stringify(memoryItems);
  localStorage.setItem(STORAGE_KEY_SESSIONS, sessionData);
  localStorage.setItem(LEGACY_STORAGE_KEY_SESSIONS, sessionData);
  localStorage.setItem(STORAGE_KEY_MEMORIES, memoryData);
  localStorage.setItem(LEGACY_STORAGE_KEY_MEMORIES, memoryData);
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
    const supabaseUrlValue = document.getElementById("setting-supabase-url").value.trim();
    const supabaseKeyValue = document.getElementById("setting-supabase-key").value.trim();
    const userIdValue = document.getElementById("setting-user-id").value.trim();
    
    const googleClientIdValue = document.getElementById("setting-google-client-id").value.trim();
    const googleApiKeyValue = document.getElementById("setting-google-api-key").value.trim();
    const googleAppIdValue = document.getElementById("setting-google-app-id").value.trim();

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ apiUrl: apiUrlValue, apiKey: apiKeyValue, googleClientId: googleClientIdValue, googleApiKey: googleApiKeyValue, googleAppId: googleAppIdValue, supabaseUrl: supabaseUrlValue, supabaseKey: supabaseKeyValue, userId: userIdValue }, () => {
        alert("配置已成功保存！");
        settingsPanel.style.display = "none";
      });
    } else {
      localStorage.setItem("apiUrl", apiUrlValue);
      localStorage.setItem("apiKey", apiKeyValue);
      localStorage.setItem("googleClientId", googleClientIdValue);
      localStorage.setItem("googleApiKey", googleApiKeyValue);
      localStorage.setItem("googleAppId", googleAppIdValue);
      localStorage.setItem(STORAGE_KEY_SUPABASE_URL, supabaseUrlValue);
      localStorage.setItem(STORAGE_KEY_SUPABASE_KEY, supabaseKeyValue);
      localStorage.setItem("userId", userIdValue);
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
