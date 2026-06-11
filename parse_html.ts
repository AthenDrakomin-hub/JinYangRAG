import fs from 'fs';

async function main() {
  console.log("Parsing HTML of doc/overview...");
  const res = await fetch("https://agnes-ai.com/doc/overview");
  const html = await res.text();
  
  // Save HTML to check it locally
  fs.writeFileSync("overview.html", html);
  console.log("Saved HTML to overview.html");
  
  // Let's print all scripts and tags
  const lines = html.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("<script") || line.includes("<link rel=\"preload\"") || line.includes("self.__next_f.push")) {
      console.log(`Line ${i}:`, line.substring(0, 150));
    }
  }
}
main();
