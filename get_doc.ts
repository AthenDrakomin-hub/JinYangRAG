// using native fetch

async function main() {
  console.log("Fetching doc HTML...");
  const res = await fetch("https://agnes-ai.com/doc/overview");
  const html = await res.text();
  
  // Find all script tags
  const scripts: string[] = [];
  const regex = /src="([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1].startsWith("/_next/")) {
      scripts.push("https://agnes-ai.com" + match[1]);
    }
  }
  
  console.log("Scripts found:", scripts);
  
  // Search for embedding / embeddings / url in scripts
  for (const scriptUrl of scripts) {
    try {
      console.log("Fetching script:", scriptUrl);
      const sRes = await fetch(scriptUrl);
      const sText = await sRes.text();
      
      const keywords = ["embedding", "v1/", "embeddings", "completions", "models", "route", "000201", "3764a189"];
      for (const kw of keywords) {
        if (sText.includes(kw)) {
          console.log(`FOUND keyword "${kw}" in ${scriptUrl}`);
          
          // Print surrounding context
          const idx = sText.indexOf(kw);
          const start = Math.max(0, idx - 150);
          const end = Math.min(sText.length, idx + 150);
          console.log(`Context near "${kw}":\n`, sText.substring(start, end));
          console.log("------------------------");
        }
      }
    } catch (e) {
      console.error("Error for script", scriptUrl, e);
    }
  }
}

main();
