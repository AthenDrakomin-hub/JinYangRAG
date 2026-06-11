import fs from 'fs';

async function main() {
  const html = fs.readFileSync("overview.html", "utf-8");
  const regex = /self\.__next_f\.push\(([\s\S]*?)\)/g;
  let match;
  let count = 0;
  while ((match = regex.exec(html)) !== null) {
    count++;
    console.log(`\nMatch #${count}:`);
    console.log(match[1].substring(0, 300));
  }
}

main();
