import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { TextChunk, SearchResult, Message, CloudMemory, ChatSession } from "../types";
import { Settings, Trash2, Send, RotateCw, AlertCircle, HelpCircle, FileText, Database, Plus, Check, Search, Trash, Eye, Sparkles, RefreshCw, Activity, Layers, CloudLightning, Clock, Download, Moon, Sun, MessageSquare, ChevronDown, ChevronRight, AlertTriangle, HardDrive } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { initAuth, googleSignIn, logout as firebaseLogout } from "../utils/firebase";
import { loadPickerScript, openGooglePicker } from "../utils/picker";
import { User } from "firebase/auth";


interface SidePanelSimulatorProps {
  webpageTitle: string;
  webpageUrl: string;
  webpageContent: string;
  chunks: TextChunk[];
  onSearchTrigger: (query: string) => SearchResult[];
  retrievedSources: SearchResult[];
  setRetrievedSources: (sources: SearchResult[]) => void;
}

export default function SidePanelSimulator({
  webpageTitle,
  webpageUrl,
  webpageContent,
  chunks,
  onSearchTrigger,
  retrievedSources,
  setRetrievedSources,
}: SidePanelSimulatorProps) {
  // 1. Theme Configuration
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("sp_theme") as "light" | "dark") || "light";
  });
  const isDark = theme === "dark";

  // 2. Chat Sessions Persistence
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    const stored = localStorage.getItem("sp_chat_sessions");
    return stored ? JSON.parse(stored) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(() => {
    const stored = localStorage.getItem("sp_show_history");
    return stored === null ? true : stored === "true";
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [clearConfirm, setClearConfirm] = useState<boolean>(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [expandedCloudMemories, setExpandedCloudMemories] = useState<Record<string, boolean>>({});

  const toggleSource = (msgId: string) => {
    setExpandedSources((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const toggleCloudMemory = (msgId: string) => {
    setExpandedCloudMemories((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };
  
  // 模拟 Chrome Storage 中的设置项
  const [apiUrl, setApiUrl] = useState<string>(() => localStorage.getItem("sp_api_url") || `${window.location.origin}/api/rag`);
  const [customApiKey, setCustomApiKey] = useState<string>(() => localStorage.getItem("sp_api_key") || "");
  const [supabaseUrl, setSupabaseUrl] = useState<string>(() => localStorage.getItem("sp_supabase_url") || "");
  const [supabaseKey, setSupabaseKey] = useState<string>(() => localStorage.getItem("sp_supabase_key") || "");
  const [currentStage, setCurrentStage] = useState<string>(() => localStorage.getItem("sp_current_stage") || "STAGE_1_RECEIVE");
  const [userId, setUserId] = useState<string>(() => localStorage.getItem("sp_user_id") || "system_sales_default");

  // 固化存储状态追踪：'idle' | 'saving' | 'success' | 'error'
  const [savingStatus, setSavingStatus] = useState<Record<string, "idle" | "saving" | "success" | "error">>({});

  // 1 & 2 & 3. 新增核心功能状态 variables
  const [activeTab, setActiveTab] = useState<"chat" | "memory">("chat");
  const [autoSync, setAutoSync] = useState<boolean>(() => localStorage.getItem("sp_autosync") === "true");
  const [isModalDeleting, setIsModalDeleting] = useState<boolean>(false);
  const [modalDeleteSuccess, setModalDeleteSuccess] = useState<boolean>(false);
  const [modalDeleteError, setModalDeleteError] = useState<string | null>(null);

  // 智能聊天流识别与话术推荐状态 (“销冠思维引擎”高级版)
  const [salesEngineResult, setSalesEngineResult] = useState<{
    intent: string;
    emotion: string;
    customerTone: string;
    solutionA: string;
    solutionB: string;
    solutionC: string;
    analysis: string;
  } | null>(null);
  const [salesEngineTab, setSalesEngineTab] = useState<"solutionA" | "solutionB" | "solutionC">("solutionA");
  const [imLoading, setImLoading] = useState<boolean>(false);
  const [lastThreeChat, setLastThreeChat] = useState<Array<{ sender: "client" | "agent"; text: string }>>([]);
  
  // 自动同步运行反馈状态
  const [syncingPageUrl, setSyncingPageUrl] = useState<string>("");
  const [syncProgress, setSyncProgress] = useState<{ total: number; done: number; status: "idle" | "syncing" | "success" | "error" }>({
    total: 0,
    done: 0,
    status: "idle"
  });
  const syncedUrlsRef = useRef<Set<string>>(new Set());

  // === Google Drive & Picker states and handlers ===
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [isPickerScriptLoaded, setIsPickerScriptLoaded] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
  const [importMsg, setImportMsg] = useState<string>("");

  useEffect(() => {
    // 监听 Firebase Auth 状态获取 Access Token
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setDriveToken(token);
      },
      () => {
        setGoogleUser(null);
        setDriveToken(null);
      }
    );

    // 预载 Google Picker 脚本
    loadPickerScript()
      .then(() => setIsPickerScriptLoaded(true))
      .catch((err) => console.error("Failed to preload Picker script:", err));

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setImportStatus("idle");
      setImportMsg("");
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setDriveToken(result.accessToken);
        if (!isPickerScriptLoaded) {
          await loadPickerScript();
          setIsPickerScriptLoaded(true);
        }
      }
    } catch (err: any) {
      console.error("Google Auth failed:", err);
      setImportStatus("error");
      setImportMsg(`Google 授权登录失败: ${err.message || "未知错误"}`);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await firebaseLogout();
      setGoogleUser(null);
      setDriveToken(null);
      setImportStatus("idle");
      setImportMsg("");
    } catch (err: any) {
      console.error("Google Signout failed:", err);
    }
  };

  const handleOpenPicker = async () => {
    if (!driveToken) {
      handleGoogleLogin();
      return;
    }

    try {
      setImportStatus("idle");
      setImportMsg("");
      
      if (!isPickerScriptLoaded) {
        setImportStatus("importing");
        setImportMsg("正在加载谷歌 Picker 组件，请稍候...");
        await loadPickerScript();
        setIsPickerScriptLoaded(true);
        setImportStatus("idle");
        setImportMsg("");
      }

      openGooglePicker(
        driveToken,
        async (file) => {
          await handleImportFile(file);
        },
        () => {
          console.log("用户取消了谷歌 Picker 浏览");
        }
      );
    } catch (err: any) {
      console.error("Failed to show google picker dialog:", err);
      setImportStatus("error");
      setImportMsg(`无法载入 Picker 组件: ${err.message || "网络延迟"}`);
    }
  };

  const handleImportFile = async (file: { id: string; name: string; mimeType: string }) => {
    setImportStatus("importing");
    setImportMsg(`正在联机读取云文档「${file.name}」并切片分析中...`);

    try {
      const response = await fetch(`${window.location.origin}/api/drive/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          accessToken: driveToken,
          customApiKey: customApiKey,
          supabaseUrl: supabaseUrl,
          supabaseKey: supabaseKey,
          user_id: userId,
          current_stage: currentStage
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setImportStatus("error");
        setImportMsg(data.error || data.message || "大模型语义解析和读取遇到错误。请配置正确的 API 密钥和 Supabase 连接参数。");
      } else {
        setImportStatus("success");
        setImportMsg(data.message || `「${file.name}」解析成功，写入语义知识库。`);
        // 自动提取
        fetchMemories(memorySearchQuery);
      }
    } catch (error: any) {
      console.error("Error with backend endpoint /api/drive/import:", error);
      setImportStatus("error");
      setImportMsg(`联机存储故障: ${error.message || "请求超时"}`);
    }
  };

  // 永久保存主题及历史侧栏开关属性
  useEffect(() => {
    localStorage.setItem("sp_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("sp_show_history", showHistory ? "true" : "false");
  }, [showHistory]);

  // Enterprise WeChat / IM Web Portal Mutation Observer configuration
  useEffect(() => {
    if (!webpageUrl.includes("webim/chat")) {
      setSalesEngineResult(null);
      setLastThreeChat([]);
      return;
    }

    let observer: MutationObserver | null = null;
    let timer: any = null;

    const startObs = (node: HTMLElement) => {
      console.log("[Content Script Observer] 探测到网页版 IM 聊天窗口，正在启动 MutationObserver...");
      parseAndRecommend(node);

      observer = new MutationObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          parseAndRecommend(node);
        }, 1500); // 严格 1.5 秒性能防抖，防用户频繁发出短句
      });

      observer.observe(node, { childList: true, subtree: true });
    };

    const parseAndRecommend = async (node: HTMLElement) => {
      const bubbles = node.querySelectorAll(".im-bubble");
      const list: Array<{ sender: "client" | "agent"; text: string }> = [];

      bubbles.forEach((el) => {
        const isClient = el.classList.contains("client-say");
        let txt = el.querySelector("p")?.textContent || el.textContent || "";
        
        // 精准剔除各类脏标记 (如表情包符号/状态等) 以及系统、用户前缀
        txt = txt
          .replace(/^(客户|我方|系统|黄金销售代表|客户 Athen|业务回答|客户咨询)\s*:\s*/g, "")
          .replace(/^(客户 Athen|黄金销售代表|客户|我方|系统|业务回答|客户咨询)\s*\(\d+:\d+\):/gi, "")
          .replace(/^\d+:\d+/gi, "")
          .replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, "")
          .trim();

        if (txt) {
          list.push({
            sender: isClient ? "client" : "agent",
            text: txt,
          });
        }
      });

      const lastThree = list.slice(-3);
      setLastThreeChat(lastThree);

      if (lastThree.length === 0) return;

      const lastMsg = lastThree[lastThree.length - 1];
      // 只有在新一轮消息是客户发送的前提下，才向后台触发一键销冠回复计算
      if (lastMsg && lastMsg.sender === "client") {
        setImLoading(true);
        try {
          const res = await fetch("/api/im/recommend", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chatHistory: lastThree,
              customApiKey: customApiKey || undefined,
              supabaseUrl: supabaseUrl || undefined,
              supabaseKey: supabaseKey || undefined,
              user_id: userId,
              current_stage: currentStage,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              setSalesEngineResult({
                intent: data.intent,
                emotion: data.emotion,
                customerTone: data.customerTone,
                solutionA: data.solutionA,
                solutionB: data.solutionB,
                solutionC: data.solutionC,
                analysis: data.analysis
              });
              // 同步展示长期知识召回高亮卡片
              if (data.cloudMemories && Array.isArray(data.cloudMemories) && data.cloudMemories.length > 0) {
                const mappedSources: SearchResult[] = data.cloudMemories.map((m: any, idx: number) => ({
                  chunk: {
                    id: m.id || `cloud-${idx}`,
                    title: m.url || "Supabase 长期智库参考",
                    content: m.content,
                    category: "长期智库",
                    url: m.url || ""
                  },
                  score: m.similarity || 0.85
                }));
                setRetrievedSources(mappedSources);
              }
            }
          } else {
            console.error("话术推荐系统异常:", res.statusText);
          }
        } catch (err) {
          console.error("求取销冠回复出错:", err);
        } finally {
          setImLoading(false);
        }
      }
    };

    // 轮询等待 DOM 渲染注入
    const checkInterval = setInterval(() => {
      const node = document.getElementById("simulated-im-chat-window");
      if (node) {
        clearInterval(checkInterval);
        startObs(node);
      }
    }, 500);

    return () => {
      clearInterval(checkInterval);
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [webpageUrl, webpageContent, customApiKey, supabaseUrl, supabaseKey]);

  // 新增保存会话至本地缓存的方法
  const saveSession = (sessId: string, title: string, currentMsgs: Message[]) => {
    setChatSessions((prev) => {
      let existing = prev.find((s) => s.id === sessId);
      let updated: ChatSession[];
      if (existing) {
        updated = prev.map((s) =>
          s.id === sessId ? { ...s, messages: currentMsgs, timestamp: new Date().toISOString() } : s
        );
      } else {
        updated = [
          {
            id: sessId,
            title: title.slice(0, 30) + (title.length > 30 ? "..." : ""),
            messages: currentMsgs,
            webpageUrl: webpageUrl,
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ];
      }
      localStorage.setItem("sp_chat_sessions", JSON.stringify(updated));
      return updated;
    });
  };

  const handleConfirmDeleteSession = (sessId: string) => {
    const updated = chatSessions.filter((s) => s.id !== sessId);
    setChatSessions(updated);
    localStorage.setItem("sp_chat_sessions", JSON.stringify(updated));
    setSessionToDelete(null);
    if (currentSessionId === sessId) {
      setCurrentSessionId(null);
      setMessages([]);
      setRetrievedSources([]);
    }
  };

  // 导出 Supabase 记忆片段为本地 CSV 文件的方法
  const exportMemoriesToCSV = () => {
    if (memoriesList.length === 0) {
      alert("当前记忆列表为空，无法进行导出。如果您的数据库连接已经就绪，可通过上方检索出对应的记忆再行导出备份。");
      return;
    }
    
    // 构建 CSV 头部、行列内容
    const headers = ["记忆标记ID (ID)", "同步创建时间 (Created At)", "页面源关联链接 (Source URL)", "记忆片段详细文本 (Content)"];
    const rows = memoriesList.map(mem => [
      mem.id,
      new Date(mem.created_at).toISOString(),
      mem.url || "",
      // 用双引号包围文本防逗号和换行爆表异常
      `"${(mem.content || "").replace(/"/g, '""')}"`
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");
    
    // 添加 \ufeff 字符前缀来解决部分 Windows Excel 软件解析中文 utf-8 乱码难题
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `supabase_rag_memories_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // 长期记忆管理状态
  const [memoriesList, setMemoriesList] = useState<any[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState<boolean>(false);
  const [memorySearchQuery, setMemorySearchQuery] = useState<string>("");
  const [deleteStatus, setDeleteStatus] = useState<Record<string, "idle" | "deleting" | "success" | "error">>({});

  // pgvector 云端数据库诊断属性
  const [dbStats, setDbStats] = useState<any>({
    connected: false,
    totalCount: 0,
    uniqueUrls: 0,
    totalChars: 0,
    estimatedMemoryUsage: "0 KB",
    latencyMs: 0
  });
  const [statsLoading, setStatsLoading] = useState<boolean>(false);

  // 计算估算物理内存占比 (最大可用额度以 15MB 为标准)
  const memLimitBytes = 15 * 1024 * 1024; // 15MB
  const currentTotalBytes = dbStats?.totalBytes || 0;
  const memoryUtilizationPct = Number(Math.min((currentTotalBytes / memLimitBytes) * 100, 100).toFixed(1));

  // 删除对话框与会话折叠常态
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [memoryToDelete, setMemoryToDelete] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // 云端长期记忆获取器
  const fetchMemories = async (searchStr = "") => {
    const sUrl = supabaseUrl?.trim() || "";
    const sKey = supabaseKey?.trim() || "";

    if (!sUrl || !sKey) return;

    setMemoriesLoading(true);
    try {
      const response = await fetch(`${window.location.origin}/api/memory/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseUrl: sUrl,
          supabaseKey: sKey,
          searchQuery: searchStr
        })
      });

      if (response.ok) {
        const resData = await response.json();
        setMemoriesList(resData.list || []);
      } else {
        const errData = await response.json().catch(() => ({}));
        console.error("Fetch memories error:", errData.error);
      }
    } catch (e) {
      console.error("Fetch memories exception:", e);
    } finally {
      setMemoriesLoading(false);
    }
  };

  // 云端长期记忆单条确认删除器 (采用 persistent ConfirmDialog 与 immediate re-render)
  const handleActionDeleteMemory = async () => {
    if (!memoryToDelete) return;
    const memId = memoryToDelete;
    setIsModalDeleting(true);
    setModalDeleteError(null);
    setModalDeleteSuccess(false);

    try {
      const sUrl = supabaseUrl?.trim() || "";
      const sKey = supabaseKey?.trim() || "";

      const response = await fetch(`${window.location.origin}/api/memory/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: memId,
          supabaseUrl: sUrl,
          supabaseKey: sKey
        })
      });

      if (response.ok) {
        setModalDeleteSuccess(true);
        // 成功时，立即清除本地项与刷新物理状态指示，确保状态即时 re-render !
        setMemoriesList(prev => prev.filter(m => m.id !== memId));
        fetchStats();
        
        setTimeout(() => {
          setIsModalDeleting(false);
          setModalDeleteSuccess(false);
          setMemoryToDelete(null);
        }, 1000);
      } else {
        const errData = await response.json().catch(() => ({}));
        setModalDeleteError(errData.error || `服务端删除错误 (${response.status})`);
        setIsModalDeleting(false);
      }
    } catch (e: any) {
      console.error("Delete memory error:", e);
      setModalDeleteError(e.message || "请求超时或网络连接异常");
      setIsModalDeleting(false);
    }
  };

  // pgvector 数据库实时连接诊断检测器
  const fetchStats = async () => {
    const sUrl = supabaseUrl?.trim() || "";
    const sKey = supabaseKey?.trim() || "";

    if (!sUrl || !sKey) {
      setDbStats({
        connected: false,
        error: "Supabase Project URL 或 Anon Key 为空，未初始化连接。",
        totalCount: 0,
        uniqueUrls: 0,
        totalChars: 0,
        estimatedMemoryUsage: "0 KB",
        latencyMs: 0
      });
      return;
    }

    setStatsLoading(true);
    try {
      const response = await fetch(`${window.location.origin}/api/memory/stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseUrl: sUrl,
          supabaseKey: sKey
        })
      });

      if (response.ok) {
        const resData = await response.json();
        setDbStats(resData);
      } else {
        setDbStats({
          connected: false,
          error: `API 诊断路由反馈异常: ${response.status}`,
          totalCount: 0,
          uniqueUrls: 0,
          totalChars: 0,
          estimatedMemoryUsage: "0 KB",
          latencyMs: 0
        });
      }
    } catch (e: any) {
      setDbStats({
        connected: false,
        error: `连接异常: ${e.message || "无法建立诊断通信"}`,
        totalCount: 0,
        uniqueUrls: 0,
        totalChars: 0,
        estimatedMemoryUsage: "0 KB",
        latencyMs: 0
      });
    } finally {
      setStatsLoading(false);
    }
  };

  // 自动对当前页面 Chunks 切片做背景 embedding 存入长期库
  const triggerAutoSyncPage = async () => {
    const sUrl = supabaseUrl?.trim() || "";
    const sKey = supabaseKey?.trim() || "";
    if (!sUrl || !sKey) return;

    syncedUrlsRef.current.add(webpageUrl);
    setSyncingPageUrl(webpageUrl);
    
    // 我们限制每次自动同步最多同步 5 个 chunks (避免过高限流)
    const limit = Math.min(chunks.length, 5);
    setSyncProgress({
      total: limit,
      done: 0,
      status: "syncing"
    });

    const chunksToSync = chunks.slice(0, limit);
    let successCount = 0;

    for (let i = 0; i < chunksToSync.length; i++) {
      const chunk = chunksToSync[i];
      try {
        const response = await fetch(`${window.location.origin}/api/memory/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: chunk.text,
            url: webpageUrl,
            customApiKey: customApiKey || undefined,
            supabaseUrl: sUrl,
            supabaseKey: sKey,
            user_id: userId,
            current_stage: currentStage,
          }),
        });
        if (response.ok) {
          successCount++;
        }
      } catch (err) {
        console.error("Auto Sync slice failed", err);
      }
      setSyncProgress(prev => ({ ...prev, done: i + 1 }));
    }

    setSyncProgress(prev => ({
      ...prev,
      status: successCount > 0 ? "success" : "error"
    }));

    if (successCount > 0) {
      fetchStats();
      fetchMemories(memorySearchQuery);
    }

    setTimeout(() => {
      setSyncProgress(prev => ({ ...prev, status: "idle" }));
      fetchStats();
    }, 6000);
  };

  // 1. 监听自动同步与网页切换变动
  useEffect(() => {
    localStorage.setItem("sp_autosync", autoSync ? "true" : "false");
    
    if (autoSync && webpageUrl && chunks.length > 0 && !syncedUrlsRef.current.has(webpageUrl)) {
      triggerAutoSyncPage();
    }
  }, [autoSync, webpageUrl, chunks]);

  // 2. 监听选项卡切换：拉取对应数据
  useEffect(() => {
    if (activeTab === "memory") {
      fetchMemories(memorySearchQuery);
    }
  }, [activeTab, memorySearchQuery]);

  // 3. 实时连接心跳探针 (Heartbeat probe)
  useEffect(() => {
    // 首次载入拉取连接状态与指标
    fetchStats();
    
    // 每隔30秒进行一次静默心跳检测保证状态最新
    const heartbeatTimer = setInterval(() => {
      fetchStats();
    }, 30000);
    
    return () => clearInterval(heartbeatTimer);
  }, [supabaseUrl, supabaseKey]);

  // 滚动到底部
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // 快捷重置二次确认状态的生命周期
  useEffect(() => {
    if (clearConfirm) {
      const timer = setTimeout(() => {
        setClearConfirm(false);
      }, 4000); // 4秒无操作则退回普通状态
      return () => clearTimeout(timer);
    }
  }, [clearConfirm]);

  // 清除对话 / 新开会话 (增加防误触二次确认与删除同步机制)
  const handleClearHistory = () => {
    // 1. 如果当前没有消息且没有载入已有历史会话，属于空白面板，直接给一个柔和的友情反馈
    if (messages.length === 0 && !currentSessionId) {
      const toast = document.createElement("div");
      toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-xs font-semibold shadow-lg transition-all duration-300 z-50 transform translate-y-2 opacity-0 flex items-center gap-1.5 ${
        isDark ? "bg-zinc-800 text-zinc-350 border border-zinc-700" : "bg-zinc-800 text-white"
      }`;
      toast.innerHTML = `<span>💬 当前会话已为空，系统等待输入就绪</span>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.classList.remove("translate-y-2", "opacity-0"), 40);
      setTimeout(() => {
        toast.classList.add("translate-y-2", "opacity-0");
        setTimeout(() => toast.remove(), 300);
      }, 1500);
      return;
    }

    // 2. 如果尚未被激活二次确认状态，标记激活，让按钮进入报警变红确认态
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }

    // 3. 开始执行彻底清除和重置逻辑
    if (currentSessionId) {
      // 从本地存储的会话列表中彻底移除当前已经处于历史库的条目，实现真正的"删除当前"而不留下脏数据
      const updated = chatSessions.filter((s) => s.id !== currentSessionId);
      setChatSessions(updated);
      localStorage.setItem("sp_chat_sessions", JSON.stringify(updated));
    }

    // 4. 重置当前面板和会话状态，回到空白聊天
    setCurrentSessionId(null);
    setMessages([]);
    setRetrievedSources([]);
    setClearConfirm(false);

    // 5. 气泡视觉反馈
    const toast = document.createElement("div");
    toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-xs font-semibold shadow-lg transition-all duration-300 z-50 transform translate-y-2 opacity-0 flex items-center gap-1.5 ${
      isDark ? "bg-zinc-800 text-emerald-400 border border-zinc-700" : "bg-emerald-600 text-white shadow-md shadow-emerald-600/10"
    }`;
    toast.innerHTML = `<span>✨ 会话清理完成：历史记录已安全归档并重启新对话</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.remove("translate-y-2", "opacity-0");
    }, 50);

    setTimeout(() => {
      toast.classList.add("translate-y-2", "opacity-0");
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 2000);
  };

  // 存入云端长期记忆库
  const handleSaveToCloudMemory = async (contentId: string, text: string, textUrl: string) => {
    const sUrl = supabaseUrl?.trim() || "";
    const sKey = supabaseKey?.trim() || "";

    if (!sUrl || !sKey) {
      alert("⚠️ 无法保存记忆：请先点击侧边栏右上角设置 ⚙️ 配置您的 Supabase URL 和 Key。\n\n您可以使用免费开源的 Supabase 并在里面运行 DDL 开启 pgvector 支持！");
      setShowSettings(true);
      return;
    }

    setSavingStatus((prev) => ({ ...prev, [contentId]: "saving" }));
    try {
      const response = await fetch(`${window.location.origin}/api/memory/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: text,
          url: textUrl || webpageUrl,
          customApiKey: customApiKey || undefined,
          supabaseUrl: sUrl,
          supabaseKey: sKey,
          user_id: userId,
          current_stage: currentStage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `服务端保存错误 (${response.status})`);
      }

      setSavingStatus((prev) => ({ ...prev, [contentId]: "success" }));
      fetchStats();
      fetchMemories(memorySearchQuery);
      setTimeout(() => {
        setSavingStatus((prev) => ({ ...prev, [contentId]: "idle" }));
      }, 5000); // 正常显示 5 秒成功勾选状态
    } catch (err: any) {
      console.error(err);
      alert(`固化至长期记忆库错误: ${err.message || "未知原因"}`);
      setSavingStatus((prev) => ({ ...prev, [contentId]: "error" }));
    }
  };

  // 提交输入
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = userInput.trim();
    if (!query) return;

    setUserInput("");
    
    // 决定工作会话 ID
    const activeSessId = currentSessionId || `sess-${Date.now()}`;
    if (!currentSessionId) {
      setCurrentSessionId(activeSessId);
    }

    // 1. 新增用户提问
    const userMsgId = `usr-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    
    const updatedUserMessages = [...messages, userMsg];
    setMessages(updatedUserMessages);
    saveSession(activeSessId, query, updatedUserMessages);

    // 2. 本地检索：在网页 Chunks 库中快速进行 TF/余弦相似度搜索
    const matched = onSearchTrigger(query);
    setRetrievedSources(matched);

    // 3. 准备提示词并向大模型后台接口提交
    setLoading(true);

    try {
      // 组装背景参考文本
      const contextContent = matched.length > 0
        ? matched.map((s, index) => `[网页段落 #${index+1} / 排名第 ${s.rank}，相关分: ${s.score}]:\n${s.chunk.text}`).join("\n\n")
        : "（没有在活动标签页中检索到任何相关匹配段落。）";

      const payload = {
        query: query,
        context: contextContent,
        customApiKey: customApiKey || undefined,
        supabaseUrl: supabaseUrl || undefined,
        supabaseKey: supabaseKey || undefined,
        user_id: userId,
        current_stage: currentStage
      };

      const response = await fetch(apiUrl || "/api/rag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `服务端请求失败 (${response.status})`);
      }

      const data = await response.json();
      
      // 4. 新增大模型智能回复（携带云端记忆及本地匹配）
      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: data.answer || "抱歉，没有获得有效的回复信息。",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sources: matched,
        cloudMemories: data.cloudMemories || [],
      };

      const updatedAiMessages = [...updatedUserMessages, aiMsg];
      setMessages(updatedAiMessages);
      saveSession(activeSessId, query, updatedAiMessages);
    } catch (err: any) {
      console.error(err);
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        sender: "ai",
        text: `⚠️ **请求大模型失败**:\n${err.message || "请确认本系统后端正常开机启动，或检查并填写您特定的 API 控制端点。"}\n\n*建议：可在侧边栏设置面板中输入您特定的 Agnes AI API Key（选填）进行验证。*`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      const updatedErrorMessages = [...updatedUserMessages, errorMsg];
      setMessages(updatedErrorMessages);
      saveSession(activeSessId, query, updatedErrorMessages);
    } finally {
      setLoading(false);
    }
  };



  // 简易 Markdown / 代码段安全渲染器
  const renderFormattedText = (text: string) => {
    if (!text) return "";
    
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // 加粗 **text**
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong class='font-bold text-current'>$1</strong>");

    // 单星号斜体 *text*
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // 行内代码 `code`
    html = html.replace(/`(.*?)`/g, "<code class='bg-zinc-700/20 dark:bg-zinc-750 border border-zinc-500/20 text-current text-xs px-1.5 py-0.5 rounded-md font-mono'>$1</code>");

    // 句末换行
    html = html.replace(/\n/g, "<br>");

    return <div className="text-sm font-normal text-current leading-relaxed font-sans" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  // 按照日期分类分组历史会话，从而防止空间有限时的滚动拥挤
  const groupedSessions = React.useMemo(() => {
    const groups: Record<string, ChatSession[]> = {
      "Today (今天)": [],
      "Yesterday (昨天)": [],
      "Last 7 Days (最近一周)": [],
      "Older (更早以前)": []
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const sevenDaysAgoStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    chatSessions.forEach((sess) => {
      const ts = new Date(sess.timestamp).getTime();
      if (isNaN(ts)) {
        groups["Older (更早以前)"].push(sess);
      } else if (ts >= todayStart) {
        groups["Today (今天)"].push(sess);
      } else if (ts >= yesterdayStart) {
        groups["Yesterday (昨天)"].push(sess);
      } else if (ts >= sevenDaysAgoStart) {
        groups["Last 7 Days (最近一周)"].push(sess);
      } else {
        groups["Older (更早以前)"].push(sess);
      }
    });

    return Object.entries(groups).filter(([_, list]) => list.length > 0) as Array<[string, ChatSession[]]>;
  }, [chatSessions]);

  return (
    <div 
      className={`grid h-[650px] border rounded-2xl overflow-hidden shadow-xl transition-all duration-300 ${
        isDark ? "bg-zinc-950 text-zinc-100 border-zinc-800" : "bg-zinc-50 text-zinc-800 border-zinc-300"
      }`}
      style={{
        display: "grid",
        gridTemplateColumns: showHistory ? "200px 1fr" : "0px 1fr",
      }}
      id="chrome-sidepanel-mock"
    >
      
      {/* 历史对话侧边栏 (Chat History Sidebar) - 采用响应式网格与宽度折叠动画设计 */}
      <motion.div
        animate={{ width: showHistory ? 200 : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className={`border-r flex flex-col shrink-0 h-full overflow-hidden transition-colors duration-200 ${
          isDark ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-zinc-100 border-zinc-200 text-zinc-805"
        }`}
      >
        <div className="w-[200px] flex flex-col h-full shrink-0">
            {/* Header */}
            <div className={`p-3 border-b flex items-center justify-between shrink-0 transition-colors duration-200 ${
              isDark ? "border-zinc-850 bg-zinc-900" : "border-zinc-200 bg-zinc-50"
            }`}>
               <span className="text-xs font-bold flex items-center gap-1">
                 <Clock className="w-3.5 h-3.5 text-emerald-500" />
                 历史会话 (Chats)
               </span>
               <button
                 onClick={() => {
                   setCurrentSessionId(null);
                   setMessages([]);
                   setRetrievedSources([]);
                   setShowHistory(false);
                 }}
                 title="开启全新智检对话"
                 className={`p-1.5 rounded-lg text-[10px] font-bold flex items-center gap-0.5 border transition-all cursor-pointer ${
                   isDark ? "border-zinc-750 bg-zinc-850 text-emerald-400 hover:bg-zinc-700" : "border-zinc-250 bg-white text-emerald-600 hover:bg-zinc-50"
                 }`}
               >
                 ➕ 新建
               </button>
            </div>
            {/* List of sessions */}
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {chatSessions.length === 0 ? (
                <div className="text-center py-10 px-2 text-[10px] text-zinc-400">
                  暂无历史对话记录，请在右侧输入问题提问！
                </div>
              ) : (
                groupedSessions.map(([groupName, list]) => {
                  const isCollapsed = !!collapsedGroups[groupName];
                  return (
                    <div key={groupName} className="space-y-1">
                      {/* 分类折叠头部 */}
                      <button
                        onClick={() => {
                          setCollapsedGroups(prev => ({
                            ...prev,
                            [groupName]: !prev[groupName]
                          }));
                        }}
                        className={`w-full flex items-center justify-between px-1.5 py-1 text-[10px] font-bold tracking-wide uppercase transition-all rounded cursor-pointer ${
                          isDark 
                            ? "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200" 
                            : "text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700"
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {isCollapsed ? (
                            <ChevronRight className="w-3 h-3 text-emerald-500 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-emerald-500 shrink-0" />
                          )}
                          {groupName} ({list.length})
                        </span>
                      </button>

                      {/* 列出该分组下的项目 */}
                      {!isCollapsed && (
                        <div className="space-y-1 pl-1">
                          {list.map((sess) => {
                            const isDeletingConfirm = sessionToDelete === sess.id;
                            
                            return (
                              <div
                                key={sess.id}
                                onClick={() => {
                                  if (isDeletingConfirm) return;
                                  setCurrentSessionId(sess.id);
                                  setMessages(sess.messages || []);
                                  setRetrievedSources([]);
                                  setShowHistory(false);
                                }}
                                className={`relative p-2 rounded-lg cursor-pointer text-xs group flex items-start justify-between transition-all border ${
                                  currentSessionId === sess.id
                                    ? isDark 
                                      ? "bg-emerald-950/20 text-emerald-300 font-medium border-emerald-900" 
                                      : "bg-emerald-50 text-emerald-700 font-medium border-emerald-100"
                                    : isDark
                                      ? "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-transparent"
                                      : "hover:bg-zinc-200/50 text-zinc-600 hover:text-zinc-800 border-transparent"
                                }`}
                              >
                                {/* Mini ConfirmDialog absolute overlay inside the card to prevent misclicks */}
                                {isDeletingConfirm && (
                                  <div className="absolute inset-0 bg-red-500/10 backdrop-blur-[1px] rounded-lg flex items-center justify-between px-2.5 z-10 animate-fade-in border border-red-500/20">
                                    <span className="text-[9px] font-bold text-red-600 dark:text-red-400 flex items-center gap-0.5">
                                      <AlertCircle className="w-3 h-3 text-red-500 animate-pulse shrink-0" />
                                      确认删除?
                                    </span>
                                    <div className="flex gap-1 shrink-0">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleConfirmDeleteSession(sess.id);
                                        }}
                                        className="px-1.5 py-0.5 bg-red-500 hover:bg-red-600 text-[10px] text-white rounded font-bold cursor-pointer transition-colors"
                                      >
                                        是
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSessionToDelete(null);
                                        }}
                                        className="px-1.5 py-0.5 bg-zinc-400 hover:bg-zinc-500 text-[10px] text-white rounded font-bold cursor-pointer transition-colors"
                                      >
                                        否
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-col min-w-0 flex-1 pr-1 text-left">
                                  <span className="truncate leading-tight block text-[11px]" title={sess.title}>
                                    {sess.title}
                                  </span>
                                  <span className="text-[8px] opacity-60 font-mono mt-0.5 block">
                                    📅 {new Date(sess.timestamp).toLocaleDateString([], { month: "2-digit", day: "2-digit" })} {new Date(sess.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSessionToDelete(sess.id);
                                  }}
                                  title="移除此条历史"
                                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 hover:bg-red-500/10 rounded transition-all shrink-0 cursor-pointer text-zinc-400"
                                >
                                  <Trash className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </motion.div>

      {/* 主面板内容 */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* 头部栏 */}
        <div className={`px-4 py-3.5 flex items-center justify-between shrink-0 border-b transition-colors duration-200 ${
          isDark ? "bg-zinc-900 border-zinc-800 text-white" : "bg-white border-zinc-200"
        }`}>
          <div className="flex items-center gap-2">
            {/* Mock Chrome 侧边栏专属 Icon */}
            <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
              <svg className="w-full h-full" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="46" fill="#1e293b" stroke="#34d399" strokeWidth="2.5" />
                <path d="M 35 32 V 53 A 7 7 0 0 1 28 60 A 7 7 0 0 1 21 53" fill="none" stroke="#e4e4e7" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 47 32 L 56 45" fill="none" stroke="#34d399" strokeWidth="6.5" strokeLinecap="round" />
                <path d="M 65 32 L 56 45 L 70 59" fill="none" stroke="#34d399" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="75" cy="64" r="6.5" fill="none" stroke="#34d399" strokeWidth="4.5" />
                <circle cx="75" cy="64" r="2" fill="#fff" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <h3 className={`font-bold text-xs leading-tight flex items-center gap-1 ${isDark ? "text-white" : "text-zinc-900"}`}>
                Jin Yang RAG 侧边面板
                <span className={`text-[10px] font-normal px-1.5 py-0.5 rounded-full leading-none shrink-0 ${
                  isDark ? "bg-zinc-800 text-zinc-300" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                }`}>
                  Chrome OS
                </span>
              </h3>
              <span className={`text-[10px] truncate ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>正在与活动浏览器标签页实时联动</span>
            </div>
          </div>

          {/* 快捷控制 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer focus:outline-none ${
                showHistory 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : isDark 
                    ? "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700" 
                    : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
              title="展开/折叠历史对话侧栏"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
            <button
              id="sp-toggle-settings-btn"
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                showSettings 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : isDark 
                    ? "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700" 
                    : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
              title="快捷配置端点和API key"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              id="sp-clear-chat-btn"
              onClick={handleClearHistory}
              className={`p-1.5 rounded-lg border cursor-pointer transition-all duration-200 flex items-center justify-center gap-1 shrink-0 ${
                clearConfirm
                  ? "bg-red-500 border-red-500 text-white hover:bg-red-600 shadow-md shadow-red-500/15 font-semibold animate-pulse"
                  : isDark 
                    ? "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-red-400" 
                    : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-red-500"
              }`}
              title={clearConfirm ? "再次点击，确认彻底清空并重置此对话" : "一键清空/归档当前整个对话进程"}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {clearConfirm && <span className="text-[9px] font-bold px-0.5 tracking-tight">确认清空?</span>}
            </button>
          </div>
        </div>

        {/* 全局设置模态弹窗 Global Settings Modal */}
        {showSettings && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs animate-fadeIn">
            <div className={`w-full max-w-[320px] rounded-2xl shadow-2xl border flex flex-col max-h-[90%] overflow-hidden transition-colors duration-200 ${
              isDark ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-800"
            }`}>
              {/* Modal Header */}
              <div className={`px-4 py-3 border-b flex items-center justify-between shrink-0 transition-colors duration-200 ${
                isDark ? "bg-zinc-850 border-zinc-800" : "bg-zinc-50 border-zinc-150"
              }`}>
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-emerald-500 animate-spin-slow" />
                  全局系统配置 (Global Settings)
                </span>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="text-zinc-400 hover:text-zinc-600 text-sm font-bold font-sans p-1 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4 overflow-y-auto space-y-4 flex-1">
                {/* Theme Style Toggle Switch inside Global Settings */}
                <div className={`border p-3 rounded-xl flex flex-col gap-1.5 shadow-3xs transition-colors ${
                  isDark ? "bg-zinc-850 border-zinc-800" : "bg-zinc-50 border-zinc-200"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1">
                      {isDark ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                      系统主题切换 (Theme)
                    </span>
                    <button
                      onClick={() => setTheme(isDark ? "light" : "dark")}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-md border flex items-center gap-1 transition-all cursor-pointer select-none ${
                        isDark 
                          ? "bg-zinc-800 border-zinc-700 text-amber-400 hover:bg-zinc-750" 
                          : "bg-white border-zinc-250 text-indigo-600 hover:bg-zinc-100"
                      }`}
                    >
                      {isDark ? "明亮模式" : "暗黑模式"}
                    </button>
                  </div>
                  <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-405"}`}>
                    自由切换浏览器仿真模式，更完美无缝地对齐轻量/开发端环境状态。
                  </p>
                </div>

                {/* Auto-Sync to Memory Switch inside Global Settings */}
                <div className="bg-emerald-50/50 border border-emerald-150 p-3 rounded-xl flex flex-col gap-1.5 shadow-3xs hover:border-emerald-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                      ⚡ Auto-Sync to Memory
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={autoSync} 
                        onChange={(e) => setAutoSync(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-8 h-4 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
                    开启后，每次切换活动网页，扩展会自动触发 Embedding 与 Supabase 插入，实现浏览数据免手工持久化。
                  </p>
                </div>

                {/* RAG Endpoint */}
                <div className="flex flex-col gap-1">
                  <span className={`text-[10px] uppercase tracking-wider font-bold ${isDark ? "text-zinc-400" : "text-zinc-400"}`}>服务代理 API 控制端点</span>
                  <input
                    id="sp-setting-api-url"
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="默认使用本容器的 http://localhost:3000/api/rag"
                    className={`border rounded-lg p-2.5 text-xs w-full focus:outline-none focus:border-emerald-500 font-mono transition-colors duration-200 ${
                      isDark ? "bg-zinc-800 border-zinc-750 text-zinc-100" : "bg-zinc-50 border-zinc-200 text-zinc-700"
                    }`}
                  />
                </div>

                {/* Core CRM User ID (uuid) */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">客群租户隔离用户 ID (user_id UUID 为佳)</span>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="例如 system_sales_default"
                    className={`border rounded-lg p-2.5 text-xs w-full focus:outline-none focus:border-emerald-500 font-mono transition-colors duration-200 ${
                      isDark ? "bg-zinc-800 border-zinc-750 text-zinc-100" : "bg-zinc-50 border-zinc-200 text-zinc-700"
                    }`}
                  />
                </div>

                {/* Agnes AI Key */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">自定义 Agnes AI API 密钥</span>
                  <input
                    id="sp-setting-api-key"
                    type="password"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder="推荐留空：服务端将自动调配托管密钥"
                    className={`border rounded-lg p-2.5 text-xs w-full focus:outline-none focus:border-emerald-500 font-mono transition-colors duration-200 ${
                      isDark ? "bg-zinc-800 border-zinc-750 text-zinc-100" : "bg-zinc-50 border-zinc-200 text-zinc-700"
                    }`}
                  />
                </div>

                {/* Supabase URL */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 flex items-center gap-1">
                    <Database className="w-3 h-3 text-emerald-600" /> Supabase Project URL
                  </span>
                  <input
                    id="sp-setting-supabase-url"
                    type="text"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://your-project.supabase.co"
                    className={`border rounded-lg p-2.5 text-xs w-full focus:outline-none focus:border-emerald-500 font-mono transition-colors duration-200 ${
                      isDark ? "bg-zinc-800 border-zinc-750 text-zinc-100" : "bg-zinc-50 border-zinc-200 text-zinc-700"
                    }`}
                  />
                </div>

                {/* Supabase Anon Key */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 flex items-center gap-1">
                    <Database className="w-3 h-3 text-emerald-600" /> Supabase Anon Key (或 service_role)
                  </span>
                  <input
                    id="sp-setting-supabase-key"
                    type="password"
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className={`border rounded-lg p-2.5 text-xs w-full focus:outline-none focus:border-emerald-500 font-mono transition-colors duration-200 ${
                      isDark ? "bg-zinc-800 border-zinc-750 text-zinc-100" : "bg-zinc-50 border-zinc-200 text-zinc-700"
                    }`}
                  />
                </div>
                <details className={`text-left border rounded-lg p-2 mt-1 transition-colors ${
                  isDark ? "bg-zinc-850 border-zinc-800" : "bg-zinc-50 border-zinc-200"
                }`}>
                  <summary className="text-[10px] text-zinc-500 font-bold cursor-pointer hover:text-emerald-600 select-none">
                    📘 查看 Supabase pgvector 数据库建表 DDL SQL
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 font-sans">
                    <p className="text-[9px] text-zinc-500 leading-relaxed">
                      请在 Supabase SQL Editor 中运行此 DDL 完成数据库配置：
                    </p>
                    <pre className="bg-zinc-950 text-amber-200 text-[9px] font-mono leading-normal p-2 rounded max-h-40 overflow-y-auto select-all">
{`-- 1. 开启 pgvector 扩展
create extension if not exists vector;

-- 2. 创建投顾长期记忆智库表
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  embedding vector(768),
  url text,
  user_id uuid default '00000000-0000-0000-0000-000000000000'::uuid,
  current_stage text default 'STAGE_1_RECEIVE',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. 创建销冠智库阶段联合过滤检索 RPC 函数
create or replace function match_advisor_knowledge (
  query_embedding vector(768),
  current_stage text,
  target_user_id uuid,
  match_threshold float default 0.1,
  match_count int default 3
)
returns table (
  id uuid,
  content text,
  url text,
  similarity float,
  created_at timestamp with time zone
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.url,
    1 - (documents.embedding <=> query_embedding) as similarity,
    documents.created_at
  from documents
  where 
    (documents.user_id = target_user_id)
    and (documents.current_stage = current_stage)
    and (1 - (documents.embedding <=> query_embedding) > match_threshold)
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;`}
                    </pre>
                  </div>
                </details>
              </div>

              {/* Modal Footer */}
              <div className={`px-4 py-3 border-t flex justify-end shrink-0 transition-colors ${
                isDark ? "bg-zinc-850 border-zinc-800" : "bg-zinc-50 border-zinc-150"
              }`}>
                <button
                  onClick={() => {
                    localStorage.setItem("sp_api_url", apiUrl);
                    localStorage.setItem("sp_api_key", customApiKey);
                    localStorage.setItem("sp_supabase_url", supabaseUrl);
                    localStorage.setItem("sp_supabase_key", supabaseKey);
                    localStorage.setItem("sp_user_id", userId);
                    setShowSettings(false);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer w-full text-center"
                >
                  保存全局设置并应用 (Apply)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Memory Delete Secure Modal (ConfirmDialog) */}
        {memoryToDelete && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs animate-fadeIn">
            <div className={`w-full max-w-[280px] rounded-2xl shadow-2xl border p-4 flex flex-col gap-4 transition-colors duration-200 ${
              isDark ? "bg-zinc-900 border-zinc-800 text-zinc-105" : "bg-white border-zinc-200 text-zinc-800"
            }`}>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-red-500 font-sans flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  安全确认：永久擦除云记忆？
                </span>
                <p className="text-[11px] leading-relaxed text-zinc-500 text-left">
                  您确定要从 Supabase 中永久擦除这条长期记忆分块吗？此操作不可逆，稍后的向量交叉检索将不再包含此片段。
                </p>
                <div className={`p-2 rounded-lg text-[10px] break-words line-clamp-3 text-left border ${
                  isDark ? "bg-zinc-850/50 border-zinc-800 text-zinc-400" : "bg-zinc-50 border-zinc-100 text-zinc-500"
                }`}>
                  "{memoriesList.find(m => m.id === memoryToDelete)?.content || "暂未识别的记忆内容"}"
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setMemoryToDelete(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs leading-none font-medium cursor-pointer transition-colors ${
                    isDark ? "bg-zinc-805 hover:bg-zinc-750 text-zinc-350" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
                  }`}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleActionDeleteMemory}
                  className="px-3 py-1.5 rounded-lg text-xs leading-none font-medium bg-red-650 hover:bg-red-500 text-white cursor-pointer transition-colors"
                >
                  确定移除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 选项卡栏 */}
        <div className={`flex text-xs shrink-0 select-none border-b transition-colors duration-200 ${
          isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
        }`}>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-3 text-center font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "chat"
                ? "border-emerald-500 text-emerald-500 bg-emerald-500/5 animate-fadeIn"
                : isDark 
                  ? "border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50/50"
            }`}
          >
            💬 智能对话
          </button>
          <button
            onClick={() => setActiveTab("memory")}
            className={`flex-1 py-3 text-center font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === "memory"
                ? "border-emerald-500 text-emerald-500 bg-emerald-500/5"
                : isDark 
                  ? "border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50/50"
            }`}
          >
            ☁️ 记忆管理
          </button>
        </div>

      {/* 自动同步实时状态通知 */}
      {syncProgress.status !== "idle" && (
        <div className={`px-4 py-1.5 text-[10px] flex items-center justify-between border-b ${
          syncProgress.status === "syncing" ? "bg-amber-50 text-amber-800 border-amber-100 animate-pulse" :
          syncProgress.status === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-100" :
          "bg-red-50 text-red-800 border-red-100"
        }`}>
          <span className="flex items-center gap-1">
            <span className="relative flex h-1.5 w-1.5 animate-pulse">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                syncProgress.status === "syncing" ? "bg-amber-400" :
                syncProgress.status === "success" ? "bg-emerald-400" :
                "bg-red-400"
              }`}></span>
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                syncProgress.status === "syncing" ? "bg-amber-500" :
                syncProgress.status === "success" ? "bg-emerald-500" :
                "bg-red-500"
              }`}></span>
            </span>
            {syncProgress.status === "syncing" && `⚡ 自动页同步: 正在为当前页面解析切片存入 Supabase 长期库 (${syncProgress.done}/${syncProgress.total})...`}
            {syncProgress.status === "success" && `✅ 自动页同步: 成功同步该页面 ${syncProgress.total} 组知识切片到长期库！`}
            {syncProgress.status === "error" && "❌ 自动页同步: 自动同步由于 Supabase 密钥配置或连接超时原因而失败。"}
          </span>
          <span className="font-mono text-[8px] opacity-75 max-w-[120px] truncate">{webpageUrl}</span>
        </div>
      )}

      {/* 1. 💬 智能对话 RAG tab */}
      {activeTab === "chat" && (
        <>
          {/* 活跃标签页状态指示 */}
          <div className={`px-4 py-2 flex items-center justify-between gap-4 shrink-0 border-b transition-colors duration-200 ${
            isDark ? "bg-emerald-950/20 border-zinc-800" : "bg-emerald-50 border-zinc-200"
          }`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 inline-block animate-pulse"></span>
              <span className={`text-xs font-semibold truncate ${isDark ? "text-zinc-300" : "text-zinc-700"}`} title={webpageTitle}>
                {webpageTitle || "检测网页文本中..."}
              </span>
            </div>
            <div className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none whitespace-nowrap shrink-0">
              已载入 {chunks.length} 片段
            </div>
          </div>

          {/* 投顾4阶段销冠思维引擎 状态选择 bar */}
          <div className={`px-4 py-1.5 flex items-center justify-between gap-4 shrink-0 border-b transition-colors duration-200 ${
            isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-200"
          }`}>
            <span className={`text-[11px] font-bold flex items-center gap-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              <Layers className="w-3.5 h-3.5 text-emerald-500" />
              当前思辨锁定阶段:
            </span>
            <select
              value={currentStage}
              onChange={(e) => {
                setCurrentStage(e.target.value);
                localStorage.setItem("sp_current_stage", e.target.value);
              }}
              className={`text-[11px] font-medium rounded p-1 border cursor-pointer focus:outline-none focus:border-emerald-500 max-w-[170px] ${
                isDark ? "bg-zinc-850 border-zinc-700 text-zinc-200" : "bg-white border-zinc-250 text-zinc-700"
              }`}
            >
              <option value="STAGE_1_RECEIVE">接待建立信任 🤝 (STAGE_1_RECEIVE)</option>
              <option value="STAGE_2_GROUP">拉小群卡位配合 💡 (STAGE_2_GROUP)</option>
              <option value="STAGE_3_ACTIVATE">私聊深度跟进 🎯 (STAGE_3_ACTIVATE)</option>
              <option value="STAGE_4_OPEN">临门填表开户 🚀 (STAGE_4_OPEN)</option>
            </select>
          </div>

          {/* 当检测到 IM 平台时，展示“销冠思维引擎”高级交互式研判面板 */}
          {webpageUrl.includes("webim/chat") && (
            <div className={`mx-4 mt-3 p-4 rounded-xl border flex flex-col gap-3 transition-all duration-300 relative overflow-hidden group ${
              isDark 
                ? "bg-zinc-900 border-emerald-800/40 shadow-lg shadow-emerald-950/20" 
                : "bg-white border-emerald-200/80 shadow-md shadow-emerald-50/20"
            }`}>
              {/* 高端发光背景饰角 */}
              <div className="absolute -top-12 -right-12 w-28 h-28 bg-emerald-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-emerald-500/15 transition-all"></div>

              {/* 标题控制条 */}
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                <span className="text-[11px] uppercase font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-sans tracking-wide">
                  <Sparkles className="w-4 h-4 animate-pulse shrink-0 text-emerald-500" />
                  销冠思维引擎 • 实时商谈判断层
                </span>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-650 dark:text-emerald-400 px-2 py-0.5 rounded-full font-mono font-semibold">
                  {imLoading ? "🔍 变轨检索中..." : "✅ 研判完成"}
                </span>
              </div>

              {/* 实时提取的对话微缩窗 */}
              <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-850">
                <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">最新捕获的清洗对话流：</span>
                {lastThreeChat.length === 0 ? (
                  <span className="text-[10px] text-zinc-450 dark:text-zinc-500 italic block py-0.5">尚未接收到会话，请在左方发送测试文本或提问</span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {lastThreeChat.map((chat, idx) => (
                      <div key={idx} className="flex gap-1 text-[10px] leading-tight select-none">
                        <span className={`font-semibold shrink-0 ${chat.sender === "client" ? "text-amber-500" : "text-emerald-500"}`}>
                          {chat.sender === "client" ? "【客户】" : "【客服】"}:
                        </span>
                        <span className="text-zinc-650 dark:text-zinc-300 truncate max-w-[220px]" title={chat.text}>
                          {chat.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. 客户意图与情绪判定层展示 */}
              {salesEngineResult && (
                <div className="grid grid-cols-2 gap-2 mt-0.5">
                  <div className="flex flex-col gap-0.5 p-1.5 rounded-md bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-150/40 dark:border-zinc-850">
                    <span className="text-[8px] text-zinc-400 font-semibold">🎯 意图判定 (Intent)</span>
                    <span className="text-[10px] font-bold text-zinc-800 dark:text-zinc-200 truncate">
                      {salesEngineResult.intent}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 p-1.5 rounded-md bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-150/40 dark:border-zinc-850">
                    <span className="text-[8px] text-zinc-400 font-semibold">🧠 心理情绪 (Emotion Slot)</span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 truncate">
                      {salesEngineResult.emotion} ({salesEngineResult.customerTone || "严谨"})
                    </span>
                  </div>
                </div>
              )}

              {/* 3. 智能话术打磨模板（标签栏级卡片切换展示） */}
              <div className="flex flex-col gap-2 mt-1">
                {imLoading ? (
                  <div className="flex flex-col gap-2 py-3 bg-zinc-50/20 dark:bg-zinc-900/10 rounded-lg p-2.5">
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse w-3/4"></div>
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse w-5/6"></div>
                    <div className="h-2.5 bg-zinc-150 dark:bg-zinc-850 rounded animate-pulse w-1/2"></div>
                  </div>
                ) : salesEngineResult ? (
                  <div className="flex flex-col gap-2.5">
                    {/* 三阶话术切换 Tab 控件 */}
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-zinc-100 dark:bg-zinc-950 rounded-lg border border-zinc-200/50 dark:border-zinc-850">
                      <button
                        type="button"
                        onClick={() => setSalesEngineTab("solutionA")}
                        className={`text-[10px] py-1.5 rounded-md font-semibold transition-all cursor-pointer text-center ${
                          salesEngineTab === "solutionA"
                            ? "bg-emerald-600 text-white shadow-sm font-bold"
                            : "text-zinc-650 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-900"
                        }`}
                      >
                        A.专业委婉
                      </button>
                      <button
                        type="button"
                        onClick={() => setSalesEngineTab("solutionB")}
                        className={`text-[10px] py-1.5 rounded-md font-semibold transition-all cursor-pointer text-center ${
                          salesEngineTab === "solutionB"
                            ? "bg-emerald-600 text-white shadow-sm font-bold"
                            : "text-zinc-650 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-900"
                        }`}
                      >
                        B.直击痛点
                      </button>
                      <button
                        type="button"
                        onClick={() => setSalesEngineTab("solutionC")}
                        className={`text-[10px] py-1.5 rounded-md font-semibold transition-all cursor-pointer text-center ${
                          salesEngineTab === "solutionC"
                            ? "bg-emerald-600 text-white shadow-sm font-bold"
                            : "text-zinc-650 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-900"
                        }`}
                      >
                        C.探寻需求
                      </button>
                    </div>

                    {/* 选择板块话术具体渲染 */}
                    <div className="relative">
                      <blockquote className={`text-[11px] leading-relaxed p-3 rounded-lg border italic font-medium font-sans ${
                        isDark 
                          ? "bg-zinc-950/80 border-zinc-800 text-zinc-200" 
                          : "bg-zinc-50 border-zinc-200/90 text-zinc-800"
                      }`}>
                        “{salesEngineTab === "solutionA" ? salesEngineResult.solutionA :
                          salesEngineTab === "solutionB" ? salesEngineResult.solutionB :
                          salesEngineResult.solutionC}”
                      </blockquote>
                      
                      {/* 一键极速复制按钮 */}
                      <button
                        type="button"
                        onClick={() => {
                          const activeText = salesEngineTab === "solutionA" ? salesEngineResult.solutionA :
                                             salesEngineTab === "solutionB" ? salesEngineResult.solutionB :
                                             salesEngineResult.solutionC;
                          navigator.clipboard.writeText(activeText);
                          
                          // 金牌提示
                          const toast = document.createElement("div");
                          toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-xs font-semibold shadow-lg transition-all duration-300 z-50 transform translate-y-2 opacity-0 flex items-center gap-1.5 ${
                            isDark ? "bg-zinc-800 text-emerald-400 border border-zinc-700" : "bg-emerald-600 text-white shadow-md"
                          }`;
                          toast.innerHTML = `<span>📋 销冠推荐回复已复制！正在进行端侧秒传打包...</span>`;
                          document.body.appendChild(toast);
                          setTimeout(() => toast.classList.remove("translate-y-2", "opacity-0"), 40);
                          setTimeout(() => {
                            toast.classList.add("translate-y-2", "opacity-0");
                            setTimeout(() => toast.remove(), 300);
                          }, 2000);
                        }}
                        className="mt-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-[10px] py-1.5 rounded-lg transition-all cursor-pointer text-center w-full shadow-sm flex items-center justify-center gap-1"
                      >
                        <span>📋</span> 复制当前选中的销冠回复选项
                      </button>
                    </div>

                    {/* 销冠心占战术拆解 */}
                    {salesEngineResult.analysis && (
                      <div className="border-t border-dashed border-zinc-200 dark:border-zinc-800 pt-2.5 mt-0.5">
                        <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider block mb-1">💡 销冠思维拆解指南：</span>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal pl-1.5 border-l-2 border-emerald-500 font-sans">
                          {salesEngineResult.analysis}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-zinc-500 dark:text-zinc-450 text-[10px] italic py-3 text-center bg-zinc-50/70 dark:bg-zinc-950/45 rounded-lg border border-dashed border-zinc-250 dark:border-zinc-800 leading-relaxed">
                    💡 暂未检测到客户最新对话。请触发左侧聊天，销冠思维引擎将自动过滤空文和噪点，分析客户意图与情绪防抖一键匹配智库报价！
                  </div>
                )}
              </div>
            </div>
          )}

      {/* 聊天区域 */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-4"
        style={{ scrollBehavior: "smooth" }}
      >
        {messages.length === 0 ? (
          <div className={`flex flex-col items-center text-center gap-4 py-8 px-4 border border-dashed rounded-xl m-4 shadow-sm transition-colors duration-250 ${
            isDark ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-800"
          }`}>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <h4 className={`text-xs font-bold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>欢迎进入 AI 网页知识库</h4>
              <p className={`text-[11px] mt-1 max-w-[240px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                我已经是您的本地专有 AI 知识脑库。尝试向我提出关于本文档的任意问题吧。
              </p>
            </div>
            
            {/* 启发预置提问 */}
            <div className="flex flex-col gap-1.5 w-full border-t border-zinc-150 pt-3">
              <span className="text-[10px] text-zinc-400 text-left font-semibold">推荐探索提问：</span>
              <button
                type="button"
                onClick={() => setUserInput("提炼当前页面的产品核心卖点与客户痛点")}
                className={`text-left border text-[11px] p-2 rounded-lg transition-colors truncate cursor-pointer ${
                  isDark 
                    ? "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-emerald-800 hover:bg-emerald-950/20" 
                    : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                💡 提炼当前页面的产品核心卖点与客户痛点
              </button>
              <button
                type="button"
                onClick={() => setUserInput("针对这篇文档的内容，帮我生成一份给客户的微信话术")}
                className={`text-left border text-[11px] p-2 rounded-lg transition-colors truncate cursor-pointer ${
                  isDark 
                    ? "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-emerald-800 hover:bg-emerald-950/20" 
                    : "bg-zinc-50 border-zinc-200 text-zinc-650 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                💡 针对这篇文档的内容，帮我生成一份给客户的微信话术
              </button>
              <button
                type="button"
                onClick={() => setUserInput("检查当前网页的报价信息是否与我 Supabase 记忆库中的历史政策冲突")}
                className={`text-left border text-[11px] p-2 rounded-lg transition-colors truncate cursor-pointer ${
                  isDark 
                    ? "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-emerald-800 hover:bg-emerald-950/20" 
                    : "bg-zinc-50 border-zinc-200 text-zinc-650 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                💡 检查当前网页的报价信息是否与我 Supabase 记忆库中的历史政策冲突
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] animation-fadeIn ${
                msg.sender === "user" ? "self-end items-end" : "self-start items-start"
              }`}
            >
              {/* 日志标识 */}
              <span className="text-[10px] text-zinc-400 font-medium px-1 mb-1 block">
                {msg.sender === "user" ? "您提问" : "Agnes AI"}{" "}
                <span className="font-mono text-[9px] text-zinc-300">• {msg.timestamp}</span>
              </span>

              {/* 泡沫框 */}
              <div
                className={`rounded-xl px-3.5 py-2 text-xs leading-relaxed break-words overflow-x-auto ${
                  msg.sender === "user"
                    ? isDark
                      ? "bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-tr-none shadow-md"
                      : "bg-zinc-800 text-white rounded-tr-none shadow-xs"
                    : isDark
                      ? "bg-zinc-900 border border-zinc-800 text-zinc-250 rounded-tl-none shadow-md text-zinc-100"
                      : "bg-white border border-zinc-200 text-zinc-800 rounded-tl-none shadow-sm"
                }`}
              >
                {msg.sender === "user" ? (
                  renderFormattedText(msg.text)
                ) : (
                  <>
                    {/* 双路智选召回关联相似度可信度评级条 */}
                    <ConfidenceScoreBar sources={msg.sources} cloudMemories={msg.cloudMemories} isDark={isDark} />
                    
                    <ReactMarkdown
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          return !match ? (
                            <code className={`text-xs px-1.5 py-0.5 rounded-md font-mono border ${
                              isDark ? "bg-zinc-800 border-zinc-700 text-zinc-300" : "bg-zinc-100 border-zinc-205 text-zinc-800"
                            }`} {...props}>
                              {children}
                            </code>
                          ) : (
                            <pre className="bg-zinc-950 text-emerald-400 p-2.5 rounded-lg overflow-x-auto text-[11px] font-mono leading-relaxed my-2 max-w-full">
                              <code className={className}>{children}</code>
                            </pre>
                          );
                        },
                        p({ children }) {
                          return <p className="mb-2 last:mb-0 leading-relaxed font-sans">{children}</p>;
                        },
                        ul({ children }) {
                          return <ul className="list-disc pl-4 mb-2 flex flex-col gap-1 font-sans">{children}</ul>;
                        },
                        ol({ children }) {
                          return <ol className="list-decimal pl-4 mb-2 flex flex-col gap-1 font-sans">{children}</ol>;
                        },
                        li({ children }) {
                          return <li className="mb-0.5 leading-relaxed">{children}</li>;
                        },
                        strong({ children }) {
                          return <strong className="font-semibold text-zinc-900">{children}</strong>;
                        }
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>

                    <div className="mt-2 pt-2 border-t border-zinc-100/65 flex justify-end">
                      <button
                        onClick={() => handleSaveToCloudMemory(msg.id, msg.text, webpageUrl)}
                        disabled={savingStatus[msg.id] === "saving"}
                        className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all flex items-center gap-1 cursor-pointer focus:outline-none ${
                          savingStatus[msg.id] === 'success'
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : savingStatus[msg.id] === 'saving'
                            ? "bg-zinc-100 text-zinc-400 border border-zinc-200 animate-pulse"
                            : "bg-zinc-50 hover:text-emerald-700 hover:bg-emerald-50 text-zinc-500 border border-zinc-200 active:bg-zinc-100"
                        }`}
                        title="将此条 AI 的回答内容固化存入 Supabase 云端向量长期记忆库中"
                      >
                        {savingStatus[msg.id] === "success" ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-600" />
                            已沉淀至商业智库
                          </>
                        ) : savingStatus[msg.id] === "saving" ? (
                          <>
                            <RotateCw className="w-2.5 h-2.5 animate-spin text-zinc-400" />
                            正在归档...
                          </>
                        ) : (
                          <>
                            <Database className="w-2.5 h-2.5 text-zinc-400" />
                            将此条业务回复存入智库
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 网页来源片段列表（折叠区域） */}
              {msg.sender === "ai" && msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2 w-full pl-1">
                  <button
                    onClick={() => toggleSource(msg.id)}
                    className="text-[10px] font-bold text-zinc-400 hover:text-emerald-600 flex items-center gap-1.5 select-none transition-colors self-start cursor-pointer focus:outline-none"
                    aria-expanded={!!expandedSources[msg.id]}
                  >
                    <span className="text-[8px] transform transition-transform duration-250 inline-block font-mono">
                      {expandedSources[msg.id] ? "▼" : "▶"}
                    </span>
                    <span>🎯 网页召回匹配 Top 3 分块 (点击查看内容并选择性保存)</span>
                  </button>
                  
                  {expandedSources[msg.id] && (
                    <div className="flex flex-col gap-1.5 transition-all duration-300 animation-fadeIn mt-1">
                      {msg.sources.map((src) => {
                        const chunkSaveId = `${src.chunk.id}-${msg.id}`;
                        return (
                          <div
                            key={src.chunk.id}
                            className={`border rounded-md p-2 text-[10px] cursor-help transition-all w-full ${
                              isDark 
                                ? "bg-zinc-900 hover:bg-emerald-950/20 border-zinc-800 hover:border-emerald-900 text-zinc-400" 
                                : "bg-zinc-100/70 hover:bg-emerald-50 border border-zinc-200/80 hover:border-emerald-200 text-zinc-500"
                            }`}
                            title="点击左侧网页分块可查看对齐原文。"
                            onClick={() => {
                              // 点击滚动对齐
                              const card = document.getElementById(`ui-chunk-card-${src.chunk.id}`);
                              if (card) {
                                card.scrollIntoView({ behavior: "smooth", block: "center" });
                              }
                            }}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-semibold text-[9px] px-1 py-0.2 rounded ${
                                isDark ? "text-emerald-400 bg-emerald-950/40" : "text-emerald-600 bg-emerald-100/50"
                              }`}>
                                排名 #{src.rank} Score: {src.score}
                              </span>
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleSaveToCloudMemory(chunkSaveId, src.chunk.text, webpageUrl)}
                                  disabled={savingStatus[chunkSaveId] === "saving"}
                                  className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-all flex items-center gap-0.5 focus:outline-none cursor-pointer ${
                                    savingStatus[chunkSaveId] === "success"
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse"
                                      : savingStatus[chunkSaveId] === "saving"
                                      ? "bg-zinc-200 text-zinc-400 border border-zinc-300"
                                      : isDark
                                        ? "bg-zinc-800 hover:text-emerald-400 hover:bg-emerald-950/20 text-zinc-300 border-zinc-700"
                                        : "bg-white hover:text-emerald-700 hover:bg-emerald-50 text-zinc-500 border border-zinc-200"
                                  }`}
                                  title="固化当前页面片段到长期记忆库，供以后在其他页面触发跨域 RAG 召回"
                                >
                                  {savingStatus[chunkSaveId] === "success" ? (
                                    <>
                                      <Check className="w-2 h-2 text-emerald-600" />
                                      已安全存档
                                    </>
                                  ) : savingStatus[chunkSaveId] === "saving" ? (
                                    <>
                                      <RotateCw className="w-2 h-2 animate-spin text-zinc-400" />
                                      正在同步...
                                    </>
                                  ) : (
                                    <>
                                      <Database className="w-2 h-2 text-zinc-400" />
                                      存入商业智库
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                            <p className={`text-[10px] leading-relaxed font-sans ${
                              isDark ? "text-zinc-350" : "text-zinc-650"
                            }`}>
                              {src.chunk.text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 云端长期记忆命中展示 */}
                  {msg.cloudMemories && msg.cloudMemories.length > 0 && (
                    <div className="mt-2 text-[10px] w-full border-t border-dashed border-zinc-200 dark:border-zinc-800 pt-1.5 text-left">
                      <button
                        onClick={() => toggleCloudMemory(msg.id)}
                        className={`font-semibold py-1 flex items-center justify-between w-full hover:underline font-sans cursor-pointer ${
                          isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-700 hover:text-blue-850"
                        }`}
                      >
                        <span className="flex items-center gap-1 text-[11px]">
                          ⚡ 长期库合并命中 ({msg.cloudMemories.length} 记忆片段)
                        </span>
                        <span className="text-[9px]">{expandedCloudMemories[msg.id] ? "收起" : "展开"}</span>
                      </button>

                      {expandedCloudMemories[msg.id] && (
                        <div className="flex flex-col gap-1.5 transition-all duration-300 animate-fadeIn mt-1 text-left">
                          {msg.cloudMemories.map((mem: any, memIdx: number) => (
                            <div 
                              key={mem.id || memIdx}
                              className={`border rounded-lg p-2 text-[10px] leading-relaxed ${
                                isDark 
                                  ? "bg-zinc-900 border-zinc-800 text-zinc-400" 
                                  : "bg-blue-50/25 border-blue-100 text-zinc-600"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5 font-mono text-[8px] text-zinc-400">
                                <span># 命中度: {mem.similarity ? (mem.similarity * 100).toFixed(1) + "%" : "默认对照"}</span>
                                {mem.url && (
                                  <span className="truncate max-w-[125px] hover:underline" title={mem.url}>
                                    🔗 {mem.url.split('//')[1]?.split('/')[0] || "长期关联"}
                                  </span>
                                )}
                              </div>
                              <p className="font-normal">{mem.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

          {/* 模型载入加载态 */}
          {loading && (
            <div className="flex flex-col max-w-[85%] self-start items-start animation-fadeIn">
              <span className="text-[10px] text-zinc-450 font-medium px-1 mb-1 block">
                Agnes AI正在匹配检索中...
              </span>
              <div className={`border text-xs leading-relaxed rounded-xl rounded-tl-none p-3.5 shadow-xs ${
                isDark ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-white border-zinc-200 text-zinc-650"
              }`}>
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部输入框 */}
        <div className={`p-3 border-t shrink-0 ${isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"}`}>
          <form onSubmit={handleFormSubmit} className="flex gap-2 items-center">
            <input
              id="sp-user-input"
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  if (userInput.trim() && !loading) {
                    e.preventDefault();
                    handleFormSubmit(e);
                  }
                }
              }}
              disabled={loading}
              placeholder="向 AI 提问有关本标签页的问题 (按回车或发送)..."
              className={`flex-1 border rounded-xl px-3.5 py-2 text-xs placeholder-zinc-400 focus:outline-none focus:border-emerald-500 transition-all ${
                isDark ? "bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-550 focus:bg-zinc-850" : "bg-zinc-100 border-zinc-200 text-zinc-805 placeholder-zinc-400 focus:bg-white"
              }`}
            />
            <button
              id="sp-send-btn"
              type="submit"
              disabled={loading || !userInput.trim()}
              className="bg-emerald-500 disabled:bg-zinc-200 text-white p-2.5 rounded-xl transition-all shadow-sm hover:bg-emerald-600 disabled:shadow-none flex items-center justify-center shrink-0 min-w-[38px] min-h-[38px]"
            >
              {loading ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </form>
        </div>
      </>)}

      {/* 2. ☁️ 记忆管理 tab */}
      {activeTab === "memory" && (
        <div className={`flex-1 flex flex-col overflow-hidden transition-colors duration-200 ${
          isDark ? "bg-zinc-950 text-zinc-100" : "bg-white text-zinc-800"
        }`}>
          {/* 搜索控制栏 */}
          <div className={`p-3 flex gap-2 shrink-0 border-b transition-colors duration-200 ${
            isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-100"
          }`}>
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={memorySearchQuery}
                onChange={(e) => setMemorySearchQuery(e.target.value)}
                placeholder="搜索已存入 Supabase 的记忆片段..."
                className={`text-xs rounded-lg pl-8 pr-2.5 py-1.5 w-full focus:outline-none focus:border-emerald-500 font-sans transition-colors duration-200 ${
                  isDark ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"
                }`}
              />
            </div>
            
            <button 
              onClick={exportMemoriesToCSV}
              disabled={memoriesList.length === 0}
              className={`p-1.5 rounded-lg border cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors ${
                isDark 
                  ? "bg-zinc-800 border-zinc-700 text-emerald-400 hover:bg-zinc-750" 
                  : "bg-white border-zinc-200 text-emerald-600 hover:bg-emerald-50/50"
              }`}
              title="导出当前库中全部记忆片段至 CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button 
              onClick={() => fetchMemories(memorySearchQuery)}
              className={`p-1.5 rounded-lg border cursor-pointer focus:outline-none transition-colors ${
                isDark ? "bg-zinc-850 border-zinc-750" : "bg-white border-zinc-200"
              }`}
              title="刷新列表"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${memoriesLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* 选项卡说明贴心提示 */}
          <div className={`px-4 py-2 text-[10px] leading-normal flex items-start gap-1.5 shrink-0 border-b transition-colors duration-200 ${
            isDark ? "bg-blue-950/20 border-blue-900/30 text-blue-400" : "bg-blue-50/50 border-blue-100 text-blue-700"
          }`}>
            <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            <span>
              双路问答可以随时交叉检索以下 <strong>Supabase 云长期向量记忆片段</strong>。开启「自动同步」时，每个访问网页的精华内容均会自动入库分析。
            </span>
          </div>

          {/* === Google Drive / Picker RAG Integration Panel === */}
          <div className={`p-3 mx-3 mt-3 border rounded-xl flex flex-col gap-2.5 transition-all duration-200 shadow-3xs ${
            isDark 
              ? "bg-zinc-900/60 border-zinc-800 text-zinc-200" 
              : "bg-emerald-50/20 border-emerald-100 text-zinc-850"
          }`}>
            <div className="flex items-start justify-between gap-2 text-left">
              <div className="flex items-center gap-1.5">
                <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                  isDark ? "bg-emerald-950/40 text-emerald-400" : "bg-emerald-50/80 text-emerald-600"
                }`}>
                  <Database className="w-3.5 h-3.5 shrink-0" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold leading-none">Google Drive 知识云端直连</span>
                  <span className="text-[9px] text-zinc-400 font-mono mt-0.5">Cross-File RAG Q&A</span>
                </div>
              </div>
              
              {/* Connection Status Badge */}
              {googleUser ? (
                <div className="flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-[9px] text-emerald-500 font-bold font-sans">已连接</span>
                </div>
              ) : (
                <span className="text-[9px] text-zinc-400 font-medium font-sans">未连接</span>
              )}
            </div>

            {!googleUser ? (
              <div className="flex flex-col gap-2.5">
                <p className="text-[10px] text-zinc-400 leading-normal text-left">
                  授权连接您的 Google Drive 账户后，您可以直接点击按钮唤起 <strong>Google Picker</strong>，选择并一键导入您的 PDF、文档或表格。后台系统将进行模型高精度提取和语义分块嵌入，使 Jin Yang RAG 可以对它们实现跨源联合问答！
                </p>
                
                {/* Google login Button */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium cursor-pointer flex items-center justify-center gap-2 border shadow-sm transition-all duration-150 ${
                    isDark 
                      ? "bg-zinc-805 hover:bg-zinc-750 border-zinc-700 text-zinc-200 hover:border-zinc-650" 
                      : "bg-white hover:bg-zinc-50 border-zinc-250 text-zinc-700"
                  }`}
                >
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-3.5 h-3.5 shrink-0">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                  <span>使用 Google 账号授权连接</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {googleUser.photoURL ? (
                      <img src={googleUser.photoURL} alt="Avatar" referrerPolicy="no-referrer" className="w-5 h-5 rounded-full border border-emerald-500/30" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-[9px] font-bold">
                        {googleUser.email ? googleUser.email[0].toUpperCase() : "G"}
                      </div>
                    )}
                    <span className="text-[10px] text-zinc-400 font-medium truncate max-w-[170px]" title={googleUser.email || ""}>
                      {googleUser.email || "已连接谷歌服务"}
                    </span>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    className="text-[9px] hover:underline text-red-500 cursor-pointer focus:outline-none"
                  >
                    断开连接
                  </button>
                </div>

                {/* Primary Picker Launcher */}
                <button
                  type="button"
                  onClick={handleOpenPicker}
                  className="w-full py-2 px-3 rounded-xl text-xs leading-none font-bold bg-emerald-500 hover:bg-emerald-600 hover:shadow-xs active:scale-99 text-white cursor-pointer transition-all duration-150 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  唤起 Google Picker 选择云端文件
                </button>
              </div>
            )}

            {/* Live Progress feedback Panel */}
            {importStatus !== "idle" && (
              <div className={`p-2 rounded-lg text-[10px] text-left leading-normal border flex items-start gap-1.5 animate-fadeIn ${
                importStatus === "importing" 
                  ? `${isDark ? "bg-amber-950/20 border-amber-900/30 text-amber-400" : "bg-amber-50 border-amber-100 text-amber-700"}`
                  : importStatus === "success"
                  ? `${isDark ? "bg-emerald-950/20 border-emerald-900/30 text-emerald-400" : "bg-emerald-50 border-emerald-100 text-emerald-700"}`
                  : `${isDark ? "bg-red-950/20 border-red-900/30 text-red-400" : "bg-red-50 border-red-100 text-red-700"}`
              }`}>
                {importStatus === "importing" && <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0 mt-0.5" />}
                {importStatus === "success" && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />}
                {importStatus === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                <span className="flex-1 break-words">{importMsg}</span>
              </div>
            )}
          </div>

          {/* 列表主体 */}
          <div className={`flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 transition-colors duration-200 ${
            isDark ? "bg-zinc-950" : "bg-zinc-50/40"
          }`}>
            {memoriesLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-zinc-400 animate-pulse">
                <RotateCw className="w-5 h-5 animate-spin text-emerald-500" />
                <span className="text-[11px]">正在从 Supabase 提取长期记忆资料库...</span>
              </div>
            ) : memoriesList.length === 0 ? (
              <div className={`flex flex-col items-center justify-center text-center py-16 px-4 gap-3 border border-dashed rounded-xl m-1 transition-colors ${
                isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-dashed border-zinc-200"
              }`}>
                <Database className="w-8 h-8 text-zinc-300" />
                <div className="flex flex-col gap-1">
                  <span className={`text-xs font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>没有查找到任何长期记忆</span>
                  <p className={`text-[10px] max-w-[200px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    您的云长期向量数据库中暂无词条记录，或搜索词未命中。请在下方开启 <strong>Auto-Sync 自动同步</strong> 或者向 AI 提问来自动归纳记忆！
                  </p>
                </div>
              </div>
            ) : (
              memoriesList.map((mem) => {
                return (
                  <div 
                    key={mem.id}
                    className={`border rounded-xl p-3 shadow-3xs hover:shadow-2xs transition-all relative ${
                      isDark ? "bg-zinc-900 border-zinc-800/80 hover:border-emerald-900" : "bg-white border-zinc-200/60 hover:border-emerald-200"
                    }`}
                  >
                    <div className="flex gap-3 justify-between items-start">
                      {/* Left: Metadata and content text */}
                      <div className="flex-1 min-w-0">
                        <div className={`flex items-center gap-2 mb-1.5 pb-1 border-b text-[9px] text-zinc-400 font-mono ${
                          isDark ? "border-zinc-800/60" : "border-zinc-100/60"
                        }`}>
                          <span>📅 {new Date(mem.created_at).toLocaleString('zh-CN', { hour12: false })}</span>
                          {mem.url && (
                            <a 
                              href={mem.url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className={`px-1.5 py-0.5 rounded hover:underline max-w-[130px] truncate ${
                                isDark ? "text-blue-400 bg-blue-950/20" : "text-blue-500 bg-blue-50"
                              }`}
                              title={mem.url}
                            >
                              🔗 {mem.url.split('//')[1]?.split('/')[0] || "网页来源"}
                            </a>
                          )}
                        </div>
                        <p className={`text-[11px] font-sans leading-relaxed break-words font-normal text-left ${
                          isDark ? "text-zinc-300" : "text-zinc-700"
                        }`}>
                          {mem.content}
                        </p>
                      </div>

                      {/* Right: Actions, specifically the delete icon on the side of the list item */}
                      <div className="shrink-0 self-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMemoryToDelete(mem.id);
                          }}
                          title="删除该长期切片记忆"
                          className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer focus:outline-none shrink-0 border border-transparent hover:border-red-500/10"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 自动同步配置底座 */}
          <div className={`p-3 flex flex-col gap-1.5 shrink-0 border-t ${
            isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50 border-zinc-200"
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                ⚡ Auto-Sync to Memory (自动同步模式)
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={autoSync} 
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-8 h-4 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
            <p className="text-[9px] text-zinc-400 leading-relaxed">
              启用后，侧边栏会自动将您浏览过的网页生成 1536 维 向量，并在后台一键同步保存至云端，实现浏览免手工持久化。
            </p>
          </div>
        </div>
      )}

      {/* Persistent Diagnostic Status Panel at the bottom */}
      <div 
        id="sp-bottom-diagnostic-bar"
        className={`border-t px-3 py-2 flex items-center justify-between text-[11px] font-sans shrink-0 z-10 select-none transition-colors duration-200 ${
          isDark ? "bg-zinc-950 border-zinc-900 text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-650"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              dbStats.connected ? "bg-emerald-400" : "bg-red-400"
            }`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              dbStats.connected ? "bg-emerald-500" : "bg-red-500"
            }`}></span>
          </span>
          <span className={`font-semibold text-[10px] truncate max-w-[105px] ${
            dbStats.connected 
              ? "text-emerald-700 dark:text-emerald-400" 
              : "text-red-650 dark:text-red-400"
          }`}>
            {dbStats.connected ? `连接正常` : `通信脱机`}
          </span>
          {dbStats.connected && (
            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono">
              ({dbStats.latencyMs || 22}ms)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 font-mono text-[10px] min-w-0 truncate">
          <span className="flex items-center gap-1 shrink-0" title="长期向量记忆总块数">
            <Database className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
            <span>{dbStats.totalCount ?? 0}块</span>
          </span>

          <span className="flex items-center gap-1.5 shrink-0" title={`预估云端 pgvector 占用开销: ${dbStats.estimatedMemoryUsage ?? "0 KB"} / 15 MB 物理额度`}>
            <HardDrive className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
            <div className="w-8 bg-zinc-200 dark:bg-zinc-800 h-1 rounded-full overflow-hidden shrink-0 inline-block">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  memoryUtilizationPct > 80 ? "bg-red-500" : memoryUtilizationPct > 50 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${memoryUtilizationPct}%` }}
              ></div>
            </div>
            <strong className={`font-bold shrink-0 ${isDark ? "text-zinc-300" : "text-zinc-650"}`}>
              {memoryUtilizationPct}%
            </strong>
          </span>

          <button
            onClick={fetchStats}
            disabled={statsLoading}
            className={`p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-850 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer shrink-0`}
            title="立即触发心跳检测与配额刷新"
          >
            <RefreshCw className={`w-2.5 h-2.5 text-zinc-400 ${statsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  </div>
  );
}

// ==========================================
// 1. 双路 RAG 相似度可信度评级可视化组件
// ==========================================
interface ConfidenceScoreBarProps {
  sources?: SearchResult[];
  cloudMemories?: CloudMemory[];
  isDark?: boolean;
}

export function ConfidenceScoreBar({ sources = [], cloudMemories = [], isDark = false }: ConfidenceScoreBarProps) {
  if (sources.length === 0 && cloudMemories.length === 0) return null;

  // 计算本地网页分块最高的匹配分数
  const maxLocalScore = sources.length > 0 
    ? Math.max(...sources.map(s => s.score))
    : 0;
  
  // 做 0-100 阶梯映射 (如果是 Cosine/TF-IDF 分数进行归一处理呈现)
  const localConfidence = Math.min(100, Math.max(0, Math.round(maxLocalScore * 100)));

  // 计算 Supabase  pgvector 最高的相似度匹配分数 (Cosine 距离下，通常为相似度 0.0 - 1.0)
  const maxCloudScore = cloudMemories.length > 0 
    ? Math.max(...cloudMemories.map(m => m.similarity))
    : 0;
  const cloudConfidence = Math.min(100, Math.max(0, Math.round(maxCloudScore * 100)));

  const hasLocal = sources.length > 0;
  const hasCloud = cloudMemories.length > 0;

  // 综合评断及回答倾向性建议
  let recommendation = "";
  if (hasLocal && hasCloud) {
    if (localConfidence > cloudConfidence + 8) {
      recommendation = "当前最新活动网页提供了极强的时效背景。建议以此页数据为准。";
    } else if (cloudConfidence > localConfidence + 8) {
      recommendation = "云端 pgvector 长期记忆高度契合历史上下文，提供了坚固的佐证。";
    } else {
      recommendation = "两路数据协同（当前网页 + 长期记忆）融会贯通，置信度极高。";
    }
  } else if (hasLocal) {
    recommendation = "答案仅提炼、参考自当前正在浏览网页的近场匹配段落。";
  } else if (hasCloud) {
    recommendation = "答案完全参考自您之前在其他站点保存存盘的长期记忆。";
  }

  return (
    <div className={`border rounded-xl p-3 my-2.5 flex flex-col gap-2 font-sans overflow-hidden transition-colors duration-200 ${
      isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-50/70 border-zinc-150"
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
          <Activity className="w-3 h-3 text-emerald-500" />
          知识源双路匹配可信度
        </span>
        <span className="text-[9px] text-zinc-400 font-mono">Similarity Confidence</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {/* 本地活动网页 */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className={`flex items-center gap-1.5 font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              当前活跃网页 (本地 RAG)
            </span>
            <span className="font-mono font-bold text-emerald-600">{hasLocal ? `${localConfidence}%` : "未命召 0%"}</span>
          </div>
          <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800/80" : "bg-zinc-200/60"}`}>
            <div 
              className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${hasLocal ? localConfidence : 0}%` }}
            />
          </div>
        </div>

        {/* Supabase 长期记忆 */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className={`flex items-center gap-1.5 font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              长期向量库记忆 (云端 pgvector)
            </span>
            <span className="font-mono font-bold text-blue-500">{hasCloud ? `${cloudConfidence}%` : "无交叉 0%"}</span>
          </div>
          <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800/80" : "bg-zinc-200/60"}`}>
            <div 
              className="bg-blue-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${hasCloud ? cloudConfidence : 0}%` }}
            />
          </div>
        </div>
      </div>

      {recommendation && (
        <div className={`text-[10px] p-2 rounded-lg leading-relaxed mt-1 flex items-start gap-1 transition-colors duration-200 ${
          isDark ? "text-zinc-400 bg-zinc-850 border border-zinc-800" : "text-zinc-550 bg-white border border-zinc-100"
        }`}>
          <span className="shrink-0 text-emerald-500">💡</span>
          <span>{recommendation}</span>
        </div>
      )}
    </div>
  );
}
