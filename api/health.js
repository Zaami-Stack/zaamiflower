const { json, methodNotAllowed } = require("./_utils");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return json(res, 200, {
    status: "ok",
    service: "flower-shop-api",
    timestamp: new Date().toISOString()
  });
};

