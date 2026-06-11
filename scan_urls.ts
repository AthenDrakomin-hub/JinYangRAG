import fs from 'fs';

function main() {
  const content = fs.readFileSync("893-07d0e519ba1ca131.js", "utf-8");
  const regex = /https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}[^\s"']*/g;
  const matches = Array.from(new Set(content.match(regex)));
  console.log("Found URLs in 893:", matches);
}

main();