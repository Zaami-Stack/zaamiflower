import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { nanoid } from "nanoid";
import { ensureDataFile, readData, writeData } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "../../client/dist");
const clientIndexPath = path.join(clientDistPath, "index.html");
const hasClientBuild = fs.existsSync(clientIndexPath);

const ALLOWED_OCCASIONS = new Set([
  "general",
  "romance",
  "birthday",
  "wedding",
  "thank-you"
]);
const ALLOWED_PAYMENT_METHODS = new Set(["cash", "paypal"]);
const ALLOWED_PAYMENT_STATUSES = new Set(["pending", "paid", "failed"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,24}$/;
const IMAGE_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_STOCK = 10000;
const CHAT_MAX_MESSAGE_LENGTH = 500;
const CHAT_MAX_HISTORY_ITEMS = 10;
const CHAT_HISTORY_ENTRY_LENGTH = 500;
const WHATSAPP_CHAT_URL = "https://wa.me/212775094615";
const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=80";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

function normalizeOccasion(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ALLOWED_OCCASIONS.has(normalized) ? normalized : null;
}

function normalizePaymentMethod(value) {
  const normalized = String(value || "cash")
    .trim()
    .toLowerCase();
  return ALLOWED_PAYMENT_METHODS.has(normalized) ? normalized : null;
}

function normalizePaymentStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ALLOWED_PAYMENT_STATUSES.has(normalized) ? normalized : null;
}

function isValidImageUrl(value) {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);
    return IMAGE_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function normalizeSiteSettings(data) {
  const current = data?.settings || {};
  return {
    heroImage: isValidImageUrl(current.heroImage) ? String(current.heroImage) : DEFAULT_HERO_IMAGE,
    updatedAt: current.updatedAt || new Date().toISOString()
  };
}

function normalizeFlowerFocus(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  if (number < 0 || number > 100) {
    return null;
  }
  return Number(number.toFixed(2));
}

function normalizeFlowerCreatePayload(body) {
  const {
    name,
    description = "",
    price,
    occasion = "general",
    image = "",
    imageFocusX = 50,
    imageFocusY = 50,
    stock = 0
  } = body || {};

  const normalizedName = String(name || "").trim();
  if (normalizedName.length < 2) {
    throw new Error("name must be at least 2 characters");
  }

  const parsedPrice = Number(price);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw new Error("price must be greater than 0");
  }

  const parsedStock = Number(stock);
  if (!Number.isFinite(parsedStock) || parsedStock < 0 || parsedStock > MAX_STOCK) {
    throw new Error(`stock must be an integer between 0 and ${MAX_STOCK}`);
  }

  if (!Number.isInteger(parsedStock)) {
    throw new Error("stock must be a whole number");
  }

  const normalizedOccasion = normalizeOccasion(occasion);
  if (!normalizedOccasion) {
    throw new Error("occasion is invalid");
  }

  const normalizedImage = String(image || "").trim();
  if (!isValidImageUrl(normalizedImage)) {
    throw new Error("image must be a valid http/https URL");
  }

  const normalizedFocusX = normalizeFlowerFocus(imageFocusX);
  const normalizedFocusY = normalizeFlowerFocus(imageFocusY);
  if (normalizedFocusX === null || normalizedFocusY === null) {
    throw new Error("image focus values must be between 0 and 100");
  }

  return {
    id: nanoid(10),
    name: normalizedName,
    description: String(description || "").trim(),
    price: Number(parsedPrice.toFixed(2)),
    occasion: normalizedOccasion,
    image: normalizedImage,
    imageFocusX: normalizedFocusX,
    imageFocusY: normalizedFocusY,
    stock: parsedStock,
    createdAt: new Date().toISOString()
  };
}

function normalizeFlowerPatchPayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("invalid request body");
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const normalizedName = String(body.name || "").trim();
    if (normalizedName.length < 2) {
      throw new Error("name must be at least 2 characters");
    }
    updates.name = normalizedName;
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    updates.description = String(body.description || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, "price")) {
    const parsedPrice = Number(body.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw new Error("price must be greater than 0");
    }
    updates.price = Number(parsedPrice.toFixed(2));
  }

  if (Object.prototype.hasOwnProperty.call(body, "occasion")) {
    const normalizedOccasion = normalizeOccasion(body.occasion);
    if (!normalizedOccasion) {
      throw new Error("occasion is invalid");
    }
    updates.occasion = normalizedOccasion;
  }

  if (Object.prototype.hasOwnProperty.call(body, "image")) {
    const normalizedImage = String(body.image || "").trim();
    if (!isValidImageUrl(normalizedImage)) {
      throw new Error("image must be a valid http/https URL");
    }
    updates.image = normalizedImage;
  }

  if (Object.prototype.hasOwnProperty.call(body, "imageFocusX")) {
    const normalizedFocusX = normalizeFlowerFocus(body.imageFocusX);
    if (normalizedFocusX === null) {
      throw new Error("imageFocusX must be between 0 and 100");
    }
    updates.imageFocusX = normalizedFocusX;
  }

  if (Object.prototype.hasOwnProperty.call(body, "imageFocusY")) {
    const normalizedFocusY = normalizeFlowerFocus(body.imageFocusY);
    if (normalizedFocusY === null) {
      throw new Error("imageFocusY must be between 0 and 100");
    }
    updates.imageFocusY = normalizedFocusY;
  }

  if (Object.prototype.hasOwnProperty.call(body, "stock")) {
    const parsedStock = Number(body.stock);
    if (!Number.isFinite(parsedStock) || parsedStock < 0 || parsedStock > MAX_STOCK) {
      throw new Error(`stock must be an integer between 0 and ${MAX_STOCK}`);
    }
    if (!Number.isInteger(parsedStock)) {
      throw new Error("stock must be a whole number");
    }
    updates.stock = parsedStock;
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("at least one flower field is required");
  }

  return updates;
}

