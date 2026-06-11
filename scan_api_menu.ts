import fs from 'fs';

async function main() {
  const content = fs.readFileSync("893-07d0e519ba1ca131.js", "utf-8");
  
  // Find "home.menu.api" or variable b definitions
  const matchIdx = content.indexOf("home.menu.api");
  if (matchIdx !== -1) {
    console.log("Found home.menu.api near index:", matchIdx);
    console.log(content.substring(matchIdx - 300, matchIdx + 700).replace(/\s+/g, ' '));
  } else {
    console.log("home.menu.api not found, let's search for general items definition...");
    // Just search for strings with "/doc/" and print them
    const matches = content.matchAll(/["']\/doc\/[^"']+["']/g);
    const set = new Set<string>();
    for (const match of matches) {
      set.add(match[0]);
    }
    console.log("Matched doc paths:", Array.from(set));
  }
}

main();
