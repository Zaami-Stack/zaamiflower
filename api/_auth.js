const { createHmac, randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const { createId, getStore } = require("./_store");
const { dbRequest, isDatabaseConfigured } = require("./_db");
const { json, parseCookies } = require("./_utils");

const SESSION_COOKIE = "zaami_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24;

function base64urlEncode(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getSecret() {
  return process.env.AUTH_SECRET || "change-this-auth-secret";
}

function hasValidSecret() {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const secret = process.env.AUTH_SECRET || "";
  return secret.length >= 24 && secret !== "change-this-auth-secret";
}

function signToken(payload) {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64urlEncode(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = createHmac("sha256", getSecret())
    .update(unsigned)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${unsigned}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const unsigned = `${header}.${body}`;
  const expected = createHmac("sha256", getSecret())
    .update(unsigned)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(body));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return null;
  }

  return payload;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(storedPassword, inputPassword) {
  const stored = String(storedPassword || "");
  const input = String(inputPassword || "");

  if (!stored.startsWith("scrypt$")) {
    return safeEqual(stored, input);
  }

  const parts = stored.split("$");
  if (parts.length !== 3) {
    return false;
  }

  const [, salt, expectedHashHex] = parts;
  const inputHashHex = scryptSync(input, salt, 64).toString("hex");
  const expected = Buffer.from(expectedHashHex, "hex");
  const actual = Buffer.from(inputHashHex, "hex");
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

function getConfiguredUsers() {
  const isProduction = process.env.NODE_ENV === "production";
  const adminEmail = process.env.ADMIN_EMAIL || (isProduction ? "" : "admin@zaamiflower.com");
  const adminPassword = process.env.ADMIN_PASSWORD || (isProduction ? "" : "Admin1234!");
  const customerEmail =
    process.env.CUSTOMER_EMAIL || (isProduction ? "" : "customer@zaamiflower.com");
  const customerPassword =
    process.env.CUSTOMER_PASSWORD || (isProduction ? "" : "Customer1234!");

  if (!adminEmail || !adminPassword) {
    return [];
  }

  const users = [
    {
      id: "admin-1",
      name: "Admin",
      email: normalizeEmail(adminEmail),
      password: adminPassword,
      role: "admin"
    }
  ];

  if (customerEmail && customerPassword) {
    users.push({
      id: "customer-1",
      name: "Customer",
      email: normalizeEmail(customerEmail),
      password: customerPassword,
      role: "customer"
    });
  }

  return users;
}

function getLocalUsers() {
  const store = getStore();
  if (!Array.isArray(store.users)) {
    store.users = [];
  }
  return store.users;
}

async function findDbUserByEmail(email) {
  const rows = await dbRequest({
    table: "users",
    method: "GET",
    query: {
      select: "id,name,email,password,role,created_at",
      email: `eq.${email}`,
      limit: 1
    },
    prefer: null
  });
  return rows[0] || null;
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name || "",
    email: user.email,
    role: user.role
  };
}

function isAuthConfigured() {
  return getConfiguredUsers().length > 0 && hasValidSecret();
}

async function authenticateCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "");

  for (const user of getConfiguredUsers()) {
    if (!safeEqual(user.email, normalizedEmail)) {
      continue;
    }
    if (verifyPassword(user.password, normalizedPassword)) {
      return toPublicUser(user);
    }
  }

  if (isDatabaseConfigured()) {
    const dbUser = await findDbUserByEmail(normalizedEmail);
    if (!dbUser) {
      return null;
    }
    if (!verifyPassword(dbUser.password, normalizedPassword)) {
      return null;
    }
    return toPublicUser(dbUser);
  }

  const localUser = getLocalUsers().find((user) => safeEqual(user.email, normalizedEmail));
  if (!localUser) {
    return null;
  }
  if (!verifyPassword(localUser.password, normalizedPassword)) {
    return null;
  }
  return toPublicUser(localUser);
}

async function registerCustomer({ name, email, password }) {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "");

  if (normalizedName.length < 2) {
    throw new Error("name must be at least 2 characters");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("valid email is required");
  }
  if (normalizedPassword.length < 8) {
    throw new Error("password must be at least 8 characters");
  }

  const configuredUserExists = getConfiguredUsers().some((user) =>
    safeEqual(user.email, normalizedEmail)
  );
  if (configuredUserExists) {
    throw new Error("email already exists");
  }

  if (isDatabaseConfigured()) {
    const existing = await findDbUserByEmail(normalizedEmail);
    if (existing) {
      throw new Error("email already exists");
    }

    const rows = await dbRequest({
      table: "users",
      method: "POST",
      body: {
        id: createId(12),
        name: normalizedName,
        email: normalizedEmail,
        password: hashPassword(normalizedPassword),
        role: "customer",
        created_at: new Date().toISOString()
      }
    });

    return toPublicUser(rows[0]);
  }

  const localUsers = getLocalUsers();
  const localExists = localUsers.some((user) => safeEqual(user.email, normalizedEmail));
  if (localExists) {
    throw new Error("email already exists");
  }

  const user = {
    id: createId(12),
    name: normalizedName,
    email: normalizedEmail,
    password: hashPassword(normalizedPassword),
    role: "customer",
    createdAt: new Date().toISOString()
  };

  localUsers.push(user);
  return toPublicUser(user);
}

function serializeCookie(name, value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(
    value
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function setSessionCookie(res, user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: now + SESSION_TTL_SECONDS
  };
  const token = signToken(payload);
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, token, SESSION_TTL_SECONDS));
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role
  };
}

function requireRole(req, res, allowedRoles) {
  if (!isAuthConfigured()) {
    json(res, 503, { message: "authentication is not configured" });
    return null;
  }

  const user = getSessionUser(req);
  if (!user) {
    json(res, 401, { message: "authentication required" });
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    json(res, 403, { message: "insufficient permissions" });
    return null;
  }

  return user;
}

module.exports = {
  authenticateCredentials,
  clearSessionCookie,
  getSessionUser,
  isAuthConfigured,
  registerCustomer,
  requireRole,
  setSessionCookie
};

