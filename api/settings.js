const { requireRole } = require("./_auth");
const { DEFAULT_HERO_IMAGE, getStore } = require("./_store");
const { dbRequest, isDatabaseConfigured } = require("./_db");
const { json, methodNotAllowed, readJsonBody } = require("./_utils");

const IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

function mapSettingsRowToModel(row) {
  return {
    heroImage: String(row?.hero_image || DEFAULT_HERO_IMAGE),
    updatedAt: row?.updated_at || new Date().toISOString()
  };
}

function mapSettingsModelToRow(model) {
  return {
    id: "main",
    hero_image: model.heroImage,
    updated_at: model.updatedAt
  };
}

function shouldUseMemoryFallback(error) {
  const message = String(error?.message || "").toLowerCase();
  if (!message.includes("site_settings")) {
    return false;
  }
  return (
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("relation") ||
    message.includes("schema cache")
  );
}

function normalizeHeroImage(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error("heroImage is required");
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("heroImage must be a valid http/https URL");
  }

  if (!IMAGE_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("heroImage must use http or https");
  }

  return trimmed;
}

function getMemorySettings() {
  const store = getStore();
  if (!store.settings || typeof store.settings !== "object") {
    store.settings = {
      heroImage: DEFAULT_HERO_IMAGE,
      updatedAt: new Date().toISOString()
    };
  }

  if (!store.settings.heroImage) {
    store.settings.heroImage = DEFAULT_HERO_IMAGE;
  }

  if (!store.settings.updatedAt) {
    store.settings.updatedAt = new Date().toISOString();
  }

  return {
    heroImage: String(store.settings.heroImage || DEFAULT_HERO_IMAGE),
    updatedAt: store.settings.updatedAt
  };
}

async function getDbSettings() {
  const rows = await dbRequest({
    table: "site_settings",
    method: "GET",
    query: { select: "*", id: "eq.main", limit: 1 },
    prefer: null
  });

  if (Array.isArray(rows) && rows.length > 0) {
    return mapSettingsRowToModel(rows[0]);
  }

  const defaultModel = {
    heroImage: DEFAULT_HERO_IMAGE,
    updatedAt: new Date().toISOString()
  };

  const created = await dbRequest({
    table: "site_settings",
    method: "POST",
    body: mapSettingsModelToRow(defaultModel)
  });

  return mapSettingsRowToModel(created[0]);
}

async function listSettings(_req, res) {
  if (isDatabaseConfigured()) {
    try {
      const settings = await getDbSettings();
      return json(res, 200, settings);
    } catch (error) {
      if (!shouldUseMemoryFallback(error)) {
        throw error;
      }
    }
  }

  return json(res, 200, getMemorySettings());
}

async function updateSettings(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { message: "invalid JSON body" });
  }

  let heroImage;
  try {
    heroImage = normalizeHeroImage(body?.heroImage);
  } catch (error) {
    return json(res, 400, { message: error.message });
  }

  const payload = {
    heroImage,
    updatedAt: new Date().toISOString()
  };

  if (isDatabaseConfigured()) {
    try {
      const patchedRows = await dbRequest({
        table: "site_settings",
        method: "PATCH",
        query: { id: "eq.main", select: "*" },
        body: {
          hero_image: payload.heroImage,
          updated_at: payload.updatedAt
        }
      });

      if (Array.isArray(patchedRows) && patchedRows.length > 0) {
        return json(res, 200, mapSettingsRowToModel(patchedRows[0]));
      }

      const createdRows = await dbRequest({
        table: "site_settings",
        method: "POST",
        body: mapSettingsModelToRow(payload)
      });
      return json(res, 200, mapSettingsRowToModel(createdRows[0]));
    } catch (error) {
      if (!shouldUseMemoryFallback(error)) {
        throw error;
      }
    }
  }

  const store = getStore();
  store.settings = payload;
  return json(res, 200, payload);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return await listSettings(req, res);
    }

    if (req.method === "PATCH") {
      const user = requireRole(req, res, ["admin"]);
      if (!user) {
        return;
      }
      return await updateSettings(req, res);
    }

    return methodNotAllowed(res, ["GET", "PATCH"]);
  } catch (error) {
    return json(res, 500, { message: error.message || "internal server error" });
  }
};
