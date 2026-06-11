async function main() {
  console.log("Keys:");
  console.log(Object.keys(process.env).filter(k => 
    k.includes("API") || k.includes("KEY") || k.includes("SUPABASE") || k.includes("AGNES") || k.includes("GEMINI")
  ));
}
main();
