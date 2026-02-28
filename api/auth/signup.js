const { clearSessionCookie, isAuthConfigured, registerCustomer, setSessionCookie } = require("../_auth");
const { json, methodNotAllowed, readJsonBody } = require("../_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  if (!isAuthConfigured()) {
    clearSessionCookie(res);
    return json(res, 503, {
      message:
        "authentication is not configured. Set AUTH_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD."
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { message: "invalid JSON body" });
  }

  try {
    const user = registerCustomer({
      name: body?.name,
      email: body?.email,
      password: body?.password
    });
    setSessionCookie(res, user);
    return json(res, 201, { user });
  } catch (error) {
    return json(res, 400, { message: error.message || "signup failed" });
  }
};

