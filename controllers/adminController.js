const Booking = require('../models/Booking');

exports.getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find().populate('user', 'email').populate('vehicle', 'name');
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments();
    const totalRevenue = await Booking.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$fare' } } }
    ]);

    res.json({
      totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
