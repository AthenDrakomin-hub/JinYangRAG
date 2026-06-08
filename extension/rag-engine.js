/**
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
      const sentenceEndIndex = remainingWindow.search(/[。！？；.!?;\n]/);
      if (sentenceEndIndex !== -1 && (end - 50 + sentenceEndIndex) > cursor) {
        end = end - 50 + sentenceEndIndex + 1;
      }
    }
    
    const chunkTextStr = text.substring(cursor, end).trim();
    if (chunkTextStr.length > 10) { // 略过过小的无意义片段
      chunks.push({
        id: `chunk-${index}`,
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
  const cleanChinese = normalized.replace(/[^\u4e00-\u9fa5]/g, "");
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
