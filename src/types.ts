export interface TextChunk {
  id: string;
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
}

export interface SearchResult {
  chunk: TextChunk;
  score: number;
  rank: number; // 1, 2, 3
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  sources?: SearchResult[];
  cloudMemories?: CloudMemory[];
}

export interface CloudMemory {
  id: string;
  content: string;
  url?: string;
  similarity: number;
  created_at?: string;
}

export interface WebpageData {
  title: string;
  url: string;
  content: string;
}

export interface ExtensionFile {
  name: string;
  path: string;
  description: string;
  content: string;
  language: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  webpageUrl: string;
  timestamp: string;
}

