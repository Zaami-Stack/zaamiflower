const { getSessionUser } = require("../_auth");
const { json, methodNotAllowed } = require("../_utils");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  const user = getSessionUser(req);
  if (!user) {
    return json(res, 200, { authenticated: false, user: null });
  }

  return json(res, 200, { authenticated: true, user });
};

