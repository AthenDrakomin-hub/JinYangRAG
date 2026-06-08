export interface Article {
  id: string;
  title: string;
  url: string;
  category: string;
  content: string;
}

export const SIMULATED_ARTICLES: Article[] = [
  {
    id: "rag-intro",
    title: "什么是 RAG (检索增强生成) 架构？",
    url: "https://zh.wikipedia.org/wiki/检索增强生成",
    category: "技术百科",
    content: `检索增强生成 (Retrieval-Augmented Generation, RAG) 是当前生成式人工智能中的黄金架构技术。
由于大语言模型 (LLM) 的训练数据存在时间窗口边界，且难以掌握非公开的专有知识，极易造成“一本正经地胡说八道”的幻觉。
RAG 的基本理念是在模型推理前，先通过搜索引擎或向量检索算法，在本地语料库或网页中抓取最相关的背景资料。
接着，系统将提取出的知识文本同用户的原始提问共同包装拼接（即 Prompt Engineering），随后提交给大尺寸模型推理。
这样模型便能够“像开卷考试一样”，对照着可靠、最新的实时参考文档给出准确的作答，其问答效果卓越，广泛应用于客服系统及各类知识库问答工具中。`
  },
  {
    id: "chrome-sp",
    title: "Chrome 扩展程序：开发 Side Panel 侧边面板入门",
    url: "https://developer.chrome.com/docs/extensions/reference/api/sidePanel",
    category: "开发文档",
    content: `Chrome 网页浏览器在 Manifest V3 中正式推出了 sidePanel API，这使得开发者可以常驻一个右侧或左侧的系统侧边交互栏。
相较于 Popup 弹出框一失焦就自动关闭的物理缺陷，Side Panel 表现出极佳的连贯性、极强的复用度和持久的使用寿命，是最适合做 AI 助手、RAG 面板以及网页翻译翻译扩展的界面容器。
在清单文件 manifest.json 中，开发者需要声明 "sidePanel" 权限，并指定默认加载路径及匹配的站点。
随后，通过 background.js 后台脚本监听 chrome.action.onClicked 事件，或者在浏览器安装时使用 chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }) 即可确保点击插件图标时默认直接划入侧边对话框，无需任何繁复的手动点击触发。`
  },
  {
    id: "cosine-similarity",
    title: "关于向量相似度计算：余弦相似度 (Cosine Similarity) 释义",
    url: "https://zh.wikipedia.org/wiki/余弦相似度",
    category: "数学原理",
    content: `余弦相似度是衡量两个标度向量间方向夹角的算学指标。
它通过求取两个实数向量夹角的余弦值，来表示其向量属性相似的程度。余弦值为 1 标示两个向量重合、方向相同，表明相关性极高；值为 0 则证明两个向量相互垂直，毫无共有特性；值为 -1 指代方向完全相反。
在文本检索和轻型 RAG 工作流中，我们可以先将查询词和所有的句子切段提取特定的文本特征，然后将每项特征的出现频率视为一个独立维度，构成高维词频向量。
两个文本词频向量之间的点积除以各自的模长(欧几里得范数)所得出的余弦度数，即为检索相似度得分。
该匹配算法完全运行于 CPU 极其底层的数据结构，耗时通常只需零点几微秒，不需要加载庞大且昂贵的矩阵运算库即可对网页短文本完成极致速度的本地搜寻。`
  },
  {
    id: "gemini-flash",
    title: "Google Gemini 3.5 Flash 创新大模型特性深度介绍",
    url: "https://ai.google.dev/models/gemini",
    category: "前沿模型",
    content: `Google Gemini 3.5 Flash 是专为大规模轻盈化设计 and 极速多模态推理精雕细琢的高性能轻量大尺寸模型。
Gemini 3.5 Flash 拥有一流的多模态理解眼界，能够在单个会话中流畅解读海量文本、视频、高保真长音频，以及精细图形元素。
它提供了巨大的百万级 Token (Million-token) 默认上下文容量，使得分析数十万字的长文档或者几小时的视频变得唾手可得。
此外，Gemini 3.5 Flash 在时效控制和硬件开销取得了极度微妙的平衡，其在常态长问答和结构化 RAG 复杂知识检索过滤上响应迅捷，相较于上一代延迟降低达 40% 以上。
配合高效的系统指令(System Instructions)功能，可以非常精确地让模型承担严厉的角色限制，是开发者进行在线 RAG 开发、问答引擎设计的最理想、性价比最高的大语言模型。`
  },
  {
    id: "wechat-web-im",
    title: "企业微信网页版 IM 智能客资管理工作台",
    url: "https://work.weixin.qq.com/webim/chat",
    category: "在线客服IM",
    content: `[客户聊天视窗] 企业微信网页版联机客服。
客户咨询：“请问贵公司 RAG 的 pgvector 向量搜索对私有化部署收费标准是多少？并发限制如何？”
当前网页充当 IM 客服系统的聊天视窗，该窗口结构中富含支持金牌业务员的聊天泡泡及消息流记录。
本系统将自主通过前端 MutationObserver 对此 IM 区块执行实时消息捕获，并联动 Supabase pgvector 本地知识库和 Gemini，在侧边栏为您实时呈现“金牌销售推荐话术推荐”，大幅提升客户成交概率。`
  }
];
