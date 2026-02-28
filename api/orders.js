const { createId, getStore } = require("./_store");
const { json, methodNotAllowed, readJsonBody } = require("./_utils");

function listOrders(_req, res) {
  const store = getStore();
  const orders = [...store.orders].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  return json(res, 200, orders);
}

async function createOrder(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { message: "invalid JSON body" });
  }

  const { customer, items } = body || {};

  if (!customer || typeof customer !== "object") {
    return json(res, 400, { message: "customer details are required" });
  }

  const customerName = String(customer.name || "").trim();
  const customerEmail = String(customer.email || "").trim();
  const customerAddress = String(customer.address || "").trim();

  if (!customerName || !customerEmail || !customerAddress) {
    return json(res, 400, {
      message: "customer.name, customer.email and customer.address are required"
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return json(res, 400, { message: "at least one cart item is required" });
  }

  const store = getStore();
  const flowerMap = new Map(store.flowers.map((flower) => [flower.id, flower]));
  const normalizedItems = [];

  for (const item of items) {
    const flowerId = String(item.flowerId || "").trim();
    const quantity = Math.floor(Number(item.quantity));

    if (!flowerId || !Number.isFinite(quantity) || quantity <= 0) {
      return json(res, 400, { message: "invalid cart item payload" });
    }

    const flower = flowerMap.get(flowerId);
    if (!flower) {
      return json(res, 404, { message: `flower not found: ${flowerId}` });
    }

    if (flower.stock < quantity) {
      return json(res, 409, {
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
    id: createId(12),
    customer: {
      name: customerName,
      email: customerEmail,
      address: customerAddress
    },
    items: normalizedItems,
    total,
    createdAt: new Date().toISOString()
  };

  store.orders.push(order);
  return json(res, 201, order);
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return listOrders(req, res);
  }

  if (req.method === "POST") {
    return createOrder(req, res);
  }

  return methodNotAllowed(res, ["GET", "POST"]);
};

