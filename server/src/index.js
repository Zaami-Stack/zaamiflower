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

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "flower-shop-api",
    timestamp: new Date().toISOString()
  });
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
    const { name, description = "", price, occasion = "general", image = "", stock = 0 } = req.body ?? {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "name is required" });
    }

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ message: "price must be greater than 0" });
    }

    const parsedStock = Number(stock);
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ message: "stock must be 0 or greater" });
    }

    const newFlower = {
      id: nanoid(10),
      name: name.trim(),
      description: String(description).trim(),
      price: parsedPrice,
      occasion: String(occasion).trim().toLowerCase(),
      image: String(image).trim(),
      stock: Math.floor(parsedStock),
      createdAt: new Date().toISOString()
    };

    const data = await readData();
    data.flowers.push(newFlower);
    await writeData(data);

    res.status(201).json(newFlower);
  } catch (error) {
    next(error);
  }
});

app.get("/api/orders", async (_req, res, next) => {
  try {
    const data = await readData();
    const orders = [...data.orders].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    const { customer, items } = req.body ?? {};

    if (!customer || typeof customer !== "object") {
      return res.status(400).json({ message: "customer details are required" });
    }

    const customerName = String(customer.name || "").trim();
    const customerEmail = String(customer.email || "").trim();
    const customerAddress = String(customer.address || "").trim();

    if (!customerName || !customerEmail || !customerAddress) {
      return res
        .status(400)
        .json({ message: "customer.name, customer.email and customer.address are required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "at least one cart item is required" });
    }

    const data = await readData();
    const flowerMap = new Map(data.flowers.map((flower) => [flower.id, flower]));

    const normalizedItems = [];

    for (const item of items) {
      const flowerId = String(item.flowerId || "").trim();
      const quantity = Math.floor(Number(item.quantity));

      if (!flowerId || !Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "invalid cart item payload" });
      }

      const flower = flowerMap.get(flowerId);
      if (!flower) {
        return res.status(404).json({ message: `flower not found: ${flowerId}` });
      }

      if (flower.stock < quantity) {
        return res.status(409).json({
          message: `insufficient stock for ${flower.name}`,
          available: flower.stock
        });
      }

      normalizedItems.push({
        flowerId: flower.id,
        name: flower.name,
        unitPrice: flower.price,
        quantity,
        lineTotal: Number((flower.price * quantity).toFixed(2))
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
      customer: {
        name: customerName,
        email: customerEmail,
        address: customerAddress
      },
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
