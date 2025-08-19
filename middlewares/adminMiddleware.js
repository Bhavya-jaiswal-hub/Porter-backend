// middleware/adminOnly.js
module.exports = function adminOnly(req, res, next) {
  // requireAuth middleware should already verify token & set req.user
  if (!req.user || !req.user.role) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role === 'admin') {
    return next();
  }

  return res.status(403).json({ error: 'Admin access only' });
};
