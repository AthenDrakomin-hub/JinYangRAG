import fs from 'fs';

function main() {
  const content = fs.readFileSync("893-07d0e519ba1ca131.js", "utf-8");
  
  // Find "home.menu.api.apiPlatform" and let's find n.c definition before it or after it
  const idx = content.indexOf("apiPlatform");
  if (idx !== -1) {
    console.log("apiPlatform chunk:\n", content.substring(idx - 1000, idx + 1000));
  }
}

main();
