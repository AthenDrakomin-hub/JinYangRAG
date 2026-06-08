/**
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
      const cleanedText = rawText.replace(/\s+/g, " ").trim();
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
  text = text.replace(/^(客户|我方|系统|黄金销售代表|客户 Athen)\s*:\s*/g, "");
  text = text.replace(/^(客户 Athen|黄金销售代表|客户|我方|系统)\s*\d+:\d+/gi, "");
  text = text.replace(/^\d+:\d+/gi, ""); // 去除行首时间
  
  // 2. 过滤各类表情包符号
  text = text.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, "");
  
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
