import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const apiKey = process.env.AGNES_API_KEY || process.env.GEMINI_API_KEY || '';
  console.log(`Querying models with API key length: ${apiKey.length}`);
  
  try {
    const res = await fetch("https://api.agnes-ai.com/api/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });
    
    console.log("Status:", res.status);
    const json = await res.json();
    console.log("Models Response:", JSON.stringify(json, null, 2));
  } catch (err: any) {
    console.error("Error fetching models:", err);
  }
}

main();
