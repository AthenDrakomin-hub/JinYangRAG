/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import BrowserSimulator from "./components/BrowserSimulator";
import SidePanelSimulator from "./components/SidePanelSimulator";
import ExtensionWorkspace from "./components/ExtensionWorkspace";
import { chunkText, searchSimilarChunks } from "./utils/rag-utils";
import { TextChunk, SearchResult } from "./types";
import { Compass, Code2, Layers, Cpu, Heart, CheckCircle2 } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"sandbox" | "developer">("sandbox");

  // 活动网页基本状态（支持联通式双端状态响应）
  const [webpageTitle, setWebpageTitle] = useState<string>("什么是 RAG (检索增强生成) 架构？");
  const [webpageUrl, setWebpageUrl] = useState<string>("https://zh.wikipedia.org/wiki/检索增强生成");
  const [webpageContent, setWebpageContent] = useState<string>("");

  // 内存中切分出的完整分块 (Chunks)
  const [chunks, setChunks] = useState<TextChunk[]>([]);

  // 召回命中 Top 3 分块 (作为跨组件高亮同步的核心)
  const [retrievedSources, setRetrievedSources] = useState<SearchResult[]>([]);

  // 当网页正文变动时，实时自动运行本地切片 (Chunking) 算法
  useEffect(() => {
    if (!webpageContent) return;
    const splitChunks = chunkText(webpageContent, 450, 100);
    setChunks(splitChunks);
    
    // 清除历史高亮
    setRetrievedSources([]);
  }, [webpageContent]);

  // 当 Side Panel 提交问题时，在此运行本地余弦夹角匹配匹配，召回相关资料
  const handleLocalSearch = (query: string): SearchResult[] => {
    const topThree = searchSimilarChunks(query, chunks, 3);
    return topThree;
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 flex flex-col text-zinc-900 font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      {/* 顶部导航层 */}
      <nav className="bg-white border-b border-zinc-200 sticky top-0 z-50 shadow-xs px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* LOGO */}
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md shadow-emerald-100 shrink-0 transition-transform hover:scale-105 duration-200 cursor-pointer">
              <svg className="w-full h-full" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="nav-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1e293b" />
                    <stop offset="100%" stopColor="#0f172a" />
                  </linearGradient>
                  <linearGradient id="nav-mint-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="nav-slate-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f1f5f9" />
                    <stop offset="100%" stopColor="#94a3b8" />
                  </linearGradient>
                  <filter id="nav-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <circle cx="50" cy="50" r="46" fill="url(#nav-bg-grad)" stroke="url(#nav-mint-grad)" strokeWidth="2.5" />
                <path d="M 35 32 V 53 A 7 7 0 0 1 28 60 A 7 7 0 0 1 21 53" fill="none" stroke="url(#nav-slate-grad)" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 47 32 L 56 45" fill="none" stroke="url(#nav-mint-grad)" strokeWidth="6.5" strokeLinecap="round" />
                <path d="M 65 32 L 56 45 L 70 59" fill="none" stroke="url(#nav-mint-grad)" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="75" cy="64" r="6.5" fill="none" stroke="url(#nav-mint-grad)" strokeWidth="4.5" />
                <circle cx="75" cy="64" r="2" fill="#fff" filter="url(#nav-glow)" />
              </svg>
            </div>
            <div className="flex flex-col">
              <h1 className="text-base font-bold text-zinc-900 tracking-tight leading-none flex items-center gap-1.5">
                Jin Yang RAG
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full leading-none font-semibold">
                  Chrome Extension
                </span>
              </h1>
              <span className="text-xs text-zinc-500 mt-1">网页知识库本地检索问答助手</span>
            </div>
          </div>

          {/* Tab 切页标签 */}
          <div className="flex items-center bg-zinc-100 p-1.5 rounded-xl border border-zinc-200 shrink-0">
            <button
              id="tab-sandbox-trigger"
              onClick={() => setActiveTab("sandbox")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-300 ${
                activeTab === "sandbox"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Compass className="w-4 h-4 text-emerald-500" />
              <span>在线沙盒演示面板</span>
            </button>
            <button
              id="tab-developer-trigger"
              onClick={() => setActiveTab("developer")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 ${
                activeTab === "developer"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Code2 className="w-4 h-4 text-emerald-500" />
              <span>扩展开发与打包下包</span>
            </button>
          </div>
        </div>
      </nav>

      {/* 核心正文流 */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        
        {/* 顶部欢迎横幅宣传框 */}
        <div className="bg-gradient-to-r from-zinc-950 to-zinc-900 text-white rounded-2xl p-6 md:p-8 border border-zinc-800 shadow-xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
          {/* 装饰渐变气泡 */}
          <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex-1 flex flex-col gap-2 relative z-10">
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold tracking-wider font-mono uppercase bg-emerald-950/40 px-3 py-1 rounded-full self-start border border-emerald-900/30">
              <Cpu className="w-3.5 h-3.5" />
              Chrome V3 SidePanel & Popup RAG
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white mt-1">
              免装直接试：在高度对齐的真实沙盒中感受轻量级 RAG 魅力
            </h2>
            <p className="text-zinc-400 text-xs md:text-sm leading-relaxed mt-1 max-w-2xl">
              「业务员 AI 助手」业务员最怕的就是客户提问时答不上来、说错信息，或者翻资料浪费时间。这个系统用 RAG 把所有业务知识都装进了浏览器里，随用随调，不仅能保证信息准确，还能秒级响应，本质就是用 AI 给业务员打造了一个永不掉线的 “业务外挂”。结合了 Chrome Ext. MV3 主动提取特性，以及浏览器本地内存相似算法。我们不仅完成了在 Web 环境下的全仿真呈现，更编写了规范、极简的高纯度源码文件目录，支持一键无痛打包带走。
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-3 bg-zinc-800/80 backdrop-blur-xs px-5 py-4 border border-zinc-700/60 rounded-xl relative z-10">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div className="flex flex-col">
              <span className="text-zinc-200 text-xs font-bold">100% 隐私零伪装</span>
              <span className="text-zinc-400 text-[10px] mt-0.5">本地余弦检索 + Sec. API 后台</span>
            </div>
          </div>
        </div>

        {/* 1. 在线演示视图 */}
        {activeTab === "sandbox" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animation-fadeIn">
            {/* 左侧：浏览器正文及切片高亮同步显示 */}
            <div className="lg:col-span-7 flex flex-col gap-8">
              <BrowserSimulator
                webpageTitle={webpageTitle}
                webpageUrl={webpageUrl}
                webpageContent={webpageContent}
                setWebpageTitle={setWebpageTitle}
                setWebpageUrl={setWebpageUrl}
                setWebpageContent={setWebpageContent}
                chunks={chunks}
                retrievedSources={retrievedSources}
              />
            </div>

            {/* 右侧：Chrome 侧边栏交互终端 (高密度仿真) */}
            <div className="lg:col-span-5 flex flex-col sticky top-24">
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest pl-1">
                    真机仿真运行效果
                  </span>
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                    SIMULATOR LIVE
                  </span>
                </div>
                
                <SidePanelSimulator
                  webpageTitle={webpageTitle}
                  webpageUrl={webpageUrl}
                  webpageContent={webpageContent}
                  chunks={chunks}
                  onSearchTrigger={handleLocalSearch}
                  retrievedSources={retrievedSources}
                  setRetrievedSources={setRetrievedSources}
                />
              </div>
            </div>
          </div>
        )}

        {/* 2. 开发者文件夹 & 打包下包视图 */}
        {activeTab === "developer" && (
          <div className="animation-fadeIn">
            <ExtensionWorkspace />
          </div>
        )}

      </main>

      {/* 页脚 */}
      <footer className="bg-white border-t border-zinc-200 py-6 px-6 mt-16 text-center text-xs text-zinc-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span>Jin Yang RAG (网页知识库问答助手)</span>
            <span>•</span>
            <span className="font-semibold text-zinc-500">Google AI Studio Build</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Powered by</span>
            <span className="text-emerald-500 font-semibold flex items-center gap-0.5 whitespace-nowrap">
              Gemini 3.5 Flash <Heart className="w-3 h-3 text-red-500 fill-red-500 inline inline-block" />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
