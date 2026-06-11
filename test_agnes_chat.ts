import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || ''; // Let's check what the active key in ENV is
  console.log(`Testing Chat with API Key length: ${apiKey.length}`);
  try {
    const res = await fetch("https://api.agnes-ai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "Agnes-2.0-Flash",
        messages: [
          { role: "user", content: "hello" }
        ],
        temperature: 0.3
      })
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (err: any) {
    console.error("Error:", err);
  }
}
main();
