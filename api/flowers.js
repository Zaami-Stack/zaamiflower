const { requireRole } = require("./_auth");
const { createId, getStore } = require("./_store");
const { dbRequest, ensureSeedFlowers, isDatabaseConfigured } = require("./_db");
const { json, methodNotAllowed, parseUrl, readJsonBody } = require("./_utils");

function mapFlowerRowToModel(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    price: Number(row.price),
    occasion: row.occasion,
    image: row.image || "",
    stock: Number(row.stock || 0),
    createdAt: row.created_at || new Date().toISOString()
  };
}

function mapFlowerModelToRow(flower) {
  return {
    id: flower.id,
    name: flower.name,
    description: flower.description || "",
    price: flower.price,
    occasion: flower.occasion,
    image: flower.image || "",
    stock: flower.stock,
    created_at: flower.createdAt
  };
}

function filterFlowers(flowers, { search, occasion, maxPrice }) {
  return flowers
    .filter((flower) => {
      const searchMatch =
        !search ||
        flower.name.toLowerCase().includes(search) ||
        flower.description.toLowerCase().includes(search);
      const occasionMatch = occasion === "all" || flower.occasion.toLowerCase() === occasion;
      const priceMatch = maxPrice === null || Number.isNaN(maxPrice) || flower.price <= maxPrice;
      return searchMatch && occasionMatch && priceMatch;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function listFlowers(req, res) {
  const url = parseUrl(req);
  const search = String(url.searchParams.get("search") || "")
    .trim()
    .toLowerCase();
  const occasion = String(url.searchParams.get("occasion") || "all")
    .trim()
    .toLowerCase();
  const maxPriceValue = url.searchParams.get("maxPrice");
  const maxPrice = maxPriceValue !== null ? Number(maxPriceValue) : null;

  if (isDatabaseConfigured()) {
    await ensureSeedFlowers();
    const rows = await dbRequest({
      table: "flowers",
      method: "GET",
      query: { select: "*", order: "created_at.desc" },
      prefer: null
    });
    const flowers = rows.map(mapFlowerRowToModel);
    return json(res, 200, filterFlowers(flowers, { search, occasion, maxPrice }));
  }

  const store = getStore();
  return json(
    res,
    200,
    filterFlowers(store.flowers, {
      search,
      occasion,
      maxPrice
    })
  );
}

async function createFlower(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { message: "invalid JSON body" });
  }

  const {
    name,
    description = "",
    price,
    occasion = "general",
    image = "",
    stock = 0
  } = body || {};

  if (!name || typeof name !== "string") {
    return json(res, 400, { message: "name is required" });
  }

  const parsedPrice = Number(price);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return json(res, 400, { message: "price must be greater than 0" });
  }

  const parsedStock = Number(stock);
  if (!Number.isFinite(parsedStock) || parsedStock < 0) {
    return json(res, 400, { message: "stock must be 0 or greater" });
  }

  const flower = {
    id: createId(10),
    name: String(name).trim(),
    description: String(description).trim(),
    price: parsedPrice,
    occasion: String(occasion).trim().toLowerCase(),
    image: String(image).trim(),
    stock: Math.floor(parsedStock),
    createdAt: new Date().toISOString()
  };

  if (isDatabaseConfigured()) {
    const rows = await dbRequest({
      table: "flowers",
      method: "POST",
      body: mapFlowerModelToRow(flower)
    });
    return json(res, 201, mapFlowerRowToModel(rows[0]));
  }

  const store = getStore();
  store.flowers.push(flower);
  return json(res, 201, flower);
}

async function deleteFlower(req, res) {
  const url = parseUrl(req);
  const flowerId = String(url.searchParams.get("id") || "").trim();

  if (!flowerId) {
    return json(res, 400, { message: "id query param is required" });
  }

  if (isDatabaseConfigured()) {
    const rows = await dbRequest({
      table: "flowers",
      method: "DELETE",
      query: { id: `eq.${flowerId}`, select: "*" }
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return json(res, 404, { message: "flower not found" });
    }
    return json(res, 200, { ok: true, removed: mapFlowerRowToModel(rows[0]) });
  }

  const store = getStore();
  const flowerIndex = store.flowers.findIndex((flower) => flower.id === flowerId);
  if (flowerIndex === -1) {
    return json(res, 404, { message: "flower not found" });
  }

  const [removedFlower] = store.flowers.splice(flowerIndex, 1);
  return json(res, 200, { ok: true, removed: removedFlower });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return await listFlowers(req, res);
    }

    if (req.method === "POST") {
      const user = requireRole(req, res, ["admin"]);
      if (!user) {
        return;
      }
      return await createFlower(req, res);
    }

    if (req.method === "DELETE") {
      const user = requireRole(req, res, ["admin"]);
      if (!user) {
        return;
      }
      return await deleteFlower(req, res);
    }

    return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
  } catch (error) {
    return json(res, 500, { message: error.message || "internal server error" });
  }
};

