import fs from "fs";

function extractStrings(obj: any, strings: Set<string>) {
  if (typeof obj === "string") {
    if (obj.trim().length > 4) {
      strings.add(obj);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      extractStrings(item, strings);
    }
  } else if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      extractStrings(obj[key], strings);
    }
  }
}

function processFile(filePath: string) {
  console.log(`\n================ ${filePath} ================`);
  const content = fs.readFileSync(filePath, "utf-8");
  const strings = new Set<string>();
  
  // RSC content can have multiple lines with format: "id:JSON"
  const lines = content.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const part = line.substring(colonIdx + 1);
    try {
      const parsed = JSON.parse(part);
      extractStrings(parsed, strings);
    } catch {
      // Ignore parse errors for raw lines
    }
  }

  // Print strings containing keywords
  const sorted = Array.from(strings);
  const keywords = ["endpoint", "embeddings", "v1", "bearer", "api-key", "token", "model", "url", "header", "sk-", "agnes"];
  
  for (const str of sorted) {
    const lower = str.toLowerCase();
    if (keywords.some(kw => lower.includes(kw))) {
      console.log(`- ${str}`);
    }
  }
}

function main() {
  const files = fs.readdirSync(".");
  for (const f of files) {
    if (f.startsWith("doc_") && f.endsWith(".txt")) {
      processFile(f);
    }
  }
}

main();
