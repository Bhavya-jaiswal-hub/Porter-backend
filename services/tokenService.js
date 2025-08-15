// services/tokenService.js
const jwt = require('jsonwebtoken');

const ACCESS_TTL = process.env.ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.REFRESH_TTL || '7d';

/**
 * Build the standard payload for a token
 * @param {Object} data - { sub, role, ... }
 */
function buildPayload(data) {
  return {
    sub: data.sub,   // user/driver/admin id
    role: data.role, // 'driver' | 'admin'
    ...data.extra    // optional extra claims
  };
}

/**
 * Sign an access token
 */
function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

/**
 * Sign a refresh token
 */
function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

/**
 * Verify an access token
 */
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * Verify a refresh token
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = {
  buildPayload,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
