import { createFileRoute } from "@tanstack/react-router";
import { verifiedBearer, authFailureMessage } from "../../lib/api-auth";

// Suggests a spending category + short label for a transaction description,
// using the Lovable AI Gateway (OpenAI Responses API, streamed and read to the end here).

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

export const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Housing",
  "Utilities",
  "Health",
  "Shopping",
  "Entertainment",
  "Travel",
  "Education",
  "Insurance",
  "Fees & Charges",
  "Investments",
  "Income",
  "Other",
];

const SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: CATEGORIES },
    label: { type: "string", description: "Clear spending label, 2-5 words" },
  },
  required: ["category", "label"],
  additionalProperties: false,
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readOutputText(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let refused = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "response.output_text.delta") text += evt.delta || "";
          if (evt.type === "response.refusal.delta") refused = true;
          if (evt.type === "error" || evt.type === "response.failed") {
            throw new Error(evt.error?.message || evt.response?.error?.message || "AI request failed");
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }
  return { text, refused };
}

export const Route = createFileRoute("/api/categorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = await verifiedBearer(request);
        if (!token) return json({ error: authFailureMessage(request) }, 401);

        let description = "";
        let amount = null;
        try {
          const body = await request.json();
          description = typeof body?.description === "string" ? body.description.trim() : "";
          if (typeof body?.amount === "number" && Number.isFinite(body.amount)) amount = body.amount;
        } catch {
          return json({ error: "Invalid request" }, 400);
        }
        if (!description || description.length > 300) {
          return json({ error: "Enter a description (up to 300 characters)" }, 400);
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return json({ error: "AI suggestions are not configured on this server" }, 500);

        const prompt =
          `Transaction description: "${description}"` +
          (amount !== null ? `\nAmount: ${amount}` : "") +
          "\nChoose the best category and write a clear, human-friendly spending label (2-5 words, Title Case, no amounts).";

        let upstream;
        try {
          upstream = await fetch(GATEWAY_URL, {
            method: "POST",
            signal: request.signal,
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": apiKey,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: MODEL,
              stream: true,
              store: false,
              reasoning: { effort: "low", summary: "auto" },
              include: ["reasoning.encrypted_content"],
              instructions: "You categorize personal finance transactions. Reply only with the requested JSON.",
              input: prompt,
              text: { format: { type: "json_schema", name: "suggestion", strict: true, schema: SCHEMA } },
            }),
          });
        } catch (error) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          console.error("AI gateway unreachable", error);
          return json({ error: "The AI service is unavailable" }, 502);
        }

        if (!upstream.ok) {
          const text = await upstream.text();
          let message = "AI suggestion failed";
          try {
            message = JSON.parse(text)?.error?.message || JSON.parse(text)?.message || message;
          } catch {
            /* keep default */
          }
          if (upstream.status === 429) message = "Too many requests — try again in a moment.";
          if (upstream.status === 402) message = message || "AI credits are exhausted.";
          return json({ error: message }, upstream.status);
        }

        try {
          const { text, refused } = await readOutputText(upstream.body);
          if (refused || !text) return json({ error: "No suggestion was returned for this description" }, 422);
          const parsed = JSON.parse(text);
          return json({ category: parsed.category, label: parsed.label }, 200);
        } catch (error) {
          console.error("AI suggestion parse failed", error);
          return json({ error: error.message || "AI suggestion failed" }, 502);
        }
      },
    },
  },
});
