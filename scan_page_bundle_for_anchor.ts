import fs from 'fs';

function main() {
  const content = fs.readFileSync("page-99a6337288c2bfda.js", "utf-8");
  console.log("Length of page-99a6337288c2bfda.js:", content.length);
  
  const keywords = ["3764a189", "embeddings", "embedding", "completions", "v1/embeddings", "v1/chat/completions", "000201", "route not found"];
  for (const kw of keywords) {
    const idx = content.indexOf(kw);
    if (idx !== -1) {
      console.log(`FOUND "${kw}" inside page bundle at index ${idx}`);
      console.log("Context:", content.substring(idx - 200, idx + 200).replace(/\s+/g, ' '));
    } else {
      console.log(`"${kw}" not found inside page bundle`);
    }
  }
}

main();
