const {
  authenticateCredentials,
  clearSessionCookie,
  isAuthConfigured,
  setSessionCookie
} = require("../_auth");
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

  const email = body?.email;
  const password = body?.password;
  const user = authenticateCredentials(email, password);

  if (!user) {
    clearSessionCookie(res);
    return json(res, 401, { message: "invalid email or password" });
  }

  setSessionCookie(res, user);
  return json(res, 200, { user });
};
