import fs from 'fs';

async function main() {
  const html = fs.readFileSync("overview.html", "utf-8");
  console.log("Size:", html.length);
  console.log("Last 6000 characters:\n", html.substring(Math.max(0, html.length - 6000)));
}

main();
