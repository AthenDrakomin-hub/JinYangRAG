import fs from 'fs';

async function main() {
  const html = fs.readFileSync("overview.html", "utf-8");
  
  // Find all string occurrences of model names, paths, URLs or API-related phrases
  const regex = /["']([^"']{3,100})["']/g;
  let match;
  const urls: string[] = [];
  const paths: string[] = [];
  const models: string[] = [];
  
  while ((match = regex.exec(html)) !== null) {
    const val = match[1];
    if (val.includes("http") || val.includes(".com")) {
      urls.push(val);
    }
    if (val.includes("/v1/") || val.startsWith("/") && val.length > 3 && !val.includes("static")) {
      paths.push(val);
    }
    if (val.includes("Agnes") || val.includes("agnes")) {
      models.push(val);
    }
  }
  
  console.log("Found URLs:", Array.from(new Set(urls)).slice(0, 30));
  console.log("Found Paths:", Array.from(new Set(paths)).slice(0, 30));
  console.log("Found Models:", Array.from(new Set(models)).slice(0, 30));
  
  // Let's also do a search on common Chinese keywords
  const keywords = ["提示", "配置", "接口", "endpoint", "URL", "model", "模型", "embeddings", "embedding", "v1"];
  for (const kw of keywords) {
    let idx = -1;
    while ((idx = html.indexOf(kw, idx + 1)) !== -1) {
      console.log(`FOUND "${kw}" at index ${idx}`);
      const start = Math.max(0, idx - 100);
      const end = Math.min(html.length, idx + 100);
      console.log("Context:", html.substring(start, end).replace(/\n/g, ' '));
      console.log("------------------------");
    }
  }
}

main();
