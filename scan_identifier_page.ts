import fs from 'fs';

async function main() {
  const url = "https://agnes-ai.com/_next/static/chunks/app/doc/%5Bidentifier%5D/page-99a6337288c2bfda.js";
  console.log("Fetching identifier page script...");
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log("Length of page chunk:", text.length);
    
    // Check if there are other strings or models inside
    const keywords = ["agnes", "Agnes", "v1", "post", "POST", "fetch", "model", "embed"];
    for (const kw of keywords) {
      const idx = text.indexOf(kw);
      if (idx !== -1) {
        console.log(`FOUND keyword "${kw}"`);
        const start = Math.max(0, idx - 150);
        const end = Math.min(text.length, idx + 150);
        console.log(`Context near "${kw}":\n`, text.substring(start, end));
        console.log("------------------------");
      }
    }
    
    // Save to local file
    fs.writeFileSync("identifier_page_chunk.js", text);
    console.log("Saved script chunk to identifier_page_chunk.js");
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
