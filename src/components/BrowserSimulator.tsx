import React, { useState, useEffect } from "react";
import { SIMULATED_ARTICLES, Article } from "../data";
import { TextChunk, SearchResult } from "../types";
import { Globe, BookOpen, Layers, Edit3, HelpCircle, ArrowRight, MessageSquare, Send, User, ShieldAlert, Sparkles, Database } from "lucide-react";

interface BrowserSimulatorProps {
  webpageTitle: string;
  webpageUrl: string;
  webpageContent: string;
  setWebpageTitle: (t: string) => void;
  setWebpageUrl: (u: string) => void;
  setWebpageContent: (c: string) => void;
  chunks: TextChunk[];
  retrievedSources: SearchResult[];
}

export default function BrowserSimulator({
  webpageTitle,
  webpageUrl,
  webpageContent,
  setWebpageTitle,
  setWebpageUrl,
  setWebpageContent,
  chunks,
  retrievedSources,
}: BrowserSimulatorProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("rag-intro");
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // 1. IM Simulation Specific State Variables
  const [imMessages, setImMessages] = useState<Array<{ sender: "client" | "agent"; text: string; time: string }>>([
    { sender: "client", text: "您好，我们公司准备在企业微信部署智检服务，想先了解产品安全机制。", time: "10:30" },
    { sender: "agent", text: "您好！我是金牌客服代表。我们的系统支持端侧安全隔离，能与您的 Supabase 全面打通！", time: "10:31" },
    { sender: "client", text: "请问你们支持私有化部署吗？我们的智库数据必须要在内网，有 pgvector 的支持政策吗？", time: "10:32" }
  ]);
  const [customImText, setCustomImText] = useState<string>("");
  const [simulatorRole, setSimulatorRole] = useState<"client" | "agent">("client");

  // 当选择模版改变时，载入数据
  useEffect(() => {
    if (selectedTemplateId === "custom") {
      setIsEditing(true);
      return;
    }
    const template = SIMULATED_ARTICLES.find((a) => a.id === selectedTemplateId);
    if (template) {
      setWebpageTitle(template.title);
      setWebpageUrl(template.url);
      setWebpageContent(template.content);
      setIsEditing(false);
    }
  }, [selectedTemplateId]);

  // 2. 只有当 webpageUrl 为 webim/chat 且 imMessages 更新时，实时把对话拼接为网页正文 webpageContent。
  // 这不仅模拟了 content script 行为，更完美契合本地 sliding 算法进行“对话流”文本切片与高亮可视化！
  useEffect(() => {
    if (webpageUrl.includes("webim/chat")) {
      const chatFeedText = imMessages
        .map(
          (m) =>
            `${m.sender === "client" ? "【客户咨询】" : "【业务回答】"} (${m.time}): ${m.text}`
        )
        .join("\n\n");
      // 保持 webpageContent 及时更新
      setWebpageContent(chatFeedText);
    }
  }, [imMessages, webpageUrl]);

  // 判断某分块是否属于检索召回的 Top 3 段落，并获取检索分数和排名
  const getRetrievalStatus = (chunkId: string): SearchResult | null => {
    const match = retrievedSources.find((s) => s.chunk.id === chunkId);
    return match || null;
  };

  // 添加模拟客户或我方发送的消息
  const handleSendImMessage = (textToSend?: string) => {
    const messageText = textToSend || customImText;
    if (!messageText.trim()) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setImMessages((prev) => [
      ...prev,
      {
        sender: simulatorRole,
        text: messageText,
        time: timeStr
      }
    ]);
    if (!textToSend) setCustomImText("");
  };

  // 一键清空对话流重置
  const resetImChat = () => {
    setImMessages([
      { sender: "client", text: "您好，想咨询下企业版 RAG 智能系统和 Supabase pgvector 长期库方案。", time: "10:45" }
    ]);
  };

  const isImPlatformActive = webpageUrl.includes("webim/chat");

  return (
    <div className="flex flex-col gap-6" id="browser-simulator-container">
      {/* 模版控制与模式挑选 */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold text-zinc-800 text-sm">浏览器当前活动标签页模拟器</h3>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500 font-medium">选择展示网页：</span>
            <select
              id="article-template-select"
              value={selectedTemplateId}
              onChange={(e) => {
                setSelectedTemplateId(e.target.value);
                // 如果切到 webim，同时重置下 chat 状态
                if (e.target.value === "wechat-web-im") {
                  resetImChat();
                }
              }}
              className="bg-zinc-50 border border-zinc-200 rounded-md px-3 py-1.5 text-zinc-700 font-medium focus:outline-emerald-500"
            >
              {SIMULATED_ARTICLES.map((art) => (
                <option key={art.id} value={art.id}>
                  [{art.category}] {art.title}
                </option>
              ))}
              <option value="custom">✍️ 自定义手写/粘贴文章...</option>
            </select>
          </div>
        </div>

        {/* 表单编辑栏 (如果为自定义或者点击了编辑) */}
        <div className="border-t border-zinc-100 pt-3 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {isEditing ? "编辑网页信息" : "网页基本元数据"}
            </span>
            <button
              id="toggle-edit-mode-btn"
              onClick={() => setIsEditing(!isEditing)}
              className="text-xs flex items-center gap-1.5 px-2.5 py-1 text-zinc-600 hover:text-emerald-600 bg-zinc-100 hover:bg-emerald-50 rounded-md transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {isEditing ? "完成并锁定网页" : "手动修改本页内容"}
            </button>
          </div>

          {isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animation-fadeIn">
              <div className="flex flex-col gap-1 col-span-1">
                <label className="text-xs text-zinc-500 font-medium">网页标题：</label>
                <input
                  id="input-edit-title"
                  type="text"
                  value={webpageTitle}
                  onChange={(e) => setWebpageTitle(e.target.value)}
                  className="bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs text-zinc-800 focus:outline-emerald-500 w-full"
                />
              </div>
              <div className="flex flex-col gap-1 col-span-1">
                <label className="text-xs text-zinc-500 font-medium">网址 URL：</label>
                <input
                  id="input-edit-url"
                  type="text"
                  value={webpageUrl}
                  onChange={(e) => setWebpageUrl(e.target.value)}
                  className="bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs text-zinc-800 focus:outline-emerald-500 w-full"
                />
              </div>
              <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
                <label className="text-xs text-zinc-500 font-medium">网页正文 (innerText)：</label>
                <textarea
                  id="input-edit-content"
                  rows={4}
                  value={webpageContent}
                  onChange={(e) => setWebpageContent(e.target.value)}
                  placeholder="在此处贴入网页的innerText正文内容..."
                  className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs text-zinc-800 focus:outline-emerald-500 w-full font-sans leading-relaxed"
                />
              </div>
            </div>
          ) : (
            <div className="bg-zinc-50 p-3 rounded-lg flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-500 w-12">标题:</span>
                <span className="text-zinc-800 font-medium">{webpageTitle}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-500 w-12">网址:</span>
                <a
                  href={webpageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-600 font-medium hover:underline flex items-center gap-1"
                >
                  {webpageUrl} <Globe className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 拟物浏览器框架 */}
      <div className="bg-zinc-100 rounded-xl border border-zinc-300 shadow-lg overflow-hidden flex flex-col">
        {/* 拟物导航栏 */}
        <div className="bg-zinc-200 px-4 py-2.5 flex items-center gap-4 border-b border-zinc-300">
          <div className="flex gap-1.5 items-center">
            <span className="w-3 h-3 bg-red-400 rounded-full inline-block"></span>
            <span className="w-3 h-3 bg-yellow-400 rounded-full inline-block"></span>
            <span className="w-3 h-3 bg-green-400 rounded-full inline-block"></span>
          </div>
          <div className="flex-1 bg-white border border-zinc-300 rounded-lg py-1 px-3 text-xs text-zinc-500 flex items-center gap-2 truncate shadow-inner">
            <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="truncate">{webpageUrl}</span>
          </div>
        </div>

        {/* 浏览器页面视窗 */}
        <div className="bg-white p-6 max-h-[360px] overflow-y-auto flex flex-col gap-4 border-b border-zinc-200">
          
          {/* A. 若检测为特殊网页版 IM 平台，渲染高级交互式聊天挂件而不是普通文本！ */}
          {isImPlatformActive ? (
            <div className="flex flex-col gap-4 w-full">
              {/* 微信 IM 头部 */}
              <div className="border-b border-zinc-100 pb-2 flex items-center justify-between">
                <div>
                  <h1 className="text-base font-bold text-zinc-800 tracking-tight flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    企业微信网页客服 (连接状态: 100% 极速响应)
                  </h1>
                  <span className="text-[10px] text-zinc-400 font-medium">
                    正在捕获客户「Athen Drakomin」的即时对话 | 实时 MutationObserver 监听已激活
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resetImChat}
                  className="text-[10px] border border-zinc-200 hover:border-zinc-300 px-2 py-1 rounded bg-zinc-50 text-zinc-600 hover:text-red-500"
                >
                  重置模拟会话
                </button>
              </div>

              {/* 核心气泡渲染窗口，带唯一的 ID 与 classes，支持 SidePanel 纯 MutationObserver 原生捕捉 */}
              <div
                id="simulated-im-chat-window"
                className="im-chat-stream flex flex-col gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-200 max-h-[200px] overflow-y-auto min-h-[160px] scroll-smooth"
              >
                {imMessages.map((msg, index) => {
                  const isClient = msg.sender === "client";
                  return (
                    <div
                      key={index}
                      className={`im-bubble flex flex-col gap-1 max-w-[85%] text-xs p-2.5 rounded-xl shadow-xs ${
                        isClient
                          ? "client-say bg-white border border-zinc-200 text-zinc-800 self-start"
                          : "agent-say bg-emerald-500 text-white self-end"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 font-semibold pb-0.5 opacity-80 text-[10px]">
                        <span>{isClient ? msg.sender === "client" ? "客户 Athen" : "系统" : "黄金销售代表"}</span>
                        <span>{msg.time}</span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  );
                })}
              </div>

              {/* 消息模拟控制器：发送自定义提问 */}
              <div className="flex flex-col gap-2 p-3 bg-zinc-50/70 border border-zinc-150 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                    沙盒仿真测试控制区 (模拟客服双方收发)
                  </span>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] text-zinc-500 flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="sender-role"
                        className="accent-emerald-500"
                        checked={simulatorRole === "client"}
                        onChange={() => setSimulatorRole("client")}
                      />
                      以 [客户] 身份发话
                    </label>
                    <label className="text-[10px] text-zinc-500 flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="sender-role"
                        className="accent-emerald-500"
                        checked={simulatorRole === "agent"}
                        onChange={() => setSimulatorRole("agent")}
                      />
                      以 [我方客服] 身份回话
                    </label>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customImText}
                    onChange={(e) => setCustomImText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSendImMessage();
                      }
                    }}
                    placeholder={
                      simulatorRole === "client"
                        ? "输入想模拟的客户提问（如：如何保障我的数据安全？）..."
                        : "输入想模拟的我方客服消息..."
                    }
                    className="flex-1 bg-white border border-zinc-200 p-2 rounded-lg text-xs focus:outline-emerald-500 text-zinc-800"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendImMessage()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-2 rounded-lg font-medium shadow-sm cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <Send className="w-3 h-3" />
                    发送
                  </button>
                </div>

                {/* 常用销冠测试问题快速注入器 */}
                <div className="flex flex-col gap-1.5 mt-1 border-t border-zinc-200/60 pt-2">
                  <span className="text-[10px] text-zinc-400 text-left font-semibold">
                    🔥 常见客资冲突提问一键注入 (点按直接追加进对话流测试推荐):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSendImMessage("客服在吗？你们 pgvector 长期记忆库的最大单表向量上限是多少维？")}
                      className="text-left border border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/35 p-1.5 rounded-md text-[10px] text-zinc-600 truncate cursor-pointer transition-colors"
                    >
                      💬 向量单表最大支持多少维？
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendImMessage("如果由于数据库满而触发 OOM，Supabase 怎么扩容升级？")}
                      className="text-left border border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/35 p-1.5 rounded-md text-[10px] text-zinc-600 truncate cursor-pointer transition-colors"
                    >
                      💬 超载 OOM 怎么扩容？
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendImMessage("我们的核心智库数据十分敏感。能把 RAG 检索模型本地私有化吗？")}
                      className="text-left border border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/35 p-1.5 rounded-md text-[10px] text-zinc-600 truncate cursor-pointer transition-colors"
                    >
                      💬 智库数据能本地化隐私隔离吗？
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* B. 普通网页，渲染常规 HTML 文章结构 */
            <div className="flex flex-col gap-4">
              <div className="border-b border-zinc-100 pb-3">
                <h1 className="text-2xl font-bold text-zinc-900 tracking-tight leading-snug">
                  {webpageTitle}
                </h1>
                <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                  <span>模拟浏览器内容标签页加载完成</span>
                  <span>•</span>
                  <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                    ACTIVE
                  </span>
                </div>
              </div>
              <div className="text-zinc-600 text-sm leading-relaxed whitespace-pre-line font-sans">
                {webpageContent}
              </div>
            </div>
          )}
        </div>

        {/* 底部功能条：提示 RAG 提取 */}
        <div className="bg-zinc-50 px-5 py-3 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-200">
          <span className="flex items-center gap-1">
            <Layers className="w-4 h-4 text-zinc-400" />
            已由 Content Script 自动捕获网页中的 <strong>{webpageContent.length}</strong> 字符
          </span>
          <span className="text-zinc-400">模拟 document.body.innerText 提取</span>
        </div>
      </div>

      {/* RAG 切片可视化面板 */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-500" />
            <h4 className="font-semibold text-zinc-800 text-sm">本地切片在内存中的状态可视化库</h4>
          </div>
          <div className="bg-zinc-100 text-zinc-600 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-zinc-200">
            共 {chunks.length} 个分块 (每个块 ~450字)
          </div>
        </div>

        {chunks.length === 0 ? (
          <div className="bg-zinc-50 border border-zinc-200 border-dashed rounded-xl p-8 text-center text-zinc-400 text-xs">
            正在载入或等待切块...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="chunks-visual-grid">
            {chunks.map((chunk) => {
              const rStatus = getRetrievalStatus(chunk.id);
              const isRetrieved = rStatus !== null;

              return (
                <div
                  key={chunk.id}
                  id={`ui-chunk-card-${chunk.id}`}
                  className={`rounded-xl p-4 transition-all duration-300 flex flex-col gap-3 relative overflow-hidden group ${
                    isRetrieved
                      ? "bg-emerald-50/70 border-2 border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.15)] scale-[1.01] z-10"
                      : "bg-white border border-zinc-200/85 hover:border-zinc-300 hover:shadow-sm"
                  }`}
                >
                  {/* 首部标识 */}
                  <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
                    <span className={`px-2 py-0.5 rounded-md font-mono ${isRetrieved ? "bg-emerald-100/80 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>
                      分块 ID: #{chunk.index}
                    </span>
                    <span>字符区间: [{chunk.charStart} - {chunk.charEnd}]</span>
                  </div>

                  {/* 切片正文 */}
                  <p className="text-zinc-600 text-xs leading-relaxed font-sans line-clamp-4 group-hover:line-clamp-none transition-all duration-300">
                    {chunk.text}
                  </p>

                  {/* 召回命中勋章 */}
                  {isRetrieved && (
                    <div className="bg-emerald-500 text-white rounded-lg px-2.5 py-1 text-[11px] font-bold self-start mt-2 flex items-center gap-1.5 shadow-sm animate-pulse">
                      <span>已召回命中 #{rStatus.rank}</span>
                      <span>|</span>
                      <span>相关系数: {rStatus.score}</span>
                    </div>
                  )}

                  {/* 悬停展示全貌 */}
                  <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span className="text-[10px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded px-1.5 py-0.5 shadow-xs">
                      首尾对齐
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
