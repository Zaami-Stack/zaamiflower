const { requireRole } = require("./_auth");
const { createId, getStore } = require("./_store");
const { dbRequest, ensureSeedFlowers, isDatabaseConfigured, toInFilter } = require("./_db");
const { json, methodNotAllowed, readJsonBody } = require("./_utils");

function toOrderModel(orderRow, itemRows) {
  const items = itemRows
    .filter((item) => item.order_id === orderRow.id)
    .map((item) => ({
      flowerId: item.flower_id,
      name: item.name,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      lineTotal: Number(item.line_total)
    }));

  return {
    id: orderRow.id,
    customer: {
      name: orderRow.customer_name,
      email: orderRow.customer_email,
      address: orderRow.customer_address
    },
    items,
    total: Number(orderRow.total),
    createdAt: orderRow.created_at || new Date().toISOString()
  };
}

async function listOrdersFromDb() {
  const orderRows = await dbRequest({
    table: "orders",
    method: "GET",
    query: { select: "*", order: "created_at.desc" },
    prefer: null
  });

  if (!Array.isArray(orderRows) || orderRows.length === 0) {
    return [];
  }

  const orderIds = orderRows.map((order) => order.id);
  const itemRows = await dbRequest({
    table: "order_items",
    method: "GET",
    query: {
      select: "*",
      order_id: toInFilter(orderIds),
      order: "id.asc"
    },
    prefer: null
  });

  return orderRows.map((orderRow) => toOrderModel(orderRow, itemRows));
}

function listOrdersFromMemory() {
  const store = getStore();
  return [...store.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function listOrders(_req, res) {
  if (isDatabaseConfigured()) {
    const orders = await listOrdersFromDb();
    return json(res, 200, orders);
  }

  return json(res, 200, listOrdersFromMemory());
}

function validateOrderPayload(body) {
  const { customer, items } = body || {};

  if (!customer || typeof customer !== "object") {
    throw new Error("customer details are required");
  }

  const customerName = String(customer.name || "").trim();
  const customerEmail = String(customer.email || "").trim();
  const customerAddress = String(customer.address || "").trim();

  if (!customerName || !customerEmail || !customerAddress) {
    throw new Error("customer.name, customer.email and customer.address are required");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("at least one cart item is required");
  }

  return {
    customerName,
    customerEmail,
    customerAddress,
    items
  };
}

async function createOrderInDb(payload) {
  const { customerName, customerEmail, customerAddress, items } = payload;
  await ensureSeedFlowers();

  const flowerRows = await dbRequest({
    table: "flowers",
    method: "GET",
    query: { select: "*", order: "created_at.desc" },
    prefer: null
  });

  const flowerMap = new Map(
    flowerRows.map((flower) => [
      flower.id,
      {
        id: flower.id,
        name: flower.name,
        price: Number(flower.price),
        stock: Number(flower.stock || 0)
      }
    ])
  );

  const normalizedItems = [];

  for (const item of items) {
    const flowerId = String(item.flowerId || "").trim();
    const quantity = Math.floor(Number(item.quantity));

    if (!flowerId || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("invalid cart item payload");
    }

    const flower = flowerMap.get(flowerId);
    if (!flower) {
      const error = new Error(`flower not found: ${flowerId}`);
      error.status = 404;
      throw error;
    }

    if (flower.stock < quantity) {
      const error = new Error(`insufficient stock for ${flower.name}`);
      error.status = 409;
      throw error;
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

    await dbRequest({
      table: "flowers",
      method: "PATCH",
      query: { id: `eq.${item.flowerId}` },
      body: { stock: flower.stock },
      prefer: "return=minimal"
    });
  }

  const total = Number(
    normalizedItems.reduce((sum, item) => sum + Number(item.lineTotal), 0).toFixed(2)
  );

  const orderId = createId(12);
  const orderRows = await dbRequest({
    table: "orders",
    method: "POST",
    body: {
      id: orderId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_address: customerAddress,
      total,
      created_at: new Date().toISOString()
    }
  });

  await dbRequest({
    table: "order_items",
    method: "POST",
    body: normalizedItems.map((item) => ({
      order_id: orderId,
      flower_id: item.flowerId,
      name: item.name,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      line_total: item.lineTotal
    })),
    prefer: "return=minimal"
  });

  return {
    id: orderRows[0].id,
    customer: {
      name: customerName,
      email: customerEmail,
      address: customerAddress
    },
    items: normalizedItems,
    total,
    createdAt: orderRows[0].created_at || new Date().toISOString()
  };
}

function createOrderInMemory(payload) {
  const { customerName, customerEmail, customerAddress, items } = payload;
  const store = getStore();
  const flowerMap = new Map(store.flowers.map((flower) => [flower.id, flower]));
  const normalizedItems = [];

  for (const item of items) {
    const flowerId = String(item.flowerId || "").trim();
    const quantity = Math.floor(Number(item.quantity));

    if (!flowerId || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("invalid cart item payload");
    }

    const flower = flowerMap.get(flowerId);
    if (!flower) {
      const error = new Error(`flower not found: ${flowerId}`);
      error.status = 404;
      throw error;
    }

    if (flower.stock < quantity) {
      const error = new Error(`insufficient stock for ${flower.name}`);
      error.status = 409;
      throw error;
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
  return order;
}

async function createOrder(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { message: "invalid JSON body" });
  }

  let payload;
  try {
    payload = validateOrderPayload(body);
  } catch (error) {
    return json(res, 400, { message: error.message });
  }

  try {
    const order = isDatabaseConfigured()
      ? await createOrderInDb(payload)
      : createOrderInMemory(payload);
    return json(res, 201, order);
  } catch (error) {
    const status = Number(error.status || 400);
    return json(res, status, { message: error.message || "failed to create order" });
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const user = requireRole(req, res, ["admin"]);
      if (!user) {
        return;
      }
      return await listOrders(req, res);
    }

    if (req.method === "POST") {
      const user = requireRole(req, res, ["admin", "customer"]);
      if (!user) {
        return;
      }
      return await createOrder(req, res);
    }

    return methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    return json(res, 500, { message: error.message || "internal server error" });
  }
};

