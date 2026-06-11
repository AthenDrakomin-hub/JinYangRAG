import fs from "fs";

function main() {
  const files = fs.readdirSync(".");
  
  const keywords = ["api.agnes-ai.com", "v1/embeddings", "/v1/", "Bearer", "Authorization", "Agnes-1.5-Flash", "text-embedding"];
  
  for (const file of files) {
    if (file.endsWith(".js")) {
      const content = fs.readFileSync(file, "utf-8");
      
      for (const kw of keywords) {
        let idx = -1;
        let occurrences = 0;
        while ((idx = content.indexOf(kw, idx + 1)) !== -1) {
          occurrences++;
          if (occurrences <= 5) {
            const start = Math.max(0, idx - 150);
            const end = Math.min(content.length, idx + 200);
            console.log(`\nFOUND "${kw}" in ${file} at index ${idx}:`);
            console.log(`...${content.substring(start, end).replace(/\s+/g, ' ')}...`);
            console.log("------------------------");
          }
        }
      }
    }
  }
}

main();
