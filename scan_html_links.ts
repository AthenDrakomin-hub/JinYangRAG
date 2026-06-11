import fs from 'fs';

async function main() {
  const html = fs.readFileSync("overview.html", "utf-8");
  
  // Find all file references with extensions
  const matches = html.matchAll(/["']([^"']+\.(md|json|html|js|css|png|jpg|jpeg|svg|webp))["']/gi);
  const matchedFiles = new Set<string>();
  for (const match of matches) {
    matchedFiles.add(match[1]);
  }
  console.log("Matched files:");
  console.log(Array.from(matchedFiles));
  
  // Find any URL containing "api"
  const apiMatches = html.matchAll(/https?:\/\/[^\s"']+/gi);
  const matchedApis = new Set<string>();
  for (const match of apiMatches) {
    if (match[0].toLowerCase().includes("api")) {
      matchedApis.add(match[0]);
    }
  }
  console.log("\nMatched APIs:");
  console.log(Array.from(matchedApis));
}

main();
