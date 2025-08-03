const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const transporter = require("../utils/mailer");
const User = require("../models/User");

const otpStore = new Map(); // Stores OTP temporarily

// Send OTP
router.post("/send-otp", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with user details for later verification
    otpStore.set(email, {
      name,
      password,
      otp,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes expiry
    });

    // Send the OTP email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Email Verification OTP",
      html: `<p>Your OTP is <b>${otp}</b>. It expires in 5 minutes.</p>`
    });

    return res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    console.error("Send OTP Error:", err);
    return res.status(500).json({ message: "Failed to send OTP" });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore.get(email);

  if (!record) {
    return res.status(400).json({ message: "OTP not found or expired" });
  }

  if (record.otp !== otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  if (Date.now() > record.expires) {
    otpStore.delete(email);
    return res.status(400).json({ message: "OTP expired" });
  }

  try {
    const hashedPassword = await bcrypt.hash(record.password, 10);
    const newUser = new User({
      name: record.name,
      email,
      password: hashedPassword
    });

    await newUser.save();

    // Clear OTP after successful verification
    otpStore.delete(email);

    // Generate token
    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "1h"
    });

    return res.json({ success: true, token });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    return res.status(500).json({ message: "Failed to create user" });
  }
});

module.exports = router;
