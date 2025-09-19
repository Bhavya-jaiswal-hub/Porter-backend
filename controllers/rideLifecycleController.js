const {
  acceptRide,
  startRide,
  completeRide,
  pickupComplete // ✅ import the new shared function
} = require('../socketHandlers/rideRequests');

/**
 * Accept Ride via API
 */
exports.acceptRideAPI = async (req, res) => {
  try {
    await acceptRide(req.io, {
      bookingId: req.params.bookingId,
      driverId: req.user?.id || req.body.driverId,
      socketId: null // no socket context in API
    });
    res.status(200).json({ message: 'Ride accepted' });
  } catch (err) {
    console.error('❌ Error accepting ride via API:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Pickup Complete via API
 */
exports.pickupCompleteAPI = async (req, res) => {
  try {
    await pickupComplete(req.io, req.params.bookingId);
    res.status(200).json({ message: 'Pickup complete' });
  } catch (err) {
    console.error('❌ Error marking pickup complete via API:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Start Ride via API
 */
exports.startRideAPI = async (req, res) => {
  try {
    await startRide(req.io, req.params.bookingId);
    res.status(200).json({ message: 'Ride started' });
  } catch (err) {
    console.error('❌ Error starting ride via API:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Complete Ride via API
 */
exports.completeRideAPI = async (req, res) => {
  try {
    await completeRide(req.io, req.params.bookingId);
    res.status(200).json({ message: 'Ride completed' });
  } catch (err) {
    console.error('❌ Error completing ride via API:', err);
    res.status(500).json({ error: err.message });
  }
};
