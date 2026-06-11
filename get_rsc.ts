// using native fetch
async function main() {
  console.log("Fetching RSC payload of overview...");
  try {
    const res = await fetch("https://agnes-ai.com/doc/overview", {
      headers: {
        "RSC": "1"
      }
    });
    const text = await res.text();
    console.log("Length of RSC payload:", text.length);
    
    // Search for keywords in the RSC payload
    const keywords = ["embedding", "v1/", "embeddings", "completions", "models", "route", "000201", "3764a189"];
    for (const kw of keywords) {
      const idx = text.indexOf(kw);
      if (idx !== -1) {
        console.log(`FOUND keyword "${kw}" in RSC payload`);
        const start = Math.max(0, idx - 150);
        const end = Math.min(text.length, idx + 150);
        console.log(`Context near "${kw}":\n`, text.substring(start, end));
        console.log("------------------------");
      }
    }
    
    // Save to file for further inspection if not found
    if (text.length > 0) {
      const fs = require('fs');
      fs.writeFileSync("rsc_payload.txt", text);
      console.log("Saved RSC payload to rsc_payload.txt");
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
