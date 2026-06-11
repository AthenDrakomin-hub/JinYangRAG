import fs from 'fs';

async function main() {
  const html = fs.readFileSync("overview.html", "utf-8");
  console.log("HTML length:", html.length);
  
  // Find all next_f pushes
  const matches = html.matchAll(/self\.__next_f\.push\(\[1,"([^"]+)"\]\)/g);
  let count = 0;
  for (const match of matches) {
    count++;
    const content = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    
    const keywords = ["embedding", "v1/", "embeddings", "completions", "models", "route", "000201", "3764a189"];
    for (const kw of keywords) {
      if (content.includes(kw)) {
        console.log(`\n--- Match #${count} contains keyword "${kw}" ---`);
        const idx = content.indexOf(kw);
        const start = Math.max(0, idx - 150);
        const end = Math.min(content.length, idx + 150);
        console.log(content.substring(start, end));
      }
    }
  }
}

main();
