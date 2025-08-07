const adminOnly = (req, res, next) => {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fetch user from DB (only once for this request)
  const User = require('../models/User');
  User.findById(req.user.userId).then(user => {
    if (user && user.isAdmin) {
      next();
    } else {
      res.status(403).json({ error: 'Admin access only' });
    }
  }).catch(() => {
    res.status(500).json({ error: 'Server error' });
  });
};

module.exports = adminOnly;
