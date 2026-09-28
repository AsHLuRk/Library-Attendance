const crypto = require("crypto");

// Every API route calls this first. Returns true if the caller may continue;
// otherwise it has already sent the error response.
function requireAuth(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: "APP_PASSWORD is not configured on the server." });
    return false;
  }
  const given = String(req.headers["x-app-password"] || "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Wrong password." });
    return false;
  }
  return true;
}

module.exports = { requireAuth };
