const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Driver = require('../models/Driver');
const Otp = require('../models/Otp'); // Schema: { email, name, password, phone, vehicleType, otp, expiresAt }
const transporter = require('../utils/mailer'); // Nodemailer transporter

// Config
const ACCESS_TTL = process.env.ACCESS_TTL || '1d';
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

// ---------------- OTP Controllers ----------------

// POST /api/driver/auth/send-otp
async function sendOtp(req, res) {
  try {
    let { name, email, password, phone, vehicleType } = req.body || {};
    if (!name || !email || !password || !vehicleType) {
      return res.status(400).json({ message: 'name, email, password, vehicleType are required' });
    }

    email = String(email).toLowerCase().trim();

    // Check if already registered
    const exists = await Driver.findOne({ email }).lean();
    if (exists) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store OTP + registration details in DB with expiry (5 min)
    await Otp.findOneAndUpdate(
      { email },
      {
        name: name.trim(),
        email,
        password: hashedPassword,
        phone: phone ? String(phone).trim() : null,
        vehicleType: String(vehicleType).trim().toLowerCase(),
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000
      },
      { upsert: true, new: true }
    );

    // Send OTP email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
       html: `
  <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
    <div style="max-width: 500px; margin: auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
      <div style="background-color: #6C63FF; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🚚 Delivery King</h1>
      </div>
      <div style="padding: 30px; text-align: center;">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
          Use the OTP below to complete your registration. This code will expire in 5 minutes.
        </p>
        <div style="display: inline-block; background-color: #f0f0f0; padding: 15px 25px; border-radius: 8px; margin-bottom: 20px;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #6C63FF;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #777;">
          If you didn’t request this, you can safely ignore this email.
        </p>
      </div>
    </div>
  </div>
  `
});

    return res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('sendOtp error:', err);
    return res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
}

// POST /api/driver/auth/verify-otp
// POST /api/driver/auth/verify-otp
async function verifyOtp(req, res) {
  try {
    let { email, otp } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    email = String(email).toLowerCase().trim();

    // Check OTP record
    const record = await Otp.findOne({ email, otp });
    console.log('OTP record found:', record);

    if (!record) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    if (record.expiresAt < Date.now()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    // Create driver with schema defaults
    const driver = await Driver.create({
      name: record.name,
      email: record.email,
      password: record.password, // already hashed
      phone: record.phone,
      vehicleType: record.vehicleType
    });

    // Delete OTP record
    await Otp.deleteOne({ email });

    return res.status(201).json({ message: 'Registration successful', id: driver._id });
  } catch (err) {
    console.error('verifyOtp error:', err);
    return res.status(500).json({ message: 'OTP verification failed', error: err.message });
  }
}

   

// ---------------- Existing Controllers ----------------

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
  sendOtp,
  verifyOtp,
  register,
  login,
  refresh,
  me,
  logout,
};