function isValidPhone(value) {
  const normalized = String(value || "").trim();
  if (!PHONE_REGEX.test(normalized)) {
    return false;
  }
  const digits = normalized.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

function normalizeCartItems(items) {
  const quantities = new Map();
  for (const item of items) {
    const flowerId = String(item?.flowerId || "").trim();
    const quantity = Number(item?.quantity);
    if (!flowerId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
      throw new Error("invalid cart item payload");
    }
    quantities.set(flowerId, (quantities.get(flowerId) || 0) + quantity);
  }

  return [...quantities.entries()].map(([flowerId, quantity]) => ({ flowerId, quantity }));
}

function normalizeOrderPayload(body) {
  const { customer, items, paymentMethod = "cash" } = body || {};

  if (!customer || typeof customer !== "object") {
    throw new Error("customer details are required");
  }

  const customerName = String(customer.name || "").trim();
  const customerEmail = String(customer.email || "").trim().toLowerCase();
  const customerPhone = String(customer.phone || "").trim();
  const customerAddress = String(customer.address || "").trim();

  if (customerName.length < 2 || customerName.length > 120) {
    throw new Error("customer.name must be between 2 and 120 characters");
  }
  if (!EMAIL_REGEX.test(customerEmail)) {
    throw new Error("customer.email is invalid");
  }
  if (!isValidPhone(customerPhone)) {
    throw new Error("customer.phone is invalid");
  }
  if (customerAddress.length < 6 || customerAddress.length > 240) {
    throw new Error("customer.address must be between 6 and 240 characters");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("at least one cart item is required");
  }

  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  if (!normalizedPaymentMethod) {
    throw new Error("paymentMethod must be cash or paypal");
  }

  return {
    customer: {
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      address: customerAddress
    },
    paymentMethod: normalizedPaymentMethod,
    paymentStatus: "pending",
    items: normalizeCartItems(items)
  };
}

function normalizeLegacyOrder(order) {
  return {
    ...order,
    customer: {
      name: String(order?.customer?.name || "").trim(),
      email: String(order?.customer?.email || "").trim(),
      phone: String(order?.customer?.phone || "").trim(),
      address: String(order?.customer?.address || "").trim()
    },
    paymentMethod: normalizePaymentMethod(order?.paymentMethod) || "cash",
    paymentStatus: normalizePaymentStatus(order?.paymentStatus) || "pending"
  };
}

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

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "flower-shop-api",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/chat", async (req, res, next) => {
  try {
    let payload;
    try {
      payload = normalizeChatPayload(req.body);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const data = await readData();
    const flowers = Array.isArray(data?.flowers) ? data.flowers : [];
    const result = await generateChatReply({
      message: payload.message,
      history: payload.history,
      flowers
    });

    return res.status(200).json({
      reply: result.reply,
      source: result.source,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings", async (_req, res, next) => {
  try {
    const data = await readData();
    const settings = normalizeSiteSettings(data);
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/settings", async (req, res, next) => {
  try {
    const heroImage = String(req.body?.heroImage || "").trim();
    if (!heroImage || !isValidImageUrl(heroImage)) {
      return res.status(400).json({ message: "heroImage must be a valid http/https URL" });
    }

    const data = await readData();
    data.settings = {
      heroImage,
      updatedAt: new Date().toISOString()
    };
    await writeData(data);
    return res.json(data.settings);
  } catch (error) {
    next(error);
  }
});

app.get("/api/flowers", async (req, res, next) => {
  try {
    const { search = "", occasion = "all", maxPrice } = req.query;
    const normalizedSearch = String(search).toLowerCase().trim();
    const normalizedOccasion = String(occasion).toLowerCase().trim();
    const parsedMaxPrice = maxPrice !== undefined ? Number(maxPrice) : null;

    const data = await readData();

    const flowers = data.flowers
      .filter((flower) => {
        const searchMatch =
          !normalizedSearch ||
          flower.name.toLowerCase().includes(normalizedSearch) ||
          flower.description.toLowerCase().includes(normalizedSearch);
        const occasionMatch =
          normalizedOccasion === "all" ||
          flower.occasion.toLowerCase() === normalizedOccasion;
        const priceMatch =
          parsedMaxPrice === null ||
          Number.isNaN(parsedMaxPrice) ||
          flower.price <= parsedMaxPrice;
        return searchMatch && occasionMatch && priceMatch;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(flowers);
  } catch (error) {
    next(error);
  }
});

app.post("/api/flowers", async (req, res, next) => {
  try {
    let flower;
    try {
      flower = normalizeFlowerCreatePayload(req.body);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const data = await readData();
    data.flowers.push(flower);
    await writeData(data);

    res.status(201).json(flower);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/flowers", async (req, res, next) => {
  try {
    const flowerId = String(req.query.id || "").trim();
    if (!flowerId) {
      return res.status(400).json({ message: "id query param is required" });
    }

    let updates;
    try {
      updates = normalizeFlowerPatchPayload(req.body);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const data = await readData();
    const index = data.flowers.findIndex((flower) => flower.id === flowerId);
    if (index === -1) {
      return res.status(404).json({ message: "flower not found" });
    }

    data.flowers[index] = {
      ...data.flowers[index],
      ...updates
    };
    await writeData(data);

    return res.json(data.flowers[index]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/flowers", async (req, res, next) => {
  try {
    const flowerId = String(req.query.id || "").trim();
    if (!flowerId) {
      return res.status(400).json({ message: "id query param is required" });
    }

    const data = await readData();
    const flowerIndex = data.flowers.findIndex((flower) => flower.id === flowerId);
    if (flowerIndex === -1) {
      return res.status(404).json({ message: "flower not found" });
    }

    const [removedFlower] = data.flowers.splice(flowerIndex, 1);
    await writeData(data);
    return res.status(200).json({ ok: true, removed: removedFlower });
  } catch (error) {
    next(error);
  }
});

app.get("/api/orders", async (_req, res, next) => {
  try {
    const data = await readData();
    const orders = [...data.orders]
      .map((order) => normalizeLegacyOrder(order))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    let payload;
    try {
      payload = normalizeOrderPayload(req.body);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const data = await readData();
    const flowerMap = new Map(data.flowers.map((flower) => [flower.id, flower]));

    const normalizedItems = [];

    for (const item of payload.items) {
      const flower = flowerMap.get(item.flowerId);
      if (!flower) {
        return res.status(404).json({ message: `flower not found: ${item.flowerId}` });
      }

      if (flower.stock < item.quantity) {
        return res.status(409).json({
          message: `insufficient stock for ${flower.name}`,
          available: flower.stock
        });
      }

      normalizedItems.push({
        flowerId: flower.id,
        name: flower.name,
        unitPrice: flower.price,
        quantity: item.quantity,
        lineTotal: Number((flower.price * item.quantity).toFixed(2))
      });
    }

    for (const item of normalizedItems) {
      const flower = flowerMap.get(item.flowerId);
      flower.stock -= item.quantity;
    }

    const total = Number(
      normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
    );

    const order = {
      id: nanoid(12),
      customer: payload.customer,
      paymentMethod: payload.paymentMethod,
      paymentStatus: payload.paymentStatus,
      items: normalizedItems,
      total,
      createdAt: new Date().toISOString()
    };

    data.orders.push(order);
    await writeData(data);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/orders", async (req, res, next) => {
  try {
    const orderId = String(req.query.id || "").trim();
    if (!orderId) {
      return res.status(400).json({ message: "id query param is required" });
    }

    const paymentStatus = normalizePaymentStatus(req.body?.paymentStatus);
    if (!paymentStatus) {
      return res.status(400).json({ message: "paymentStatus must be pending, paid, or failed" });
    }

    const data = await readData();
    const index = data.orders.findIndex((order) => order.id === orderId);
    if (index === -1) {
      return res.status(404).json({ message: "order not found" });
    }

    const normalized = normalizeLegacyOrder(data.orders[index]);
    data.orders[index] = {
      ...normalized,
      paymentStatus
    };

    await writeData(data);
    return res.json(data.orders[index]);
  } catch (error) {
    next(error);
  }
});

if (hasClientBuild) {
  app.use(express.static(clientDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    return res.sendFile(clientIndexPath);
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "internal server error" });
});

async function bootstrap() {
  await ensureDataFile();
  app.listen(port, () => {
    console.log(`Flower API running on http://localhost:${port}`);
  });
}

bootstrap();
