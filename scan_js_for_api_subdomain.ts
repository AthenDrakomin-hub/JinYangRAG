import fs from 'fs';

function main() {
  const files = fs.readdirSync(".");
  for (const f of files) {
    if (f.endsWith(".js") || f.endsWith(".html") || f.endsWith(".txt")) {
      const content = fs.readFileSync(f, "utf-8");
      const idx = content.indexOf("api.agnes-ai.com");
      if (idx !== -1) {
        console.log(`Found "api.agnes-ai.com" in file ${f} at index ${idx}`);
        console.log("Context:", content.substring(idx - 100, idx + 200).replace(/\s+/g, ' '));
      }
    }
  }
}

main();
