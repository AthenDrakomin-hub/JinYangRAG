import fs from 'fs';

async function main() {
  const files = fs.readdirSync(".");
  for (const f of files) {
    if (f.endsWith(".js") || f.endsWith(".txt")) {
      const stats = fs.statSync(f);
      console.log(`File: ${f} => Size: ${stats.size} bytes`);
    }
  }
}

main();
