const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

process.env.NODE_ENV = "test";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const chatHandler = require("../../api/chat");
const { getStore } = require("../../api/_store");

function createMockRequest({ method, url, body, headers }) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url || "/api/chat";
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

async function invokeChat(body) {
  const req = createMockRequest({
    method: "POST",
    body
  });
  const res = createMockResponse();
  await chatHandler(req, res);

  return {
    statusCode: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null
  };
}

function resetStore() {
  delete globalThis.__FLOWER_STORE__;
  return getStore();
}

test("POST /api/chat rejects empty message", async () => {
  resetStore();

  const response = await invokeChat({
    message: "   "
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /message is required/i);
});

test("POST /api/chat returns local chatbot response", async () => {
  resetStore();

  const response = await invokeChat({
    message: "What is your cheapest bouquet?"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.source, "local");
  assert.match(response.body.reply, /budget-friendly option|pricing/i);
});
