// controllers/driverAuthController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Driver = require('../models/Driver');

// Config
const ACCESS_TTL = process.env.ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.REFRESH_TTL || '7d';
const COOKIE_NAME = 'rt_driver';
const COOKIE_PATH = '/api/driver/auth';
const IS_PROD = process.env.NODE_ENV === 'production';

// Helpers
function buildPayload(driver) {
  return {
    sub: driver._id.toString(),
    role: 'driver',
    status: driver.onboarding?.status || 'pending',
  };
}

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: COOKIE_PATH,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: COOKIE_PATH,
  });
}

// Controllers
async function register(req, res) {
  try {
    let { name, email, password, phone, vehicleType } = req.body || {};

    if (!name || !email || !password || !vehicleType) {
      return res.status(400).json({ message: 'name, email, password, vehicleType are required' });
    }

    email = String(email).toLowerCase().trim();

    const exists = await Driver.findOne({ email }).lean();
    if (exists) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);

    const driver = await Driver.create({
      name: name.trim(),
      email,
      password: hash,
      phone: phone ? String(phone).trim() : null,
      vehicleType: String(vehicleType).trim().toLowerCase(),
      onboarding: { status: 'pending' },
    });

    return res.status(201).json({ id: driver._id });
  } catch (err) {
    // Handle duplicate key or validation errors cleanly
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    return res.status(500).json({ message: 'Registration failed' });
  }
}

async function login(req, res) {
  try {
    let { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    email = String(email).toLowerCase().trim();

    const driver = await Driver.findOne({ email });
    if (!driver) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, driver.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const payload = buildPayload(driver);
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh(payload);

    setRefreshCookie(res, refreshToken);
    return res.json({ accessToken });
  } catch (err) {
    return res.status(500).json({ message: 'Login failed' });
  }
}

async function refresh(req, res) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ message: 'No refresh token' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Optionally re-fetch to ensure status/role are current
    const driver = await Driver.findById(decoded.sub).select('onboarding');
    if (!driver) return res.status(401).json({ message: 'Invalid session' });

    const payload = {
      sub: decoded.sub,
      role: 'driver',
      status: driver.onboarding?.status || 'pending',
    };

    const newAccess = signAccess(payload);
    const newRefresh = signRefresh(payload);
    setRefreshCookie(res, newRefresh);

    return res.json({ accessToken: newAccess });
  } catch (err) {
    return res.status(500).json({ message: 'Refresh failed' });
  }
}

async function me(req, res) {
  try {
    const auth = req.headers.authorization || '';
    const raw = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!raw) return res.status(401).json({ message: 'Unauthorized' });

    let decoded;
    try {
      decoded = jwt.verify(raw, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const driver = await Driver.findById(decoded.sub).select('-password');
    if (!driver) return res.status(404).json({ message: 'Not found' });

    return res.json(driver);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch profile' });
  }
}

async function logout(_req, res) {
  clearRefreshCookie(res);
  return res.status(204).end();
}

module.exports = {
  register,
  login,
  refresh,
  me,
  logout,
};
