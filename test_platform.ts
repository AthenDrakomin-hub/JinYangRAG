import dotenv from 'dotenv';
dotenv.config();

async function testPlatformHost(path: string) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  console.log(`Testing https://platform.agnes-ai.com${path} with key length: ${apiKey.length}`);
  try {
    const res = await fetch(`https://platform.agnes-ai.com${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "Agnes-2.0-Flash",
        messages: [{ role: "user", content: "hello" }],
        temperature: 0.3
      })
    });
    console.log(`Path: ${path} => Status: ${res.status}`);
    const text = await res.text();
    console.log("Response:", text.slice(0, 300));
  } catch (err: any) {
    console.error("Error:", err);
  }
}

async function testPlatformEmbed(path: string) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  console.log(`Testing embeddings at https://platform.agnes-ai.com${path}`);
  try {
    const res = await fetch(`https://platform.agnes-ai.com${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: "hello"
      })
    });
    console.log(`Path: ${path} => Status: ${res.status}`);
    const text = await res.text();
    console.log("Response:", text.slice(0, 300));
  } catch (err: any) {
    console.error("Error:", err);
  }
}

async function main() {
  await testPlatformHost("/v1/chat/completions");
  await testPlatformEmbed("/v1/embeddings");
  await testPlatformEmbed("/v1/embedding");
}

main();