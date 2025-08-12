// File: middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("🔒 No or malformed Authorization header");
      return res.status(401).json({ error: "Missing or malformed Authorization header" });
    }

    const token = authHeader.split(" ")[1];

    // 👤 Decode token payload
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.userId) {
      console.warn("🔒 Token payload missing 'userId'");
      return res.status(403).json({ error: "Invalid token payload" });
    }

    // 🔍 Fetch user by ID from token
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      console.warn(`🔒 User not found for ID: ${decoded.userId}`);
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user; // 💾 Attach user to request
    next();
  } catch (err) {
    console.error("❌ Auth Middleware Error:", err.message);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

module.exports = authenticateToken;
