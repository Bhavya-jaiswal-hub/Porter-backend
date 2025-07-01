const Booking = require('../models/Booking');

exports.simulatePayment = async (req, res) => {
  const { bookingId } = req.body;
  const userId = req.user.userId;

  try {
    const booking = await Booking.findOne({ _id: bookingId, user: userId });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.status === 'paid') {
      return res.status(400).json({ message: 'Already paid' });
    }

    // Simulate payment success
    booking.status = 'paid';
    await booking.save();

    res.json({ message: 'Payment successful', booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
