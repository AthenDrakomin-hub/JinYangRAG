async function testRoute(path: string) {
  try {
    const res = await fetch(`https://api.agnes-ai.com${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer TEST_KEY"
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: "hello"
      })
    });
    console.log(`Path: ${path} => Status: ${res.status}`);
    const data = await res.json();
    console.log(`Response:`, JSON.stringify(data));
  } catch (err: any) {
    if (err.message && err.message.includes("invalid json")) {
      console.log(`Path: ${path} => Status: unknown, other format`);
    } else {
      console.log(`Path: ${path} => Error: ${err.message}`);
    }
  }
}

async function main() {
  const routes = [
    "/v1/embeddings",
    "/v1/embedding",
    "/embeddings",
    "/embedding",
    "/v1/embed",
    "/v1/vectors",
    "/v1/text-embeddings",
    "/v1/chat/completions" // to confirm completions works
  ];
  for (const r of routes) {
    await testRoute(r);
  }
}

main();
