const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');

exports.createBooking = async (req, res) => {
  const { pickupLocation, dropLocation, vehicleId, distance } = req.body;
  const userId = req.user.userId;

  try {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const fare = distance * vehicle.ratePerKm;

    const booking = new Booking({
      user: userId,
      vehicle: vehicleId,
      pickupLocation,
      dropLocation,
      distance,
      fare
    });

    await booking.save();
    res.status(201).json({ message: 'Booking created', booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBookingHistory = async (req, res) => {
  const userId = req.user.userId;

  try {
    const bookings = await Booking.find({ user: userId })
      .populate('vehicle', 'name ratePerKm capacity') // pulls vehicle details
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateBookingStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'paid', 'enroute', 'arrived', 'delivered'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    const updated = await Booking.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('vehicle', 'name');

    if (!updated) return res.status(404).json({ error: 'Booking not found' });

    res.json({ message: 'Status updated', booking: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
