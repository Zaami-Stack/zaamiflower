const { clearSessionCookie } = require("../_auth");
const { json, methodNotAllowed } = require("../_utils");

module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  clearSessionCookie(res);
  return json(res, 200, { ok: true });
};

