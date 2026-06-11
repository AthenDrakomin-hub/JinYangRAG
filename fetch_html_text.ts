import fs from 'fs';

async function fetchHtml(path: string) {
  console.log(`\n================ FETCHING HTML: ${path} ================`);
  try {
    const res = await fetch(`https://agnes-ai.com${path}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    console.log("Status:", res.status);
    const html = await res.text();
    console.log("HTML length:", html.length);
    fs.writeFileSync(`html_response_${path.replace(/\//g, '_')}.html`, html);
    
    // Search for keywords
    const keywords = [
      "embeddings", 
      "embedding", 
      "text-embedding", 
      "completions", 
      "v1/embeddings", 
      "v1/chat/completions",
      "model",
      "token",
      "Bearer"
    ];
    
    // Simple text search in HTML
    for (const kw of keywords) {
      let idx = -1;
      let occurrences = 0;
      while ((idx = html.toLowerCase().indexOf(kw.toLowerCase(), idx + 1)) !== -1) {
        occurrences++;
        if (occurrences <= 8) {
          console.log(`[${kw}] found at index ${idx}:`);
          const start = Math.max(0, idx - 100);
          const end = Math.min(html.length, idx + 150);
          console.log(`...${html.substring(start, end).replace(/\s+/g, ' ')}...`);
          console.log("------------------------");
        }
      }
      if (occurrences > 0) {
        console.log(`Total occurrences of "${kw}": ${occurrences}`);
      }
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

async function main() {
  const paths = [
    "/doc/overview",
    "/doc/embeddings",
    "/doc/embedding",
    "/doc/api-reference",
    "/doc/v1",
    "/doc/quickstart"
  ];
  for (const p of paths) {
    await fetchHtml(p);
  }
}

main();
