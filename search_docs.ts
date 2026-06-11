import fs from 'fs';

function main() {
  const files = fs.readdirSync(".");
  for (const f of files) {
    if (f.startsWith("doc_") && f.endsWith(".txt")) {
      const content = fs.readFileSync(f, "utf-8");
      if (content.includes("https://") || content.includes("api/v1") || content.includes("v1/") || content.includes("embeddings") || content.includes("Agnes")) {
        console.log(`=== File: ${f} ===`);
        // Find positions of "https" or "v1" or "embedding" and print around them
        const terms = ["https://", "v1/", "embeddings", "embedding", "completions", "Bearer"];
        for (const term of terms) {
          let idx = -1;
          while ((idx = content.indexOf(term, idx + 1)) !== -1) {
            const start = Math.max(0, idx - 100);
            const end = Math.min(content.length, idx + 200);
            console.log(`[${term}]: ...${content.substring(start, end).replace(/\s+/g, ' ')}...`);
            console.log("---");
          }
        }
      }
    }
  }
}

main();