import fs from 'fs';

function main() {
  const files = fs.readdirSync(".");
  for (const f of files) {
    if (f.endsWith(".js")) {
      const content = fs.readFileSync(f, "utf-8");
      // Search for any occurrence resembling agnes api or platform url endpoints
      const index = content.indexOf("platform.agnes");
      if (index !== -1) {
        console.log(`Found "platform.agnes" in ${f} near index ${index}:`);
        console.log(content.substring(index - 200, index + 400).replace(/\s+/g, ' '));
        console.log("------------------------");
      }
      const index2 = content.indexOf("api.agnes");
      if (index2 !== -1) {
        console.log(`Found "api.agnes" in ${f} near index ${index2}:`);
        console.log(content.substring(index2 - 200, index2 + 400).replace(/\s+/g, ' '));
        console.log("------------------------");
      }
    }
  }
}

main();