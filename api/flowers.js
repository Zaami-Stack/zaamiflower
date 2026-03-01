const { requireRole } = require("./_auth");
const { createId, getStore } = require("./_store");
const { dbRequest, ensureSeedFlowers, isDatabaseConfigured } = require("./_db");
const { json, methodNotAllowed, parseUrl, readJsonBody } = require("./_utils");

const ALLOWED_OCCASIONS = new Set([
  "general",
  "romance",
  "birthday",
  "wedding",
  "thank-you"
]);
const IMAGE_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_STOCK = 10000;

function mapFlowerRowToModel(row) {
  const imageFocusX = Number(row.image_focus_x);
  const imageFocusY = Number(row.image_focus_y);
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    price: Number(row.price),
    occasion: row.occasion,
    image: row.image || "",
    imageFocusX: Number.isFinite(imageFocusX) ? imageFocusX : 50,
    imageFocusY: Number.isFinite(imageFocusY) ? imageFocusY : 50,
    stock: Number(row.stock || 0),
    createdAt: row.created_at || new Date().toISOString()
  };
}

function mapFlowerModelToRow(flower) {
  const imageFocusX = Number(flower.imageFocusX);
  const imageFocusY = Number(flower.imageFocusY);
  return {
    id: flower.id,
    name: flower.name,
    description: flower.description || "",
    price: flower.price,
    occasion: flower.occasion,
    image: flower.image || "",
    image_focus_x: Number.isFinite(imageFocusX) ? imageFocusX : 50,
    image_focus_y: Number.isFinite(imageFocusY) ? imageFocusY : 50,
    stock: flower.stock,
    created_at: flower.createdAt
  };
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

function normalizeOccasion(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!ALLOWED_OCCASIONS.has(normalized)) {
    return null;
  }

  return normalized;
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

function normalizeCreateFlowerPayload(body) {
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
    id: createId(10),
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

function normalizeFlowerUpdatePayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("invalid request body");
  }

  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const normalizedName = String(body.name || "").trim();
    if (normalizedName.length < 2) {
      throw new Error("name must be at least 2 characters");
    }
    payload.name = normalizedName;
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    payload.description = String(body.description || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, "price")) {
    const parsedPrice = Number(body.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw new Error("price must be greater than 0");
    }
    payload.price = Number(parsedPrice.toFixed(2));
  }

  if (Object.prototype.hasOwnProperty.call(body, "occasion")) {
    const normalizedOccasion = normalizeOccasion(body.occasion);
    if (!normalizedOccasion) {
      throw new Error("occasion is invalid");
    }
    payload.occasion = normalizedOccasion;
  }

  if (Object.prototype.hasOwnProperty.call(body, "image")) {
    const normalizedImage = String(body.image || "").trim();
    if (!isValidImageUrl(normalizedImage)) {
      throw new Error("image must be a valid http/https URL");
    }
    payload.image = normalizedImage;
  }

  if (Object.prototype.hasOwnProperty.call(body, "imageFocusX")) {
    const normalizedFocusX = normalizeFlowerFocus(body.imageFocusX);
    if (normalizedFocusX === null) {
      throw new Error("imageFocusX must be between 0 and 100");
    }
    payload.imageFocusX = normalizedFocusX;
  }

  if (Object.prototype.hasOwnProperty.call(body, "imageFocusY")) {
    const normalizedFocusY = normalizeFlowerFocus(body.imageFocusY);
    if (normalizedFocusY === null) {
      throw new Error("imageFocusY must be between 0 and 100");
    }
    payload.imageFocusY = normalizedFocusY;
  }

  if (Object.prototype.hasOwnProperty.call(body, "stock")) {
    const parsedStock = Number(body.stock);
    if (!Number.isFinite(parsedStock) || parsedStock < 0 || parsedStock > MAX_STOCK) {
      throw new Error(`stock must be an integer between 0 and ${MAX_STOCK}`);
    }
    if (!Number.isInteger(parsedStock)) {
      throw new Error("stock must be a whole number");
    }
    payload.stock = parsedStock;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("at least one flower field is required");
  }

  return payload;
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

  let flower;
  try {
    flower = normalizeCreateFlowerPayload(body);
  } catch (error) {
    return json(res, 400, { message: error.message });
  }

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

async function updateFlower(req, res) {
  const url = parseUrl(req);
  const flowerId = String(url.searchParams.get("id") || "").trim();

  if (!flowerId) {
    return json(res, 400, { message: "id query param is required" });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { message: "invalid JSON body" });
  }

  let updates;
  try {
    updates = normalizeFlowerUpdatePayload(body);
  } catch (error) {
    return json(res, 400, { message: error.message });
  }

  if (isDatabaseConfigured()) {
    const patchPayload = {};

    if (Object.prototype.hasOwnProperty.call(updates, "name")) {
      patchPayload.name = updates.name;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "description")) {
      patchPayload.description = updates.description;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "price")) {
      patchPayload.price = updates.price;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "occasion")) {
      patchPayload.occasion = updates.occasion;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "image")) {
      patchPayload.image = updates.image;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "imageFocusX")) {
      patchPayload.image_focus_x = updates.imageFocusX;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "imageFocusY")) {
      patchPayload.image_focus_y = updates.imageFocusY;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "stock")) {
      patchPayload.stock = updates.stock;
    }

    const rows = await dbRequest({
      table: "flowers",
      method: "PATCH",
      query: { id: `eq.${flowerId}`, select: "*" },
      body: patchPayload
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return json(res, 404, { message: "flower not found" });
    }

    return json(res, 200, mapFlowerRowToModel(rows[0]));
  }

  const store = getStore();
  const index = store.flowers.findIndex((flower) => flower.id === flowerId);
  if (index === -1) {
    return json(res, 404, { message: "flower not found" });
  }

  const currentFlower = store.flowers[index];
  const nextFlower = {
    ...currentFlower,
    ...updates
  };

  store.flowers[index] = nextFlower;
  return json(res, 200, nextFlower);
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

    if (req.method === "PATCH") {
      const user = requireRole(req, res, ["admin"]);
      if (!user) {
        return;
      }
      return await updateFlower(req, res);
    }

    return methodNotAllowed(res, ["GET", "POST", "PATCH", "DELETE"]);
  } catch (error) {
    return json(res, 500, { message: error.message || "internal server error" });
  }
};
