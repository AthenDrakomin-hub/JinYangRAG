import React, { useState } from "react";
import JSZip from "jszip";
import { Folder, File, Download, CheckCircle, Info, ExternalLink, HelpCircle, RotateCw } from "lucide-react";

interface ExtensionFile {
  name: string;
  path: string;
  description: string;
  language: string;
  content: string;
}

export default function ExtensionWorkspace() {
  const [selectedFilePath, setSelectedFilePath] = useState<string>("manifest.json");
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  // Chrome 扩展工程所有相关文件的代码硬编码声明（确保 100% 同步和可靠），同时方便 JSZip 瞬时打包
  const [files, setFiles] = useState<ExtensionFile[]>(() => [
    {
      name: "manifest.json",
      path: "manifest.json",
      description: "Chrome 扩展基础配置文件 (Manifest V3)，声明面板权限、背景脚本及内容文本抓取安全策略。",
      language: "json",
      content: `{
  "manifest_version": 3,
  "name": "金阳 RAG v1.0.0",
  "version": "1.0.0",
  "description": "基于 Agnes AI API 的智能网页和长期知识库问答助手，可提取当前活动标签内容，在本地与云端(Supabase pgvector)进行双路 RAG 检索问答。",
  "permissions": [
    "activeTab",
    "sidePanel",
    "scripting",
    "storage"
  ],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "Jin Yang RAG Panel"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["content.js"]
    }
  ]
}
`
    },
    {
      name: "style.css",
      path: "style.css",
      description: "扩展程序公共样式表。基于 Slate & Mint 极简高质感设计系统，完美适配侧边栏面板及 Popup 视窗尺寸规格。",
      language: "css",
      content: `/*
 * Jin Yang RAG - Standard Elegant Stylesheet
 * 提供高质感、现代简约的 Slate & Mint 风格设计。
 */

:root {
  --bg-primary: #fafafa;
  --bg-secondary: #f4f4f5;
  --bg-card: #ffffff;
  --text-primary: #18181b;
  --text-secondary: #71717a;
  --text-placeholder: #a1a1aa;
  --text-link: #10b981;
  --border-color: #e4e4e7;
  --accent-color: #10b981;
  --accent-hover: #059669;
  --accent-light: #ecfdf5;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
}

/* 布局 */
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
}

/* 头部 */
header {
  padding: 16px;
  background-color: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon-container {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-icon-container.large {
  width: 48px;
  height: 48px;
}

.logo-icon-container.medium {
  width: 40px;
  height: 40px;
}

.jy-logo {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 2px 4px rgba(5, 150, 105, 0.15));
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.jy-logo:hover {
  transform: rotate(5deg) scale(1.05);
}

.title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.015em;
  background: linear-gradient(135deg, #0a0a0a 30%, #059669 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
}

.subtitle {
  font-size: 11px;
  color: var(--text-secondary);
  display: block;
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* 按钮样式 */
.btn-icon {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.btn-icon:hover {
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--text-placeholder);
}

.btn-primary {
  background-color: var(--accent-color);
  color: white;
  border: none;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-primary:hover {
  background-color: var(--accent-hover);
}

/* 当前页面状态栏 */
.webpage-indicator {
  padding: 10px 16px;
  background-color: var(--accent-light);
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.indicator-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--accent-color);
}

.page-title {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 聊天历史区域 */
.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.welcome-box {
  background-color: var(--bg-card);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 40px;
}

.welcome-box p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.message-bubble {
  display: flex;
  flex-direction: column;
  max-width: 85%;
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-bubble.user {
  align-self: flex-end;
}

.message-bubble.ai {
  align-self: flex-start;
}

.message-sender {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
  padding: 0 4px;
}

.message-bubble.user .message-sender {
  text-align: right;
}

.message-content {
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  word-wrap: break-word;
}

.message-bubble.user .message-content {
  background-color: var(--text-primary);
  color: #ffffff;
  border-top-right-radius: 2px;
}

.message-bubble.ai .message-content {
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-top-left-radius: 2px;
  box-shadow: var(--shadow-sm);
}

/* 检索片段来源 (Top 3) 在气泡底部的样式 */
.sources-container {
  margin-top: 8px;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sources-header {
  color: var(--text-secondary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.source-item {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: help;
  transition: all 0.2s;
}

.source-item:hover {
  background-color: var(--accent-light);
  border-color: var(--accent-color);
  color: var(--text-primary);
}

.source-tag {
  background-color: var(--accent-color);
  color: white;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: bold;
  margin-right: 4px;
  text-transform: uppercase;
}

/* 页脚 / 输入栏 */
footer {
  padding: 12px 16px;
  background-color: var(--bg-card);
  border-top: 1px solid var(--border-color);
}

.input-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.input-box {
  flex: 1;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-primary);
  resize: none;
  height: 38px;
  box-sizing: border-box;
  font-family: inherit;
  transition: all 0.2s;
}

.input-box:focus {
  outline: none;
  border-color: var(--accent-color);
  background-color: var(--bg-card);
  box-shadow: 0 0 0 2px var(--accent-light);
}

.input-send-btn {
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s;
}

.input-send-btn:hover {
  background-color: var(--accent-hover);
}

.input-send-btn:disabled {
  background-color: var(--border-color);
  cursor: not-allowed;
}

/* 加载动画 */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  background-color: var(--text-secondary);
  border-radius: 50%;
  animation: typingBounce 1s infinite alternate;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typingBounce {
  from { transform: translateY(0); opacity: 0.4; }
  to { transform: translateY(-4px); opacity: 1; }
}

/* 提示配置气泡 */
.settings-panel {
  padding: 16px;
  background-color: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  display: none; /* 默认隐藏 */
  flex-direction: column;
  gap: 12px;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.settings-input {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 12px;
  font-family: monospace;
}
`
    },
    {
      name: "rag-engine.js",
      path: "rag-engine.js",
      description: "纯轻量级客户端 RAG 核心匹配逻辑。实现高性能滑动文本切块 (Chunking)、中文 Bi-Gram / 英文词汇分词、及纯 CPU 余弦夹角相似度排序，无需依赖昂贵的外部 Python 服务或数据库。",
      language: "javascript",
      content: `/**
 * Jin Yang RAG - Client-side RAG Core Engine
 * 提供轻量级的本地切片 (Chunking) 与余弦相似度 (Cosine Similarity) 匹配逻辑。
 * 支持中文和英文的优良分词/字符 n-gram 处理。
 */

/**
 * 文本切片 (Chunking)
 * 将高密度的网页文本分割成更小的片段（每个片段约 400-500 字符），保持滑动窗口重叠。
 * @param {string} text 网页原始纯文本
 * @param {number} chunkSize 目标片段大小 (字符数)
 * @param {number} overlapSize 重叠字符数
 * @returns {Array<{id: string, index: number, text: string, charStart: number, charEnd: number}>}
 */
function chunkText(text, chunkSize = 450, overlapSize = 100) {
  if (!text || text.trim().length === 0) return [];
  
  const chunks = [];
  let index = 0;
  let cursor = 0;
  
  while (cursor < text.length) {
    // 基础切片边界
    let end = Math.min(cursor + chunkSize, text.length);
    
    // 尽可能在句子结束处中断，避免切断半句话
    if (end < text.length) {
      const remainingWindow = text.substring(end - 50, end + 50);
      const sentenceEndIndex = remainingWindow.search(/[。！？；.!?;\\n]/);
      if (sentenceEndIndex !== -1 && (end - 50 + sentenceEndIndex) > cursor) {
        end = end - 50 + sentenceEndIndex + 1;
      }
    }
    
    const chunkTextStr = text.substring(cursor, end).trim();
    if (chunkTextStr.length > 10) { // 略过过小的无意义片段
      chunks.push({
        id: \`chunk-\${index}\`,
        index: index,
        text: chunkTextStr,
        charStart: cursor,
        charEnd: end
      });
      index++;
    }
    
    // 计算下一个 cursor（加入 overlap）
    cursor = end - overlapSize;
    if (cursor >= text.length || end === text.length) break;
    if (cursor <= 0 || cursor <= chunks[chunks.length - 1].charStart) {
      cursor = end; // 防死循环
    }
  }
  
  return chunks;
}

/**
 * 提取文本的分词特征（支持英文单词和中文双字 N-Gram，极其适合混合型检索）
 * @param {string} text 输入文本
 * @returns {Map<string, number>} 词频/特征频率表
 */
function getTermFrequency(text) {
  const tf = new Map();
  if (!text) return tf;

  const normalized = text.toLowerCase().trim();
  
  // 1. 提取所有英文字符和单词
  const englishWords = normalized.match(/[a-z0-9]+/g) || [];
  for (const word of englishWords) {
    if (word.length > 1) { // 忽略单个字母的英文无意义虚词
      tf.set(word, (tf.get(word) || 0) + 1.2); // 英文单词加权
    }
  }

  // 2. 提取中文双字 N-Gram (Bi-gram) 处理无空格分词的中文
  const cleanChinese = normalized.replace(/[^\\u4e00-\\u9fa5]/g, "");
  for (let i = 0; i < cleanChinese.length - 1; i++) {
    const biGram = cleanChinese.substring(i, i + 2);
    tf.set(biGram, (tf.get(biGram) || 0) + 1.0);
  }
  
  // 3. 提取中文单字特征 (作为补充)
  for (let i = 0; i < cleanChinese.length; i++) {
    const uniGram = cleanChinese.charAt(i);
    tf.set(uniGram, (tf.get(uniGram) || 0) + 0.3); // 单字权重略低
  }

  return tf;
}

/**
 * 计算余弦相似度 (Cosine Similarity)
 * @param {Map<string, number>} vecA 向量 A (词频 Map)
 * @param {Map<string, number>} vecB 向量 B (词频 Map)
 * @returns {number} 余弦相似度得分 [0, 1]
 */
function calculateCosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  // 计算 dot product
  for (const [term, freqA] of vecA.entries()) {
    magnitudeA += freqA * freqA;
    if (vecB.has(term)) {
      dotProduct += freqA * vecB.get(term);
    }
  }

  // 计算 vecB 模长
  for (const freqB of vecB.values()) {
    magnitudeB += freqB * freqB;
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

/**
 * 检索 Top N 最相似段落
 * @param {string} query 用户问题
 * @param {Array<TextChunk>} chunks 预切片的段落模型
 * @param {number} topN 获取数量
 * @returns {Array<{chunk: TextChunk, score: number, rank: number}>}
 */
function searchSimilarChunks(query, chunks, topN = 3) {
  if (!query || chunks.length === 0) return [];
  
  const queryTF = getTermFrequency(query);
  const results = chunks.map((chunk) => {
    const chunkTF = getTermFrequency(chunk.text);
    const score = calculateCosineSimilarity(queryTF, chunkTF);
    return {
      chunk: chunk,
      score: score
    };
  });
  
  // 根据得分降序排序，过滤掉得分过低的项，取 TopN
  const sorted = results
    .sort((a, b) => b.score - a.score)
    .filter(item => item.score > 0) // 得分大于 0 的才保留
    .slice(0, topN);
    
  // 附带排名
  return sorted.map((item, i) => ({
    chunk: item.chunk,
    score: Number(item.score.toFixed(4)),
    rank: i + 1
  }));
}

// 模块化导出（供前端或扩展加载使用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { chunkText, getTermFrequency, calculateCosineSimilarity, searchSimilarChunks };
} else {
  // 声明在 window 上，供 Popup 或 Side Panel 全局调用
  window.SiteRAGEngine = { chunkText, getTermFrequency, calculateCosineSimilarity, searchSimilarChunks };
}
`
    },
    {
      name: "content.js",
      path: "content.js",
      description: "运行于用户当前网页顶层的注入式脚本。负责抓取页面纯文本(InnerText)或捕获销售 IM 聊天事件变更并触发 1.5s 智能防抖提取。",
      language: "javascript",
      content: `/**
 * Jin Yang RAG - Content Script (销冠思维引擎专版)
 * 1. 负责从当前网页中提取可见的文本内容、标题和 URL。
 * 2. 针对特殊即时通讯IM界面（如企业微信、网页IM等）启动具有 1.5s 防抖的高级 MutationObserver 监听器。
 * 3. 实时提取、隔离并过滤对话流（客户 vs 我方），丢弃系统通知、表情包及噪波。
 */

// 1.5s 延迟防抖定时器
let debounceTimer = null;

// 监听外界提取指令
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractText") {
    try {
      const rawText = document.body.innerText || "";
      const cleanedText = rawText.replace(/\\s+/g, " ").trim();
      sendResponse({
        success: true,
        title: document.title || window.location.hostname,
        url: window.location.href,
        content: cleanedText
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true;
});

// 通用表情包、富文本脏标以及系统时间戳过滤函数
function cleanChatMessage(rawText) {
  if (!rawText) return "";
  
  let text = rawText;
  
  // 1. 移除系统撤回、时间、图片等常见噪波前缀或混入字符
  text = text.replace(/^(客户|我方|系统|黄金销售代表|客户 Athen)\\s*:\\s*/g, "");
  text = text.replace(/^(客户 Athen|黄金销售代表|客户|我方|系统)\\s*\\d+:\\d+/gi, "");
  text = text.replace(/^\\d+:\\d+/gi, ""); // 去除行首时间
  
  // 2. 过滤各类表情包符号
  text = text.replace(/[\\u2700-\\u27BF]|[\\uE000-\\uF8FF]|\\uD83C[\\uDC00-\\uDFFF]|\\uD83D[\\uDC00-\\uDFFF]|[\\u2011-\\u26FF]|\\uD83E[\\uDD00-\\uDFFF]/g, "");
  
  // 3. 过滤系统事件通知字样
  const systemKeywords = ["撤回了一条消息", "重新编辑", "加入了群聊", "发出了日程", "已下发文件"];
  for (const keyword of systemKeywords) {
    if (text.includes(keyword)) {
      return "";
    }
  }
  
  return text.trim();
}

/**
 * 核心捕获处理器：在真实浏览器环境下提取 IM 聊天记录中的最后三条数据，并推送给应用
 */
function handleImFrameExtraction() {
  // 针对主流 IM 或自定义 IM DOM 的统一探测与捕获
  const chatWindow = document.getElementById("simulated-im-chat-window") || document.querySelector(".im-chat-stream") || document.querySelector("[class*='chat-window']");
  if (!chatWindow) return;

  const bubbleSelector = ".im-bubble, [class*='message-bubble'], [class*='chat-item']";
  const bubbles = chatWindow.querySelectorAll(bubbleSelector);
  
  const rawList = [];
  bubbles.forEach((el) => {
    // 识别发送者属性：client-say / client 为客户，agent-say / agent 为我方销售
    const isClient = el.classList.contains("client-say") || el.classList.contains("client") || el.getAttribute("data-sender") === "client" || el.innerText.includes("客户");
    
    const pEl = el.querySelector("p") || el;
    const cleanedText = cleanChatMessage(pEl.textContent || "");
    
    if (cleanedText) {
      rawList.push({
        sender: isClient ? "client" : "agent",
        text: cleanedText
      });
    }
  });

  // 获取最后 3 条并去重、提炼
  const lastThree = rawList.slice(-3);
  if (lastThree.length === 0) return;

  // 将整理好的聊天包发送给 SidePanel / Popup
  chrome.runtime.sendMessage({
    action: "imChatUpdated",
    data: lastThree,
    url: window.location.href
  }).catch(() => {
    // 静默忽略侧栏未打开时的报错
  });
}

// 激活观察器
function initImMutationObserver() {
  const targetId = "simulated-im-chat-window";
  const chatWindow = document.getElementById(targetId) || document.querySelector(".im-chat-stream");
  
  if (!chatWindow) {
    // 若未渲染，延迟轮询
    setTimeout(initImMutationObserver, 1000);
    return;
  }

  console.log("[MV3 销冠思维引擎] 实时监听观察器启动中...");
  
  const observer = new MutationObserver(() => {
    // 增加 1.5 秒严格防抖逻辑，降低 API 峰值开销
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      handleImFrameExtraction();
    }, 1500);
  });

  observer.observe(chatWindow, { childList: true, subtree: true });
}

// 检查是否在 IM 页面，并自动伴随启动
if (window.location.href.includes("webim/chat") || document.getElementById("simulated-im-chat-window")) {
  initImMutationObserver();
}
`
    },
    {
      name: "background.js",
      path: "background.js",
      description: "负责管理侧边面板的开启行为，并作为后台服务监听 Extension 图标点击，实现侧边栏或 Popup 快捷跳转。",
      language: "javascript",
      content: `/**
 * Jin Yang RAG - Background Script
 * 负责管理侧边面板的开启行为，并作为后台服务。
 */

// 启用在点击扩展图标时打开侧边栏 (Side Panel) 的行为
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("设置侧边栏行为失败:", error));
});

// 监听扩展图标的点击（确保兼容性）
chrome.action.onClicked.addListener((tab) => {
  // 如果当前浏览器不支持或未设定 openPanelOnActionClick，可以通过此事件显式开启
  chrome.sidePanel.open({ tabId: tab.id }).catch((error) => {
    console.log("无法直接开启侧边栏，尝试回退到 Popup。错误:", error);
  });
});
`
    },
    {
      name: "sidepanel.html",
      path: "sidepanel.html",
      description: "常驻侧边栏的对话主面板 UI 骨架。提供完备的问答流组件、设置抽屉、及实时抓取状态动态指示。",
      language: "html",
      content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Jin Yang RAG - 侧边问答面板</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container" id="app">
    <!-- 头部栏 -->
    <header>
      <div class="brand">
        <div class="logo-icon-container">
          <svg class="jy-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="jy-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#1e293b" />
                <stop offset="100%" stop-color="#0f172a" />
              </linearGradient>
              <linearGradient id="jy-mint-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#34d399" />
                <stop offset="100%" stop-color="#059669" />
              </linearGradient>
              <linearGradient id="jy-slate-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#f1f5f9" />
                <stop offset="100%" stop-color="#94a3b8" />
              </linearGradient>
              <filter id="jy-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <circle cx="50" cy="50" r="46" fill="url(#jy-bg-grad)" stroke="url(#jy-mint-grad)" stroke-width="2.5" />
            <circle cx="50" cy="50" r="41" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="3 3" />
            <path d="M 35 32 V 53 A 7 7 0 0 1 28 60 A 7 7 0 0 1 21 53" fill="none" stroke="url(#jy-slate-grad)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M 47 32 L 56 45" fill="none" stroke="url(#jy-mint-grad)" stroke-width="6.5" stroke-linecap="round" />
            <path d="M 65 32 L 56 45 L 70 59" fill="none" stroke="url(#jy-mint-grad)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="75" cy="64" r="6.5" fill="none" stroke="url(#jy-mint-grad)" stroke-width="4.5" />
            <circle cx="75" cy="64" r="2" fill="#fff" filter="url(#jy-glow)" />
          </svg>
        </div>
        <div>
          <h1 class="title">Jin Yang RAG</h1>
          <span class="subtitle">v1.0.0</span>
        </div>
      </div>
      <div class="header-actions">
        <button id="toggle-settings-btn" class="btn-icon" title="API 密钥配置">
          <!-- 齿轮图标 -->
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button id="clear-chat-btn" class="btn-icon" title="清除对话目录">
          <!-- 垃圾桶图标 -->
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
    </header>

    <!-- 配置抽屉 (可快捷更改服务端 URL 或者是本机的 API KEY) -->
    <div id="settings-panel" class="settings-panel">
      <div class="settings-group">
        <label class="settings-label" for="setting-api-url">开发版服务代理 API 后台端点</label>
        <input class="settings-input" id="setting-api-url" type="url" placeholder="默认使用主系统的 /api/rag">
      </div>
      <div class="settings-group">
        <label class="settings-label" for="setting-api-key">自定义 Agnes AI API 密钥 (可选，覆盖默认端点)</label>
        <input class="settings-input" id="setting-api-key" type="password" placeholder="AI Studio 已在服务器底层安全挂载，此项选填">
      </div>
      <div style="text-align: right; margin-top: 4px;">
        <button id="save-settings-btn" class="btn-primary" style="padding: 4px 10px; font-size: 11px;">保存配置</button>
      </div>
    </div>

    <!-- 当前加载的文章/标签页提示 -->
    <div class="webpage-indicator">
      <div class="indicator-left">
        <span class="status-dot"></span>
        <span class="page-title" id="webpage-name">正在检测当前标签页文本...</span>
      </div>
      <button id="refresh-page-btn" class="btn-icon" style="width: 22px; height: 22px;" title="重新提取并分块">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
      </button>
    </div>

    <!-- 聊天主视窗 -->
    <div class="chat-container" id="chat-history">
      <!-- 初始欢迎栏 -->
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
        <p>我们已从当前网页提取出能提取的全部正文，并在本地浏览器拆分为 <strong id="chunk-count">0</strong> 个语义分块片段。</p>
        <p style="font-size: 12px;">在下方提问，我们将利用本地相似度计算找出最相关的 Top 3 片段指引 Agnes-2.0-Flash 完成核心双路 RAG 智能问答！</p>
      </div>
    </div>

    <!-- 底部输入栏 -->
    <footer>
      <form id="chat-form" onsubmit="return false;">
        <div class="input-row">
          <input id="user-input" class="input-box" placeholder="输入您对本页面的疑问..." required autocomplete="off">
          <button id="send-btn" type="submit" class="input-send-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </form>
    </footer>
  </div>

  <!-- 引入 RAG 核心引擎 -->
  <script src="rag-engine.js"></script>
  <!-- 引入侧边栏交互 JavaScript -->
  <script src="sidepanel.js"></script>
</body>
</html>
`
    },
    {
      name: "sidepanel.js",
      path: "sidepanel.js",
      description: "侧边问答面板交互控制器。负责拉取、切片文本，监听 IM 消息更新，并在提问时通过 RAG 快速检索最相关的网页内容并向 Agnes AI 精准提问。",
      language: "javascript",
      content: `/**
 * Jin Yang RAG - Chrome Side Panel Script
 * 负责从 activeTab 提取真实网页的 innerText，并在浏览器本地沙盒中完成余弦相似度 RAG 召回，
 * 其后请求后台端点获得智能问答。
 */

let webpageChunks = [];
let webpageInfo = { title: "", url: "", content: "" };
let chatHistory = [];
let defaultApiUrl = "https://ais-dev-vznenzi5fkbim7vkay4366-388761582963.asia-southeast1.run.app/api/rag"; // 会由网页加载时动态拉取或填充

// 初始化 UI
document.addEventListener("DOMContentLoaded", async () => {
  setupStorageDefaults();
  setupUIEventHandlers();
  
  // 核心：触发当前活动网页信息的自动提取
  await extractAndProcessActivePage();
});

// 1. 设置存储默认值
async function setupStorageDefaults() {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["apiUrl", "apiKey"], (result) => {
      if (result.apiUrl) {
        document.getElementById("setting-api-url").value = result.apiUrl;
      } else {
        // 如果没有保存过，尝试设置当前运行站点的相对路径或默认主机
        const currentOrigin = window.location.origin;
        const fallbackUrl = currentOrigin.includes("chrome-extension") 
          ? defaultApiUrl 
          : \`\${currentOrigin}/api/rag\`;
        document.getElementById("setting-api-url").value = fallbackUrl;
      }
      if (result.apiKey) {
        document.getElementById("setting-api-key").value = result.apiKey;
      }
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

  // 保存设置按钮
  const saveSettingsBtn = document.getElementById("save-settings-btn");
  saveSettingsBtn.addEventListener("click", () => {
    const apiUrlValue = document.getElementById("setting-api-url").value.trim();
    const apiKeyValue = document.getElementById("setting-api-key").value.trim();
    
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ apiUrl: apiUrlValue, apiKey: apiKeyValue }, () => {
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

  // 清空对话
  const clearChatBtn = document.getElementById("clear-chat-btn");
  clearChatBtn.addEventListener("click", () => {
    chatHistory = [];
    const chatHistoryDiv = document.getElementById("chat-history");
    chatHistoryDiv.innerHTML = \`
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
        <p>当前页面已切片为 <strong>\${webpageChunks.length}</strong> 个片段。</p>
      </div>
    \`;
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
      content: \`这篇指南介绍了 RAG (Retrieval-Augmented Generation) 的核心知识。
RAG，即检索增强生成，是一种结合了信息检索和生成模型的技术。它通过检索外部知识库中的相关片段，为语言模型提供更加准确、实时的上下文，从而极大程度减轻模型的“幻觉”现象。
RAG 的工作流一般分为四个阶段：
1. 准备/索引阶段：对外部源数据进行清洗，将其切割为 300 到 500 字的语义片段(Chunks)。随后，可以利用嵌入模型将这些片段转换为连续稠密的实数矩阵(Vector embeddings)，并加载进向量数据库中。
2. 检索阶段：当用户提出某项具体的疑问时，系统利用同样的 Embedding 算法转换疑问句。随后在向量数据库中，使用余弦相似度(Cosine Similarity)或欧几里得距离来寻找相似度最高的 Top K 个知识片段。
3. 提示词拼接阶段：将用户的问题、以及检索出的 Top K 条知识片段按照模板拼接在一起。例如“背景知识：[知识片段]。请根据背景知识，回答问题：[用户问题]。”
4. 推理阶段：把拼接好的高质量提示词喂给像 Agnes-2.0-Flash 如此优秀强大的大模型，此时模型能获取极度可靠的实时参考，仅依赖已有事实提供准确无误的回复。\`
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
  
  console.log(\`本地切片构建完毕，共 \${webpageChunks.length} 个断片。\`, webpageChunks);
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
    let apiUrl = "https://ais-dev-vznenzi5fkbim7vkay4366-388761582963.asia-southeast1.run.app/api/rag";
    let customApiKey = "";
    
    if (typeof chrome !== "undefined" && chrome.storage) {
      const settings = await new Promise((resolve) => {
        chrome.storage.local.get(["apiUrl", "apiKey"], (res) => resolve(res));
      });
      if (settings.apiUrl) apiUrl = settings.apiUrl;
      if (settings.apiKey) customApiKey = settings.apiKey;
    } else {
      apiUrl = \`\${window.location.origin}/api/rag\`;
    }

    // 拼装上下文
    const contextContent = matchedSources.length > 0
      ? matchedSources.map((s, index) => \`[网页段落 #\${index+1} / 排名第 \${s.rank}，相关分: \${s.score}]:\\n\${s.chunk.text}\`).join("\\n\\n")
      : "（当前网页未找到匹配内容或无内容）";

    // 准备发送到服务端的 Payload
    const payload = {
      query: query,
      context: contextContent,
      customApiKey: customApiKey || undefined
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
      appendMessageBubble("ai", \`大模型通信异常：当前提供的本地后台服务器未启动或连接受阻 (\${response.status})。请检查您的扩展设置中的 API 地址。\`, []);
      return;
    }

    const data = await response.json();
    const answer = data.answer || "抱歉，没有获得任何回复内容。";
    
    // 渲染完美的 AI 泡泡
    appendMessageBubble("ai", answer, matchedSources);
  } catch (error) {
    console.error("问答异常:", error);
    removeBubble(loadingBubbleId);
    appendMessageBubble("ai", \`请求遭遇网络阻碍：\${error.message}。由于安全跨域政策限制，如果部署在沙箱外，请先确保本站点 API 可以被调用。\`, []);
  }
}

// 辅助方法：添加消息气泡
function appendMessageBubble(sender, text, sources = []) {
  const chatHistoryDiv = document.getElementById("chat-history");
  const bubble = document.createElement("div");
  bubble.className = \`message-bubble \${sender}\`;

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
    sHeader.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> 本地检索检索到最相关的 3 个段落：\`;
    sourcesDiv.appendChild(sHeader);

    sources.forEach((s) => {
      const sItem = document.createElement("div");
      sItem.className = "source-item";
      sItem.title = s.chunk.text; // 悬停显示完整文本
      sItem.innerHTML = \`<span class="source-tag">#\${s.rank} - Score: \${s.score}</span> \${truncateText(s.chunk.text, 80)}\`;
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
  contentDiv.innerHTML = \`
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  \`;
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
  html = html.replace(/\\*\\*(.*?)\\*\\*/g, "<strong>$1</strong>");

  // 2. 处理单格星号 *text*
  html = html.replace(/\\*(.*?)\\*/g, "<em>$1</em>");

  // 3. 处理代码块 \`code\`
  html = html.replace(/\`(.*?)\`/g, "<code style='background:#f4f4f5; padding:2px 4px; border-radius:3px; font-family:monospace; font-size:12px;'>$1</code>");

  // 4. 处理换行
  html = html.replace(/\\n/g, "<br>");

  return html;
}
`
    },
    {
      name: "popup.html",
      path: "popup.html",
      description: "插件顶部工具栏 Action 快捷点击呼出的轻便小窗 UI 页面。在受限空间中提供无缝完美的用户界面。",
      language: "html",
      content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Jin Yang RAG - 快速问答弹窗</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- 宽度设为 380px 适合 Chrome Action Popup 自适应大小 -->
  <div class="container" id="app" style="width: 380px; height: 500px;">
    <!-- 头部栏 -->
    <header>
      <div class="brand">
        <div class="logo-icon-container">
          <svg class="jy-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="jy-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#1e293b" />
                <stop offset="100%" stop-color="#0f172a" />
              </linearGradient>
              <linearGradient id="jy-mint-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#34d399" />
                <stop offset="100%" stop-color="#059669" />
              </linearGradient>
              <linearGradient id="jy-slate-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#f1f5f9" />
                <stop offset="100%" stop-color="#94a3b8" />
              </linearGradient>
              <filter id="jy-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <circle cx="50" cy="50" r="46" fill="url(#jy-bg-grad)" stroke="url(#jy-mint-grad)" stroke-width="2.5" />
            <circle cx="50" cy="50" r="41" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="3 3" />
            <path d="M 35 32 V 53 A 7 7 0 0 1 28 60 A 7 7 0 0 1 21 53" fill="none" stroke="url(#jy-slate-grad)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M 47 32 L 56 45" fill="none" stroke="url(#jy-mint-grad)" stroke-width="6.5" stroke-linecap="round" />
            <path d="M 65 32 L 56 45 L 70 59" fill="none" stroke="url(#jy-mint-grad)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="75" cy="64" r="6.5" fill="none" stroke="url(#jy-mint-grad)" stroke-width="4.5" />
            <circle cx="75" cy="64" r="2" fill="#fff" filter="url(#jy-glow)" />
          </svg>
        </div>
        <div>
          <h1 class="title">Jin Yang RAG</h1>
          <span class="subtitle">v1.0.0</span>
        </div>
      </div>
      <div class="header-actions">
        <button id="toggle-settings-btn" class="btn-icon" title="API 密钥配置">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button id="clear-chat-btn" class="btn-icon" title="清除对话目录">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
    </header>

    <!-- 配置栏 -->
    <div id="settings-panel" class="settings-panel">
      <div class="settings-group">
        <label class="settings-label" for="setting-api-url">开发版服务代理 API 后台端点</label>
        <input class="settings-input" id="setting-api-url" type="url" placeholder="默认使用主系统的 /api/rag">
      </div>
      <div class="settings-group">
        <label class="settings-label" for="setting-api-key">自定义 Agnes AI API 密钥 (可选)</label>
        <input class="settings-input" id="setting-api-key" type="password" placeholder="AI Studio 已安全挂载，此项选填">
      </div>
      <div style="text-align: right; margin-top: 4px;">
        <button id="save-settings-btn" class="btn-primary" style="padding: 4px 10px; font-size: 11px;">保存配置</button>
      </div>
    </div>

    <!-- 当前加载的文章 -->
    <div class="webpage-indicator">
      <div class="indicator-left">
        <span class="status-dot"></span>
        <span class="page-title" id="webpage-name">正在检测当前标签页文本...</span>
      </div>
      <button id="refresh-page-btn" class="btn-icon" style="width: 22px; height: 22px;" title="重新提取并分块">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
      </button>
    </div>

    <!-- 聊天区 -->
    <div class="chat-container" id="chat-history">
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
        <p style="font-size: 12px; margin: 4px 0;">我们已提取当前网页文本，并在本地拆分为 <strong id="chunk-count">0</strong> 个片段。</p>
      </div>
    </div>

    <!-- 输入框 -->
    <footer>
      <form id="chat-form" onsubmit="return false;">
        <div class="input-row">
          <input id="user-input" class="input-box" placeholder="输入您对本页面的疑问..." required autocomplete="off">
          <button id="send-btn" type="submit" class="input-send-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </form>
    </footer>
  </div>

  <script src="rag-engine.js"></script>
  <script src="popup.js"></script>
</body>
</html>
`
    },
    {
      name: "popup.js",
      path: "popup.js",
      description: "弹出框快捷交互小窗内置控制器。在 Popup 小窗环境下完成文本提取、切块与余弦本地 RAG 问答流程。",
      language: "javascript",
      content: `/**
 * Jin Yang RAG - Chrome Popup Script
 * 负责从 activeTab 提取真实网页的 innerText，并在浏览器本地沙盒中完成余弦相似度 RAG 召回，
 * 其后请求后台端点(Agnes AI)获取智能问答。适用于 Popup 小窗快速问答。
 */

let webpageChunks = [];
let webpageInfo = { title: "", url: "", content: "" };
let chatHistory = [];
let defaultApiUrl = "https://ais-dev-vznenzi5fkbim7vkay4366-388761582963.asia-southeast1.run.app/api/rag"; // 会由网页加载时动态拉取或填充

// 初始化 UI
document.addEventListener("DOMContentLoaded", async () => {
  setupStorageDefaults();
  setupUIEventHandlers();
  
  // 核心：触发当前活动网页信息的自动提取
  await extractAndProcessActivePage();
});

// 1. 设置存储默认值
async function setupStorageDefaults() {
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["apiUrl", "apiKey"], (result) => {
      if (result.apiUrl) {
        document.getElementById("setting-api-url").value = result.apiUrl;
      } else {
        const currentOrigin = window.location.origin;
        const fallbackUrl = currentOrigin.includes("chrome-extension") 
          ? defaultApiUrl 
          : \`\${currentOrigin}/api/rag\`;
        document.getElementById("setting-api-url").value = fallbackUrl;
      }
      if (result.apiKey) {
        document.getElementById("setting-api-key").value = result.apiKey;
      }
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

  // 保存设置按钮
  const saveSettingsBtn = document.getElementById("save-settings-btn");
  saveSettingsBtn.addEventListener("click", () => {
    const apiUrlValue = document.getElementById("setting-api-url").value.trim();
    const apiKeyValue = document.getElementById("setting-api-key").value.trim();
    
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ apiUrl: apiUrlValue, apiKey: apiKeyValue }, () => {
        alert("配置已成功保存！");
        settingsPanel.style.display = "none";
      });
    } else {
      alert("本地存储不可用");
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

  // 清空对话
  const clearChatBtn = document.getElementById("clear-chat-btn");
  clearChatBtn.addEventListener("click", () => {
    chatHistory = [];
    const chatHistoryDiv = document.getElementById("chat-history");
    chatHistoryDiv.innerHTML = \`
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
        <p style="font-size: 11px;">当前页面已切片为 <strong>\${webpageChunks.length}</strong> 个片段。</p>
      </div>
    \`;
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
      content: \`这篇指南介绍了 RAG (Retrieval-Augmented Generation) 的核心知识。
RAG，即检索增强生成，是一种结合了信息检索和生成模型的技术。它通过检索外部知识库中的相关片段，为语言模型提供更加准确、实时的上下文，从而极大程度减轻模型的“幻觉”现象。
RAG 的工作流一般分为四个阶段：
1. 准备/索引阶段：对外部源数据进行清洗，将其切割为 300 到 500 字的语义片段(Chunks)。随后，可以利用嵌入模型将这些片段转换为连续稠密的实数矩阵(Vector embeddings)，并加载进向量数据库中。
2. 检索阶段：当用户提出某项具体的疑问时，系统利用同样的 Embedding 算法转换疑问句。随后在向量数据库中，使用余弦相似度(Cosine Similarity)或欧几里得距离来寻找相似度最高的 Top K 个知识片段。
3. 提示词拼接阶段：将用户的问题、以及检索出的 Top K 条知识片段按照模板拼接在一起。例如“背景知识：[知识片段]。请根据背景知识，回答问题：[用户问题]。”
4. 推理阶段：把拼接好的高质量提示词喂给像 Agnes-2.0-Flash 如此优秀强大的大模型，此时模型能获取极度可靠的实时参考，仅依赖已有事实提供准确无误的回复。\`
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
    let apiUrl = "https://ais-dev-vznenzi5fkbim7vkay4366-388761582963.asia-southeast1.run.app/api/rag";
    let customApiKey = "";
    
    if (typeof chrome !== "undefined" && chrome.storage) {
      const settings = await new Promise((resolve) => {
        chrome.storage.local.get(["apiUrl", "apiKey"], (res) => resolve(res));
      });
      if (settings.apiUrl) apiUrl = settings.apiUrl;
      if (settings.apiKey) customApiKey = settings.apiKey;
    } else {
      apiUrl = \`\${window.location.origin}/api/rag\`;
    }

    const contextContent = matchedSources.length > 0
      ? matchedSources.map((s, index) => \`[网页段落 #\${index+1} / 排名第 \${s.rank}，相关分: \${s.score}]:\\n\${s.chunk.text}\`).join("\\n\\n")
      : "（当前网页未找到匹配内容或无内容）";

    const payload = {
      query: query,
      context: contextContent,
      customApiKey: customApiKey || undefined
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
      appendMessageBubble("ai", \`大模型通信异常：当前提供的本地后台服务器未启动 (\${response.status})。请检查您的设置中的 API 地址。\`, []);
      return;
    }

    const data = await response.json();
    const answer = data.answer || "抱歉，没有获得任何回复内容。";
    
    appendMessageBubble("ai", answer, matchedSources);
  } catch (error) {
    removeBubble(loadingBubbleId);
    appendMessageBubble("ai", \`请求异常: \${error.message}\`, []);
  }
}

// 辅助方法：添加消息气泡
function appendMessageBubble(sender, text, sources = []) {
  const chatHistoryDiv = document.getElementById("chat-history");
  const bubble = document.createElement("div");
  bubble.className = \`message-bubble \${sender}\`;

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
    sHeader.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> 匹配参考 (Top 3)：\`;
    sourcesDiv.appendChild(sHeader);

    sources.forEach((s) => {
      const sItem = document.createElement("div");
      sItem.className = "source-item";
      sItem.title = s.chunk.text;
      sItem.innerHTML = \`<span class="source-tag">#\${s.rank}</span> \${truncateText(s.chunk.text, 50)}\`;
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
  contentDiv.innerHTML = \`
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  \`;
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

  html = html.replace(/\\*\\*(.*?)\\*\\*/g, "<strong>$1</strong>");
  html = html.replace(/\\*(.*?)\\*/g, "<em>$1</em>");
  html = html.replace(/\`(.*?)\`/g, "<code style='background:#f4f4f5; padding:2px 4px; border-radius:3px; font-family:monospace; font-size:11px;'>$1</code>");
  html = html.replace(/\\n/g, "<br>");
  return html;
}
`
    }
  ]);

  // 从后端 API 获取磁盘上最新、最真实的插件源码文件，保障下包始终 100% 保持最新
  React.useEffect(() => {
    fetch("/api/extension/files")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && Array.isArray(data.files) && data.files.length > 0) {
          setFiles(data.files);
        }
      })
      .catch((err) => console.error("读取磁盘最新 Chrome 插件文件错误:", err));
  }, []);

  // 1. 触发下载 ZIP 工程压缩包
  const handleDownloadZip = async () => {
    setDownloading(true);
    setDownloadSuccess(false);

    try {
      const zip = new JSZip();

      // 在 zip 包中添加所有工程文件
      files.forEach((f) => {
        zip.file(f.path, f.content);
      });

      // 制作并生成 Zip
      const content = await zip.generateAsync({ type: "blob" });
      
      // 触发直接浏览器下载
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = "jinyang-rag-v1.0.0.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err) {
      console.error("生成 ZIP 失败:", err);
      alert("ZIP 生成失败，请刷新站点后重新尝试。");
    } finally {
      setDownloading(false);
    }
  };

  const activeFile = files.find((f) => f.path === selectedFilePath) || files[0];

  return (
    <div className="flex flex-col gap-6" id="developer-workspace-container">
      {/* 准备和引导模块 */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-xs flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col">
            <h3 className="font-bold text-zinc-900 text-base leading-snug">Chrome 开发者工作台</h3>
            <p className="text-zinc-500 text-xs mt-1">
              我们为你生成了完整、模块化且高强度注释的 Chrome 侧边栏/弹出窗 RAG 扩展。
            </p>
          </div>
          <button
            id="download-extension-zip-btn"
            onClick={handleDownloadZip}
            disabled={downloading}
            className={`flex items-center justify-center gap-2 font-semibold text-xs px-5 py-3 rounded-lg text-white shadow-md transition-all shrink-0 ${
              downloadSuccess
                ? "bg-emerald-600 shadow-emerald-100"
                : "bg-emerald-500 hover:bg-emerald-600 active:scale-95 cursor-pointer"
            }`}
          >
            {downloadSuccess ? (
              <>
                <CheckCircle className="w-4 h-4" /> 下包成功！请查看本地浏览器下载
              </>
            ) : downloading ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" /> 正在封装...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" /> 一键下包 Chrome 精准扩展项目 (.zip)
              </>
            )}
          </button>
        </div>

        {/* 极简安装步骤手册 */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 flex flex-col gap-4">
          <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-emerald-500" /> Chrome 浏览器一分钟无痛装卸指南（极其简单）：
          </span>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-sans">
            <div className="flex flex-col gap-1.5 p-3.5 bg-white border border-zinc-100 rounded-lg shadow-2xs">
              <span className="font-bold text-emerald-600 font-mono text-sm leading-none">01 / 下载解压</span>
              <p className="text-zinc-500 leading-relaxed text-[11px]">
                点击上方按钮，将 <code className="bg-zinc-100 px-1 py-0.2 rounded font-mono text-[10px]">.zip</code> 项目包保存到本机的桌面或文件夹中解压。
              </p>
            </div>
            <div className="flex flex-col gap-1.5 p-3.5 bg-white border border-zinc-100 rounded-lg shadow-2xs">
              <span className="font-bold text-emerald-600 font-mono text-sm leading-none">02 / 进入扩展页</span>
              <p className="text-zinc-500 leading-relaxed text-[11px]">
                在 Chrome 浏览器地址栏录入 <code className="bg-emerald-50 text-emerald-800 px-1 py-0.2 rounded font-mono text-[10px]">chrome://extensions</code> 并回车。
              </p>
            </div>
            <div className="flex flex-col gap-1.5 p-3.5 bg-white border border-zinc-100 rounded-lg shadow-2xs">
              <span className="font-bold text-emerald-600 font-mono text-sm leading-none">03 / 开启开发者模式</span>
              <p className="text-zinc-500 leading-relaxed text-[11px]">
                点亮 Chrome 扩展管理器右上角的<strong>“开发者模式 (Developer Mode)”</strong>开关按钮。
              </p>
            </div>
            <div className="flex flex-col gap-1.5 p-3.5 bg-white border border-zinc-100 rounded-lg shadow-2xs">
              <span className="font-bold text-emerald-600 font-mono text-sm leading-none">04 / 载入使用</span>
              <p className="text-zinc-500 leading-relaxed text-[11px]">
                点击左上角的“<strong>加载已解压的扩展程序</strong>”，直接选择本解压文件夹。点击图标即可秒开常驻侧边栏！
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 实时代码阅览器 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 文件级联导航 */}
        <div className="lg:col-span-4 bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-2 shadow-xs">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider pl-2 py-1 mb-1 block">
            项目完整目录树 (MV3)
          </span>
          <div className="flex flex-col gap-1">
            {/* 顶层文件夹标识 */}
            <div className="flex items-center gap-2 pl-2 py-1 text-xs font-semibold text-zinc-600">
              <Folder className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>site-rag-extension/</span>
            </div>

            {/* 核心文件 */}
            {files.map((f) => (
              <button
                key={f.path}
                onClick={() => setSelectedFilePath(f.path)}
                className={`flex items-center gap-2 pl-6 pr-3 py-2 text-xs rounded-lg text-left transition-all ${
                  selectedFilePath === f.path
                    ? "bg-zinc-800 text-white font-semibold"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                <File className={`w-3.5 h-3.5 shrink-0 ${selectedFilePath === f.path ? "text-emerald-400" : "text-zinc-400"}`} />
                <span className="truncate">{f.name}</span>
                {f.name.endsWith(".json") && (
                  <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1 py-0.2 rounded font-mono ml-auto group-hover:scale-95">
                    MV3
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 源码容器 */}
        <div className="lg:col-span-8 flex flex-col gap-2.5">
          {/* 文件说明卡 */}
          <div className="bg-zinc-800 text-white p-4 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-emerald-400 font-mono">{activeFile.path}</span>
              <p className="text-[11px] text-zinc-300 mt-1">{activeFile.description}</p>
            </div>
            <span className="text-[10px] bg-zinc-700/60 uppercase tracking-wider font-bold text-zinc-300 px-2 py-1 rounded">
              {activeFile.language}
            </span>
          </div>

          {/* 仿真代码视窗 */}
          <div className="bg-[#1e1e1e] border border-zinc-800 rounded-xl shadow-lg p-5 overflow-auto max-h-[480px]">
            <pre className="text-xs font-mono text-zinc-300 leading-relaxed block overflow-x-auto whitespace-pre">
              <code>{activeFile.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
