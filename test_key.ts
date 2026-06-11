import dotenv from 'dotenv';
dotenv.config();

async function testWithKey(path: string) {
  const apiKey = process.env.GEMINI_API_KEY || ''; // Let's check what the active key in ENV is
  console.log(`Testing with API Key length: ${apiKey.length}`);
  try {
    const res = await fetch(`https://api.agnes-ai.com${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "text-embedding-3-small", // or alternative
        input: "hello"
      })
    });
    console.log(`Path: ${path} => Status: ${res.status}`);
    const data = await res.json();
    console.log(`Response:`, JSON.stringify(data));
  } catch (err: any) {
    console.log(`Path: ${path} => Error: ${err.message}`);
  }
}

async function main() {
  await testWithKey("/v1/chat/completions");
  await testWithKey("/v1/embeddings");
}

main();
