import fs from 'fs';

async function testDoc(path: string) {
  console.log(`\n================= Testing path: ${path} =================`);
  try {
    const res = await fetch(`https://agnes-ai.com/${path}`, {
      headers: {
        "RSC": "1"
      }
    });
    const text = await res.text();
    console.log(`Length for ${path}:`, text.length);
    if (text.length > 300) {
      // Find keywords
      const keywords = ["embedding", "v1/", "embeddings", "completions", "models", "route", "000201", "3764a189"];
      for (const kw of keywords) {
        const idx = text.indexOf(kw);
        if (idx !== -1) {
          console.log(`FOUND keyword "${kw}" in RSC payload of ${path}`);
          const start = Math.max(0, idx - 150);
          const end = Math.min(text.length, idx + 150);
          console.log(`Context near "${kw}":\n`, text.substring(start, end));
          console.log("------------------------");
        }
      }
      fs.writeFileSync(`${path.replace(/\//g, '_')}_rsc.txt`, text);
    }
  } catch (err) {
    console.error(`Error fetching ${path}:`, err);
  }
}

async function main() {
  const paths = [
    "doc/overview",
    "doc/agnes-15-flash",
    "doc/agnes-20-flash",
    // Common API and docs paths
    "doc/api-reference",
    "doc/embeddings",
    "doc/embedding",
    "doc/v1",
    "doc/quickstart",
  ];
  for (const p of paths) {
    await testDoc(p);
  }
}

main();
