import { TextChunk, SearchResult } from "../types";

/**
 * TypeScript version of our premium local RAG Client-side engine
 */

export function chunkText(text: string, chunkSize = 450, overlapSize = 100): TextChunk[] {
  if (!text || text.trim().length === 0) return [];
  
  const chunks: TextChunk[] = [];
  let index = 0;
  let cursor = 0;
  
  while (cursor < text.length) {
    let end = Math.min(cursor + chunkSize, text.length);
    
    if (end < text.length) {
      const remainingWindow = text.substring(end - 50, end + 50);
      const sentenceEndIndex = remainingWindow.search(/[。！？；.!?;\n]/);
      if (sentenceEndIndex !== -1 && (end - 50 + sentenceEndIndex) > cursor) {
        end = end - 50 + sentenceEndIndex + 1;
      }
    }
    
    const chunkTextStr = text.substring(cursor, end).trim();
    if (chunkTextStr.length > 10) {
      chunks.push({
        id: `chunk-${index}`,
        index: index,
        text: chunkTextStr,
        charStart: cursor,
        charEnd: end
      });
      index++;
    }
    
    cursor = end - overlapSize;
    if (cursor >= text.length || end === text.length) break;
    if (cursor <= 0 || cursor <= chunks[chunks.length - 1].charStart) {
      cursor = end;
    }
  }
  
  return chunks;
}

export function getTermFrequency(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  if (!text) return tf;

  const normalized = text.toLowerCase().trim();
  
  // English words
  const englishWords = normalized.match(/[a-z0-9]+/g) || [];
  for (const word of englishWords) {
    if (word.length > 1) {
      tf.set(word, (tf.get(word) || 0) + 1.2);
    }
  }

  // Chinese standard Bi-Grams
  const cleanChinese = normalized.replace(/[^\u4e00-\u9fa5]/g, "");
  for (let i = 0; i < cleanChinese.length - 1; i++) {
    const biGram = cleanChinese.substring(i, i + 2);
    tf.set(biGram, (tf.get(biGram) || 0) + 1.0);
  }
  
  // Chinese Uni-Grams
  for (let i = 0; i < cleanChinese.length; i++) {
    const uniGram = cleanChinese.charAt(i);
    tf.set(uniGram, (tf.get(uniGram) || 0) + 0.3);
  }

  return tf;
}

export function calculateCosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const [term, freqA] of vecA.entries()) {
    magnitudeA += freqA * freqA;
    if (vecB.has(term)) {
      dotProduct += freqA * vecB.get(term)!;
    }
  }

  for (const freqB of vecB.values()) {
    magnitudeB += freqB * freqB;
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

export function searchSimilarChunks(query: string, chunks: TextChunk[], topN = 3): SearchResult[] {
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
  
  const sorted = results
    .sort((a, b) => b.score - a.score)
    .filter(item => item.score > 0)
    .slice(0, topN);
    
  return sorted.map((item, i) => ({
    chunk: item.chunk,
    score: Number(item.score.toFixed(4)),
    rank: i + 1
  }));
}
