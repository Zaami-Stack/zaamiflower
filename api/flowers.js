const { createId, getStore } = require("./_store");
const { json, methodNotAllowed, parseUrl, readJsonBody } = require("./_utils");

function listFlowers(req, res) {
  const url = parseUrl(req);
  const search = String(url.searchParams.get("search") || "")
    .trim()
    .toLowerCase();
  const occasion = String(url.searchParams.get("occasion") || "all")
    .trim()
    .toLowerCase();
  const maxPriceValue = url.searchParams.get("maxPrice");
  const maxPrice = maxPriceValue !== null ? Number(maxPriceValue) : null;

  const store = getStore();

  const flowers = store.flowers
    .filter((flower) => {
      const searchMatch =
        !search ||
        flower.name.toLowerCase().includes(search) ||
        flower.description.toLowerCase().includes(search);
      const occasionMatch =
        occasion === "all" || flower.occasion.toLowerCase() === occasion;
      const priceMatch =
        maxPrice === null || Number.isNaN(maxPrice) || flower.price <= maxPrice;
      return searchMatch && occasionMatch && priceMatch;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return json(res, 200, flowers);
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

  const store = getStore();
  store.flowers.push(flower);
  return json(res, 201, flower);
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return listFlowers(req, res);
  }

  if (req.method === "POST") {
    return createFlower(req, res);
  }

  return methodNotAllowed(res, ["GET", "POST"]);
};

