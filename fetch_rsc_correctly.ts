import fs from 'fs';

async function fetchPath(path: string) {
  console.log(`\n================ FETCHING: ${path} ================`);
  try {
    const res = await fetch(`https://agnes-ai.com${path}`, {
      headers: {
        "accept": "text/x-component",
        "next-router-state-tree": "%5B%5D",
        "next-url": path,
        "rsc": "1",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response length:", text.length);
    fs.writeFileSync(`rsc_response_${path.replace(/\//g, '_')}.txt`, text);
    
    const keywords = ["embedding", "v1/", "bearer", "embeddings", "completions", "models", "route", "3764a189"];
    for (const kw of keywords) {
      let idx = -1;
      let occurrences = 0;
      while ((idx = text.toLowerCase().indexOf(kw.toLowerCase(), idx + 1)) !== -1) {
        occurrences++;
        if (occurrences <= 10) {
          console.log(`[${kw}] found at index ${idx}:`);
          const start = Math.max(0, idx - 120);
          const end = Math.min(text.length, idx + 150);
          console.log(`...${text.substring(start, end).replace(/\s+/g, ' ')}...`);
          console.log("------------------------");
        }
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
    await fetchPath(p);
  }
}

main();
