async function main() {
  const res = await fetch("https://agnes-ai.com/doc/overview");
  console.log("Status:", res.status);
  console.log("Headers:");
  for (const [k, v] of res.headers.entries()) {
    console.log(`  ${k}: ${v}`);
  }
}
main();
