import fs from 'fs';

function main() {
  const files = fs.readdirSync(".");
  for (const f of files) {
    if (f.endsWith(".js")) {
      const text = fs.readFileSync(f, "utf-8");
      
      const idx1 = text.indexOf("embeddings");
      if (idx1 !== -1) {
        console.log(`FOUND "embeddings" in file ${f} at index ${idx1}`);
        console.log("Context:", text.substring(idx1 - 100, idx1 + 100).replace(/\s+/g, ' '));
      }
      
      const idx2 = text.indexOf("embedding");
      if (idx2 !== -1 && idx2 !== idx1) {
        console.log(`FOUND "embedding" in file ${f} at index ${idx2}`);
        console.log("Context:", text.substring(idx2 - 100, idx2 + 100).replace(/\s+/g, ' '));
      }
      
      const idx3 = text.indexOf("v1/");
      if (idx3 !== -1) {
        console.log(`FOUND "v1/" in file ${f} at index ${idx3}`);
        console.log("Context:", text.substring(idx3 - 100, idx3 + 100).replace(/\s+/g, ' '));
      }
    }
  }
}

main();
