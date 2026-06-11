import fs from 'fs';

async function main() {
  const html = fs.readFileSync("overview.html", "utf-8");
  console.log("Length:", html.length);
  console.log("Middle block:\n", html.substring(1500, 7500));
}

main();
