const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// 🧾 Create Razorpay Order
router.post("/create-order", async (req, res) => {
  const { amount } = req.body;

  const options = {
    amount: amount * 100, 
    currency: "INR",
    receipt: `receipt_booking_${Date.now()}`,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.status(200).json(order); // ⬅ matches your controller format
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
