const { requireRole } = require("./_auth");
const { createId, getStore } = require("./_store");
const { dbRequest, isDatabaseConfigured } = require("./_db");
const { json, methodNotAllowed, parseUrl, readJsonBody } = require("./_utils");

function mapNotificationRowToModel(row) {
  return {
    id: row.id,
    title: row.title || "",
    message: row.message || "",
    createdAt: row.created_at || new Date().toISOString()
  };
}

function mapNotificationModelToRow(notification) {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    created_at: notification.createdAt
  };
}

function normalizeLimit(limitValue, fallback = 20) {
  const limit = Number(limitValue);
  if (!Number.isFinite(limit)) {
    return fallback;
  }
  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function withNotificationsHint(message) {
  const normalized = String(message || "");
  if (!normalized.toLowerCase().includes("notifications")) {
    return normalized;
  }
  return `${normalized}. If you use Supabase, run supabase/schema.sql to add notifications table.`;
}

async function listNotifications(req, res) {
  const url = parseUrl(req);
  const limit = normalizeLimit(url.searchParams.get("limit"), 20);

  if (isDatabaseConfigured()) {
    const rows = await dbRequest({
      table: "notifications",
      method: "GET",
      query: { select: "*", order: "created_at.desc", limit },
      prefer: null
    });
    return json(res, 200, rows.map(mapNotificationRowToModel));
  }

  const store = getStore();
  const notifications = Array.isArray(store.notifications) ? store.notifications : [];
  const ordered = [...notifications]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
  return json(res, 200, ordered);
}

async function createNotification(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { message: "invalid JSON body" });
  }

  const title = String(body?.title || "").trim();
  const message = String(body?.message || "").trim();

  if (!title) {
    return json(res, 400, { message: "title is required" });
  }
  if (title.length > 80) {
    return json(res, 400, { message: "title must be at most 80 characters" });
  }
  if (message.length > 280) {
    return json(res, 400, { message: "message must be at most 280 characters" });
  }

  const notification = {
    id: createId(12),
    title,
    message,
    createdAt: new Date().toISOString()
  };

  if (isDatabaseConfigured()) {
    const rows = await dbRequest({
      table: "notifications",
      method: "POST",
      body: mapNotificationModelToRow(notification)
    });
    return json(res, 201, mapNotificationRowToModel(rows[0]));
  }

  const store = getStore();
  if (!Array.isArray(store.notifications)) {
    store.notifications = [];
  }
  store.notifications.unshift(notification);
  return json(res, 201, notification);
}

async function deleteNotification(req, res) {
  const url = parseUrl(req);
  const notificationId = String(url.searchParams.get("id") || "").trim();

  if (!notificationId) {
    return json(res, 400, { message: "id query param is required" });
  }

  if (isDatabaseConfigured()) {
    const rows = await dbRequest({
      table: "notifications",
      method: "DELETE",
      query: { id: `eq.${notificationId}`, select: "*" }
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return json(res, 404, { message: "notification not found" });
    }

    return json(res, 200, { ok: true, removed: mapNotificationRowToModel(rows[0]) });
  }

  const store = getStore();
  if (!Array.isArray(store.notifications)) {
    store.notifications = [];
  }

  const index = store.notifications.findIndex((item) => item.id === notificationId);
  if (index === -1) {
    return json(res, 404, { message: "notification not found" });
  }

  const [removed] = store.notifications.splice(index, 1);
  return json(res, 200, { ok: true, removed });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return await listNotifications(req, res);
    }

    if (req.method === "POST") {
      const user = requireRole(req, res, ["admin"]);
      if (!user) {
        return;
      }
      return await createNotification(req, res);
    }

    if (req.method === "DELETE") {
      const user = requireRole(req, res, ["admin"]);
      if (!user) {
        return;
      }
      return await deleteNotification(req, res);
    }

    return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
  } catch (error) {
    return json(res, 500, { message: withNotificationsHint(error.message || "internal server error") });
  }
};
