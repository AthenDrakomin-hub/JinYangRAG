import fs from "fs";

function extractAllStrings(obj: any, list: string[]) {
  if (typeof obj === "string") {
    if (obj.trim().length > 0) {
      list.push(obj);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      extractAllStrings(item, list);
    }
  } else if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      extractAllStrings(obj[key], list);
    }
  }
}

function dumpFile(filePath: string) {
  console.log(`\n=================== DUMP: ${filePath} ===================`);
  if (!fs.existsSync(filePath)) {
    console.error(`File ${filePath} does not exist.`);
    return;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const list: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const part = line.substring(colonIdx + 1);
    try {
      const parsed = JSON.parse(part);
      extractAllStrings(parsed, list);
    } catch {
      // Ignore
    }
  }
  
  // Clean dups and print sequentially
  const clean = Array.from(new Set(list));
  console.log(clean.join("\n"));
}

dumpFile("doc_embedding_rsc.txt");
dumpFile("doc_embeddings_rsc.txt");
