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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed Authorization header' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Accept multiple possible id fields
      const id = decoded.userId || decoded.sub || decoded._id;
      if (!id) {
        return res.status(403).json({ error: 'Invalid token payload' });
      }

      // Role check
      if (allowedRoles.length > 0) {
        const role = decoded.role || 'user';
        if (!allowedRoles.includes(role)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        req.userRole = role;
      }

      req.user = {
        id,
        role: decoded.role || 'user',
        ...decoded
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
