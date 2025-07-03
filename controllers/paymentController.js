const Razorpay = require("razorpay");
const Booking = require("../models/Booking");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.createOrder = async (req, res) => {
  const { amount } = req.body;

  const options = {
    amount: amount * 100,
    currency: "INR",
    receipt: `receipt_booking_${Date.now()}`,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.status(200).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.simulatePayment = async (req, res) => {
  const { bookingId } = req.body;
  const userId = req.user.userId;

  try {
    const booking = await Booking.findOne({ _id: bookingId, user: userId });
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.status === "paid") return res.status(400).json({ message: "Already paid" });

    booking.status = "paid";
    await booking.save();

    res.json({ message: "Payment successful", booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};