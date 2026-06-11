import fs from 'fs';

function main() {
  const content = fs.readFileSync("893-07d0e519ba1ca131.js", "utf-8");
  
  // Find "api.svg" which is right next to n.c index. Let's find n definition in the nearby function arguments or imports
  const matches = content.match(/function\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\)/g);
  console.log("Functions found:", matches?.slice(0, 5));
  
  // Let's search for " n=" or ",n=" in the nearby text preceding "home.menu.api.title"
  const idx = content.indexOf("home.menu.api.title");
  if (idx !== -1) {
    const sliceBefore = content.substring(idx - 1500, idx);
    console.log("Preceding 1500 characters of home.menu.api.title:\n", sliceBefore);
  }
}

main();
