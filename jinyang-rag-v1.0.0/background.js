/**
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
