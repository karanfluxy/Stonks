/**
 * Standalone test script for Hugging Face Space Gradio API integration.
 * Run with: node scripts/test_hf_integration.js
 */

const HF_STOCK_MODEL_URL = "https://raghav6753-chatbot.hf.space";
const HF_STOCK_MODEL_API_NAME = "answer";

async function testHFIntegration() {
  console.log("Starting Hugging Face API test...");

  const testPayload = {
    previousChat: "",
    stockData: "CRM | Price: $295.40 | P/E: 42.5",
    newsData: "Salesforce announces a major push into AI-driven CRM tools to increase enterprise productivity.",
    question: "As a beginner, why is Salesforce pushing into AI?"
  };

  try {
    const baseUrl = HF_STOCK_MODEL_URL;
    const apiName = HF_STOCK_MODEL_API_NAME;

    console.log(`Step 1: POST to ${baseUrl}/gradio_api/call/${apiName}`);
    const postRes = await fetch(`${baseUrl}/gradio_api/call/${apiName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [testPayload.previousChat, testPayload.stockData, testPayload.newsData, testPayload.question]
      })
    });

    if (!postRes.ok) {
      throw new Error(`HF POST failed: ${postRes.status} ${postRes.statusText}`);
    }

    const { event_id } = await postRes.json();
    console.log(`Event ID received: ${event_id}`);

    if (!event_id) throw new Error("No event_id in response");

    console.log(`Step 2: GET poll ${baseUrl}/gradio_api/call/${apiName}/${event_id}`);
    const getRes = await fetch(`${baseUrl}/gradio_api/call/${apiName}/${event_id}`);

    if (!getRes.ok) {
      throw new Error(`HF result fetch failed: ${getRes.status} ${getRes.statusText}`);
    }

    const sseText = await getRes.text();
    console.log("Raw SSE response received.");

    const lines = sseText.split('\n');
    const dataLine = lines.find((line) => line.startsWith('data: '));

    if (!dataLine) throw new Error("No data line in SSE response");

    const jsonStr = dataLine.replace('data: ', '');
    const parsed = JSON.parse(jsonStr);
    let answer = Array.isArray(parsed) ? parsed[0] : parsed;

    console.log("--- Original Answer ---");
    console.log(answer);

    // Cleanup logic
    answer = answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    console.log("\n--- Cleaned Answer ---");
    console.log(answer);

    if (answer.toLowerCase().includes("ai") || answer.toLowerCase().includes("salesforce")) {
      console.log("\n✅ Test Passed: Response seems relevant.");
    } else {
      console.warn("\n⚠️ Test Warning: Response might not be relevant or is empty.");
    }

  } catch (error) {
    console.error("\n❌ Test Failed:", error.message);
  }
}

testHFIntegration();
