const RideRequest = require('../models/RideRequest');
// Import the shared matching function from socketHandlers
const { matchAndEmitRide } = require('../socketHandlers/rideRequests');

/**
 * GET all ride requests (optional filter by driverId)
 */
exports.getAllRideRequests = async (req, res) => {
  console.log('Hit GET /ride-requests');
  try {
    const { driverId } = req.query;
    const query = driverId ? { driverId } : {};

    const rideRequests = await RideRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email phone')
      .populate('driverId', 'name email phone');

    return res.status(200).json(rideRequests);
  } catch (error) {
    console.error('❌ Error fetching ride requests:', error);
    return res.status(500).json({ error: 'Failed to fetch ride requests' });
  }
};

/**
 * Test route
 */
exports.testRoute = (req, res) => {
  return res.send('Ride request route is working');
};

/**
 * POST create a ride request
 * - Saves the ride in DB
 * - Immediately triggers driver matching via WebSocket
 */
exports.createRideRequest = async (req, res) => {
  console.log('📥 POST /ride-requests hit');

  try {
    const { pickupLocation, dropLocation, fareEstimate, vehicleType, userSocketId } = req.body;

    // Debug: log incoming request body
    console.log("🔍 Incoming ride request body:", {
      pickupLocation,
      dropLocation,
      fareEstimate,
      vehicleType,
      userSocketId
    });

    // Validation
    if (!vehicleType) {
      console.warn("⚠️ Missing vehicleType");
      return res.status(400).json({ error: 'Vehicle type is required' });
    }
    if (!pickupLocation?.address || !dropLocation?.address) {
      console.warn("⚠️ Missing pickup/drop address");
      return res.status(400).json({ error: 'Pickup and drop addresses are required' });
    }
    if (
      !pickupLocation?.lat || !pickupLocation?.lng ||
      !dropLocation?.lat || !dropLocation?.lng
    ) {
      console.warn("⚠️ Missing pickup/drop coordinates");
      return res.status(400).json({ error: 'Pickup and drop coordinates are required' });
    }

    const validUserId = req.user?.id;
    console.log("👤 Authenticated userId:", validUserId);

    if (!validUserId) {
      console.error("❌ User authentication failed");
      return res.status(401).json({ error: 'User authentication failed' });
    }

    // Generate booking ID
    const generatedBookingId = `RID-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    console.log("🆔 Generated bookingId:", generatedBookingId);

    const ride = new RideRequest({
      userId: validUserId,
      pickupLocation,
      dropLocation,
      fareEstimate,
      bookingId: generatedBookingId,
      vehicleType,
      driverId: null,
      status: 'pending',
      userSocketId: userSocketId || null // ✅ store socket ID if provided
    });

    await ride.save();
    console.log("💾 Ride saved to DB with userSocketId:", ride.userSocketId);

    let matchedDrivers = 0;

    // 🔄 Immediately trigger driver matching via WebSocket
    if (req.io) {
      try {
        console.log("📡 Triggering matchAndEmitRide for bookingId:", generatedBookingId);
        matchedDrivers = await matchAndEmitRide(req.io, generatedBookingId) || 0;
        console.log(`📊 matchAndEmitRide found ${matchedDrivers} driver(s)`);
      } catch (err) {
        console.error('⚠️ Error matching drivers after ride creation:', err);
      }
    } else {
      console.warn("⚠️ req.io is not available — cannot trigger driver matching");
    }

    return res.status(201).json({
      message: matchedDrivers > 0
        ? 'Ride request created and drivers notified'
        : 'Ride request created but no approved drivers available',
      bookingId: generatedBookingId,
      matchedDrivers,
      ride
    });

  } catch (error) {
    console.error('❌ Error creating ride request:', error);
    return res.status(500).json({ error: 'Failed to create ride request' });
  }
};



/**
 * GET ride details by bookingId
 */
exports.getRideByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID is required' });
    }

    const ride = await RideRequest.findOne({ bookingId })
      .populate('userId', 'name email phone')
      .populate('driverId', 'name email phone');

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    return res.status(200).json({ ride });
  } catch (error) {
    console.error('❌ Error fetching ride details:', error);
    return res.status(500).json({ error: 'Failed to fetch ride details' });
  }
};

// controllers/rideRequestController.js



exports.getNearbyPendingRides = async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: "lat and lng query parameters are required" });
    }

    const searchRadius = radius ? parseFloat(radius) * 1000 : 5000;

    const rides = await RideRequest.find({
      status: 'pending',
      pickupPoint: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: searchRadius
        }
      }
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email phone');

    // ✅ Always return 200 with an array
    return res.status(200).json(rides || []);
  } catch (error) {
    console.error('❌ Error fetching nearby pending rides:', error);
    return res.status(500).json({ error: 'Failed to fetch nearby rides' });
  }
};
  
