// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate JWTs and optionally enforce role-based access.
 *
 * @param {Array<string>} allowedRoles - Roles permitted to access this route.
 */
function authenticateToken(allowedRoles = []) {
  return (req, res, next) => {
    try {
      // 1️⃣ Check for Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed Authorization header' });
      }

      const token = authHeader.split(' ')[1];

      // 2️⃣ Verify token signature & expiration
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3️⃣ Ensure required claims exist (align with your current token shape)
      if (!decoded?.userId) {
        return res.status(403).json({ error: 'Invalid token payload' });
      }

      // 4️⃣ Role-based access check (if roles are in your tokens)
      if (allowedRoles.length > 0) {
        const role = decoded.role || 'user'; // default role if none present
        if (!allowedRoles.includes(role)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        req.userRole = role; // store role separately for clarity
      }

      // 5️⃣ Attach user info to request object
      // Keep naming consistent so downstream code doesn't break
      req.user = {
        id: decoded.userId,       // your main identifier
        role: decoded.role || 'user',
        ...decoded,               // spread the rest in case you add more claims later
      };

      return next();

    } catch (err) {
      console.error('❌ Auth Middleware Error:', err.message);
      const status = err.name === 'TokenExpiredError' ? 401 : 403;
      return res.status(status).json({ error: 'Invalid or expired token' });
    }
  };
}

module.exports = authenticateToken;
