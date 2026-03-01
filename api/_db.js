const { seedFlowers } = require("./_store");

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
}

function getSupabaseServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function isDatabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

function toInFilter(values) {
  const safeValues = values.map((value) => `"${String(value).replace(/"/g, '\\"')}"`);
  return `in.(${safeValues.join(",")})`;
}

async function dbRequest({ table, method = "GET", query = {}, body, prefer = "return=representation" }) {
  if (!isDatabaseConfigured()) {
    throw new Error("database is not configured");
  }

  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    params.set(key, String(value));
  });

  const url = `${getSupabaseUrl()}/rest/v1/${table}${params.toString() ? `?${params}` : ""}`;
  const headers = {
    apikey: getSupabaseServiceRoleKey(),
    Authorization: `Bearer ${getSupabaseServiceRoleKey()}`
  };

  if (prefer) {
    headers.Prefer = prefer;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.details ||
      data?.hint ||
      `database request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

function mapSeedFlowerToRow(flower) {
  return {
    id: flower.id,
    name: flower.name,
    description: flower.description,
    price: flower.price,
    occasion: flower.occasion,
    image: flower.image,
    image_focus_x: Number.isFinite(Number(flower.imageFocusX)) ? Number(flower.imageFocusX) : 50,
    image_focus_y: Number.isFinite(Number(flower.imageFocusY)) ? Number(flower.imageFocusY) : 50,
    stock: flower.stock,
    created_at: flower.createdAt
  };
}

async function ensureSeedFlowers() {
  if (!isDatabaseConfigured()) {
    return;
  }

  if (globalThis.__FLOWER_DB_SEEDED__) {
    return;
  }

  const rows = await dbRequest({
    table: "flowers",
    method: "GET",
    query: { select: "id", limit: 1, order: "created_at.desc" },
    prefer: null
  });

  if (Array.isArray(rows) && rows.length === 0) {
    await dbRequest({
      table: "flowers",
      method: "POST",
      body: seedFlowers.map(mapSeedFlowerToRow),
      prefer: "return=minimal"
    });
  }

  globalThis.__FLOWER_DB_SEEDED__ = true;
}

module.exports = {
  dbRequest,
  ensureSeedFlowers,
  isDatabaseConfigured,
  toInFilter
};
