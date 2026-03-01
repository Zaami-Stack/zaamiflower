const { getStore } = require("./_store");
const { dbRequest, ensureSeedFlowers, isDatabaseConfigured } = require("./_db");
const { json, methodNotAllowed, readJsonBody } = require("./_utils");

const CHAT_MAX_MESSAGE_LENGTH = 500;
const CHAT_MAX_HISTORY_ITEMS = 10;
const CHAT_HISTORY_ENTRY_LENGTH = 500;
const WHATSAPP_CHAT_URL = "https://wa.me/212775094615";

function normalizeChatPayload(body) {
  const message = String(body?.message || "").trim();
  if (!message) {
    throw new Error("message is required");
  }
  if (message.length > CHAT_MAX_MESSAGE_LENGTH) {
    throw new Error(`message must be ${CHAT_MAX_MESSAGE_LENGTH} characters or less`);
  }

  const history = Array.isArray(body?.history) ? body.history : [];
  const normalizedHistory = history
    .slice(-CHAT_MAX_HISTORY_ITEMS)
    .map((entry) => {
      const role = entry?.role === "assistant" ? "assistant" : "user";
      const content = String(entry?.content || "").trim().slice(0, CHAT_HISTORY_ENTRY_LENGTH);
      return {
        role,
        content
      };
    })
    .filter((entry) => Boolean(entry.content));

  return {
    message,
    history: normalizedHistory
  };
}

function extractOpenAiText(payload) {
  const directText = String(payload?.output_text || "").trim();
  if (directText) {
    return directText;
  }

  const outputBlocks = Array.isArray(payload?.output) ? payload.output : [];
  const contentParts = outputBlocks.flatMap((block) =>
    Array.isArray(block?.content) ? block.content : []
  );
  const text = contentParts
    .map((part) => String(part?.text || part?.output_text || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return text;
}

function formatCatalog(flowers, limit = 4) {
  const inStock = flowers
    .filter((flower) => Number(flower?.stock || 0) > 0)
    .slice(0, limit);

  if (inStock.length === 0) {
    return "No flowers currently in stock.";
  }

  return inStock
    .map(
      (flower) =>
        `${flower.name} ($${Number(flower.price || 0).toFixed(2)}, ${flower.occasion}, stock ${
          flower.stock
        })`
    )
    .join("; ");
}

function buildLocalChatReply(message, flowers) {
  const normalized = String(message || "").toLowerCase();
  const inStock = flowers.filter((flower) => Number(flower?.stock || 0) > 0);
  const cheapestFlower = [...inStock].sort((a, b) => Number(a.price) - Number(b.price))[0];
  const featured = inStock.slice(0, 3);

  if (/(hello|hi|hey|good morning|good evening)/i.test(normalized)) {
    return "Hi! I can help with bouquets, prices, delivery, and checkout. What are you shopping for today?";
  }

  if (/(delivery|ship|shipping|same day|arrive)/i.test(normalized)) {
    return "We provide same-day delivery based on availability and schedule. Share your area and preferred time and we can guide the best option.";
  }

  if (/(payment|paypal|cash|card|pay)/i.test(normalized)) {
    return "You can checkout with Cash on Delivery or PayPal. Orders are created as Pending, then payment status can be updated by admin.";
  }

  if (/(price|cost|cheap|budget|afford)/i.test(normalized)) {
    if (cheapestFlower) {
      return `Our current budget-friendly option is ${cheapestFlower.name} at $${Number(
        cheapestFlower.price
      ).toFixed(2)}. I can also suggest options by occasion.`;
    }
    return "I can help with pricing, but I do not see in-stock items right now.";
  }

  const occasionMatch = [
    ["romance", /(romance|romantic|love|anniversary|valentine)/i],
    ["birthday", /(birthday|bday)/i],
    ["wedding", /(wedding|bridal|bride)/i],
    ["thank-you", /(thank|gratitude|appreciation)/i],
    ["general", /(general|any occasion|everyday)/i]
  ].find(([, pattern]) => pattern.test(normalized));

  if (occasionMatch) {
    const matching = inStock.filter((flower) => flower.occasion === occasionMatch[0]).slice(0, 3);
    if (matching.length > 0) {
      return `Great choice. For ${occasionMatch[0]} I recommend ${matching
        .map((flower) => `${flower.name} ($${Number(flower.price).toFixed(2)})`)
        .join(", ")}.`;
    }
    return `We currently have limited stock for ${occasionMatch[0]} bouquets. I can suggest alternatives from other categories.`;
  }

  if (/(contact|phone|whatsapp|support|agent|human)/i.test(normalized)) {
    return `You can reach our team on WhatsApp for direct help: ${WHATSAPP_CHAT_URL}`;
  }

  if (featured.length > 0) {
    return `Top picks right now: ${featured
      .map((flower) => `${flower.name} ($${Number(flower.price).toFixed(2)})`)
      .join(", ")}. Tell me your occasion and budget for a sharper recommendation.`;
  }

  return "I can help with bouquets, delivery, pricing, and checkout. Ask me anything about your order.";
}

async function requestOpenAiChatReply({ message, history, flowers }) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }

  const model = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  const systemPrompt = [
    "You are Flyethr's flower shop assistant.",
    "Keep responses concise and practical (under 90 words when possible).",
    "Only answer topics related to the shop: bouquets, pricing, delivery, payment, and ordering.",
    `Current flower catalog snapshot: ${formatCatalog(flowers, 6)}`
  ].join(" ");

  const input = [
    {
      role: "system",
      content: [{ type: "input_text", text: systemPrompt }]
    },
    ...history.map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: [{ type: "input_text", text: entry.content }]
    })),
    {
      role: "user",
      content: [{ type: "input_text", text: message }]
    }
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input,
        max_output_tokens: 220
      }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `OpenAI request failed (${response.status})`);
    }

    const reply = extractOpenAiText(payload);
    if (!reply) {
      throw new Error("empty OpenAI response");
    }

    return reply;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateChatReply({ message, history, flowers }) {
  try {
    const openAiReply = await requestOpenAiChatReply({
      message,
      history,
      flowers
    });
    if (openAiReply) {
      return {
        reply: openAiReply,
        source: "openai"
      };
    }
  } catch (error) {
    console.error("OpenAI chat fallback:", error.message);
  }

  return {
    reply: buildLocalChatReply(message, flowers),
    source: "local"
  };
}

async function getFlowerSnapshot() {
  if (isDatabaseConfigured()) {
    await ensureSeedFlowers();
    const rows = await dbRequest({
      table: "flowers",
      method: "GET",
      query: { select: "id,name,price,occasion,stock", order: "created_at.desc" },
      prefer: null
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.price),
      occasion: row.occasion,
      stock: Number(row.stock || 0)
    }));
  }

  const store = getStore();
  return Array.isArray(store.flowers) ? store.flowers : [];
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { message: "invalid JSON body" });
  }

  let payload;
  try {
    payload = normalizeChatPayload(body);
  } catch (error) {
    return json(res, 400, { message: error.message });
  }

  try {
    const flowers = await getFlowerSnapshot();
    const result = await generateChatReply({
      message: payload.message,
      history: payload.history,
      flowers
    });

    return json(res, 200, {
      reply: result.reply,
      source: result.source,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return json(res, 500, { message: error.message || "internal server error" });
  }
};
