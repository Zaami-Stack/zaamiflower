const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

process.env.NODE_ENV = "test";
process.env.AUTH_SECRET = "test-secret-for-orders-handler-123456789";
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.ADMIN_PASSWORD = "Admin1234!";
process.env.CUSTOMER_EMAIL = "customer@example.com";
process.env.CUSTOMER_PASSWORD = "Customer1234!";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const ordersHandler = require("../orders");
const { setSessionCookie } = require("../_auth");
const { getStore } = require("../_store");

function createMockRequest({ method, url, body, headers }) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.body = body;
  req.headers = headers || {};
  return req;
}

function createMockResponse() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    body: "",
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    end(payload) {
      this.body = String(payload || "");
    }
  };
}

function createSessionHeader(role = "customer") {
  const res = createMockResponse();
  setSessionCookie(res, {
    id: `${role}-test`,
    email: `${role}@example.com`,
    role
  });

  const rawSetCookie = res.headers["set-cookie"];
  return String(rawSetCookie || "").split(";")[0];
}

async function invokeOrders({ method = "POST", url = "/api/orders", body, role = "customer" }) {
  const req = createMockRequest({
    method,
    url,
    body,
    headers: {
      cookie: createSessionHeader(role)
    }
  });
  const res = createMockResponse();
  await ordersHandler(req, res);

  return {
    statusCode: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null
  };
}

function resetStore() {
  delete globalThis.__FLOWER_STORE__;
  return getStore();
}

test("POST /api/orders rejects invalid customer payload", async () => {
  resetStore();

  const response = await invokeOrders({
    body: {
      customer: {
        name: "Ana",
        email: "ana@example.com",
        phone: "abc",
        address: "123 Main Street"
      },
      items: [{ flowerId: "rose-red", quantity: 1 }]
    }
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /customer\.phone/i);
});

test("POST /api/orders rejects stock conflicts", async () => {
  resetStore();

  const response = await invokeOrders({
    body: {
      customer: {
        name: "Ana",
        email: "ana@example.com",
        phone: "+1 303 555 1212",
        address: "123 Main Street"
      },
      items: [{ flowerId: "rose-red", quantity: 16 }]
    }
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /insufficient stock/i);
});

test("POST /api/orders creates order and decrements stock", async () => {
  const store = resetStore();
  const initialStock = store.flowers.find((flower) => flower.id === "rose-red").stock;

  const response = await invokeOrders({
    body: {
      customer: {
        name: "Ana",
        email: "ana@example.com",
        phone: "+1 303 555 1212",
        address: "123 Main Street"
      },
      paymentMethod: "paypal",
      items: [{ flowerId: "rose-red", quantity: 2 }]
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.paymentMethod, "paypal");
  assert.equal(response.body.paymentStatus, "pending");
  assert.equal(response.body.items[0].flowerId, "rose-red");
  assert.equal(response.body.items[0].quantity, 2);

  const nextStock = store.flowers.find((flower) => flower.id === "rose-red").stock;
  assert.equal(nextStock, initialStock - 2);
  assert.equal(store.orders.length, 1);
});
