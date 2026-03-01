const { requireRole } = require("./_auth");
const { createId, getStore } = require("./_store");
const { dbRequest, ensureSeedFlowers, isDatabaseConfigured, toInFilter } = require("./_db");
const { json, methodNotAllowed, parseUrl, readJsonBody } = require("./_utils");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,24}$/;
const ALLOWED_PAYMENT_METHODS = new Set(["cash", "paypal"]);
const ALLOWED_PAYMENT_STATUSES = new Set(["pending", "paid", "failed"]);

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

function isValidPhoneNumber(value) {
  const normalized = String(value || "").trim();
  if (!PHONE_REGEX.test(normalized)) {
    return false;
  }

  const digitCount = normalized.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
}

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

  const paymentMethod = normalizePaymentMethod(orderRow.payment_method) || "cash";
  const paymentStatus = normalizePaymentStatus(orderRow.payment_status) || "pending";

  return {
    id: orderRow.id,
    customer: {
      name: orderRow.customer_name,
      email: orderRow.customer_email,
      phone: orderRow.customer_phone || "",
      address: orderRow.customer_address
    },
    paymentMethod,
    paymentStatus,
    items,
    total: Number(orderRow.total),
    createdAt: orderRow.created_at || new Date().toISOString()
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
  return [...store.orders]
    .map((order) => normalizeLegacyOrder(order))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function listOrders(_req, res) {
  if (isDatabaseConfigured()) {
    const orders = await listOrdersFromDb();
    return json(res, 200, orders);
  }

  return json(res, 200, listOrdersFromMemory());
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

function validateOrderPayload(body) {
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

  if (!isValidPhoneNumber(customerPhone)) {
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
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    paymentMethod: normalizedPaymentMethod,
    paymentStatus: "pending",
    items: normalizeCartItems(items)
  };
}

async function createOrderInDb(payload) {
  const {
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    paymentMethod,
    paymentStatus,
    items
  } = payload;

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
    const flower = flowerMap.get(item.flowerId);
    if (!flower) {
      const error = new Error(`flower not found: ${item.flowerId}`);
      error.status = 404;
      throw error;
    }

    if (flower.stock < item.quantity) {
      const error = new Error(`insufficient stock for ${flower.name}`);
      error.status = 409;
      throw error;
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
      customer_phone: customerPhone,
      customer_address: customerAddress,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
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
      phone: customerPhone,
      address: customerAddress
    },
    paymentMethod,
    paymentStatus,
    items: normalizedItems,
    total,
    createdAt: orderRows[0].created_at || new Date().toISOString()
  };
}

function createOrderInMemory(payload) {
  const {
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    paymentMethod,
    paymentStatus,
    items
  } = payload;
  const store = getStore();
  const flowerMap = new Map(store.flowers.map((flower) => [flower.id, flower]));
  const normalizedItems = [];

  for (const item of items) {
    const flower = flowerMap.get(item.flowerId);
    if (!flower) {
      const error = new Error(`flower not found: ${item.flowerId}`);
      error.status = 404;
      throw error;
    }

    if (flower.stock < item.quantity) {
      const error = new Error(`insufficient stock for ${flower.name}`);
      error.status = 409;
      throw error;
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
    id: createId(12),
    customer: {
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      address: customerAddress
    },
    paymentMethod,
    paymentStatus,
    items: normalizedItems,
    total,
    createdAt: new Date().toISOString()
  };

  store.orders.push(order);
  return order;
}

async function updateOrderStatusInDb(orderId, paymentStatus) {
  const rows = await dbRequest({
    table: "orders",
    method: "PATCH",
    query: {
      id: `eq.${orderId}`,
      select: "*"
    },
    body: {
      payment_status: paymentStatus
    }
  });

  if (!Array.isArray(rows) || rows.length === 0) {
    const error = new Error("order not found");
    error.status = 404;
    throw error;
  }

  const itemRows = await dbRequest({
    table: "order_items",
    method: "GET",
    query: {
      select: "*",
      order_id: `eq.${orderId}`,
      order: "id.asc"
    },
    prefer: null
  });

  return toOrderModel(rows[0], itemRows);
}

function updateOrderStatusInMemory(orderId, paymentStatus) {
  const store = getStore();
  const index = store.orders.findIndex((order) => order.id === orderId);
  if (index === -1) {
    const error = new Error("order not found");
    error.status = 404;
    throw error;
  }

  const normalized = normalizeLegacyOrder(store.orders[index]);
  const updatedOrder = {
    ...normalized,
    paymentStatus
  };
  store.orders[index] = updatedOrder;
  return updatedOrder;
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

async function updateOrderStatus(req, res) {
  const url = parseUrl(req);
  const orderId = String(url.searchParams.get("id") || "").trim();
  if (!orderId) {
    return json(res, 400, { message: "id query param is required" });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { message: "invalid JSON body" });
  }

  const paymentStatus = normalizePaymentStatus(body?.paymentStatus);
  if (!paymentStatus) {
    return json(res, 400, { message: "paymentStatus must be pending, paid, or failed" });
  }

  try {
    const order = isDatabaseConfigured()
      ? await updateOrderStatusInDb(orderId, paymentStatus)
      : updateOrderStatusInMemory(orderId, paymentStatus);
    return json(res, 200, order);
  } catch (error) {
    const status = Number(error.status || 400);
    return json(res, status, { message: error.message || "failed to update order status" });
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

    if (req.method === "PATCH") {
      const user = requireRole(req, res, ["admin"]);
      if (!user) {
        return;
      }
      return await updateOrderStatus(req, res);
    }

    return methodNotAllowed(res, ["GET", "POST", "PATCH"]);
  } catch (error) {
    return json(res, 500, { message: error.message || "internal server error" });
  }
};
