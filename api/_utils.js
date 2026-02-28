function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return json(res, 405, { message: "method not allowed" });
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.length > 0) {
    return JSON.parse(req.body);
  }

  const raw = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function parseUrl(req) {
  return new URL(req.url, "https://example.local");
}

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  const entries = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      if (index === -1) {
        return [part, ""];
      }
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      return [key, decodeURIComponent(value)];
    });

  return Object.fromEntries(entries);
}

module.exports = {
  json,
  methodNotAllowed,
  parseCookies,
  parseUrl,
  readJsonBody
};
