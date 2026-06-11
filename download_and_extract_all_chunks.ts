import fs from 'fs';

async function main() {
  const html = fs.readFileSync("overview.html", "utf-8");
  
  // Find all script tags
  const scripts: string[] = [];
  const regex = /src="([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1].startsWith("/_next/")) {
      scripts.push("https://agnes-ai.com" + match[1]);
    }
  }
  
  console.log(`Scanning ${scripts.length} scripts for any embedding/api details...`);
  
  for (const scriptUrl of scripts) {
    const filename = scriptUrl.split('/').pop() || 'temp.js';
    let sText = "";
    if (fs.existsSync(filename)) {
      sText = fs.readFileSync(filename, "utf-8");
    } else {
      try {
        const sRes = await fetch(scriptUrl);
        sText = await sRes.text();
        fs.writeFileSync(filename, sText);
      } catch (e: any) {
        console.error(`Failed to fetch ${scriptUrl}:`, e.message);
        continue;
      }
    }
    
    // Search for keywords
    const keywords = ["embedding", "v1/", "embeddings", "completions", "models", "route", "3764a189"];
    for (const kw of keywords) {
      let idx = -1;
      while ((idx = sText.indexOf(kw, idx + 1)) !== -1) {
        console.log(`\nFOUND "${kw}" in ${filename} at index ${idx}`);
        const start = Math.max(0, idx - 150);
        const end = Math.min(sText.length, idx + 150);
        console.log(sText.substring(start, end).replace(/\s+/g, ' '));
        console.log("------------------------");
      }
    }
  }
}

main();
