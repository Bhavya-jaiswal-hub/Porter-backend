
// socketHandlers/rideRequests.js
const RideRequest = require("../models/RideRequest");
const Driver = require("../models/Driver");

const SEARCH_RADIUS_KM = Number(process.env.SEARCH_RADIUS_KM || 8);
const availableDrivers = {}; // socketId -> driver info
const activeBookings = {};   // bookingId -> { userSocketId, driverSocketId }

// ----------------- Utility -----------------
function getDistance(loc1, loc2) {
  const valid = (p) =>
    p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
  if (!valid(loc1) || !valid(loc2)) return Infinity;

  const toRad = (v) => (Number(v) * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLon = toRad(loc2.lng - loc1.lng);
  const lat1 = toRad(loc1.lat);
  const lat2 = toRad(loc2.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ----------------- Shared Functions -----------------

// Match nearby approved drivers and emit ride request
// Match nearby approved drivers and emit ride request
async function matchAndEmitRide(io, bookingId) {
  const ride = await RideRequest.findOne({ bookingId })
    .populate("userId", "name phone email socketId")
    .lean();

  if (!ride) {
    console.log("❌ Ride not found for bookingId", bookingId);
    return 0;
  }

  const { pickupLocation, dropLocation, fareEstimate, vehicleType: rawType, userId } = ride;
  const type = String(rawType || "").trim().toLowerCase();

  const nearbyEntries = [];

  for (const [socketId, drv] of Object.entries(availableDrivers)) {
    const distance = getDistance(
      { lat: Number(pickupLocation?.lat), lng: Number(pickupLocation?.lng) },
      drv.location
    );

    if (!Number.isFinite(distance) || distance > SEARCH_RADIUS_KM) continue;
    if (drv.vehicleType !== type) continue;

    // ✅ Check if driver is approved
    const driverDoc = await Driver.findById(drv.driverId).lean();
    if (!driverDoc || driverDoc.onboarding.status !== 'approved') continue;

    nearbyEntries.push([socketId, drv, driverDoc]);
  }

   if (nearbyEntries.length === 0) {
    console.log("🚫 No approved drivers available within radius/type for", bookingId);
    if (ride.userSocketId) {
      io.to(ride.userSocketId).emit("no-drivers-found", { bookingId });
    }
    return 0;
  }
  // Log exactly which drivers will be notified
  console.log(`✅ Notifying ${nearbyEntries.length} approved driver(s) for booking ${bookingId}:`);
  nearbyEntries.forEach(([, , driverDoc], index) => {
    console.log(
      `   ${index + 1}. DriverID: ${driverDoc._id}, Name: ${driverDoc.name}, Phone: ${driverDoc.phone || 'N/A'}`
    );
  });

  // Emit ride request to each driver
  nearbyEntries.forEach(([, drv]) => {
    io.to(drv.socketId).emit("new-ride-request", {
      bookingId,
      pickupLocation,
      dropLocation,
      fareEstimate,
      vehicleType: type,
      userId: userId?._id || null,
      customerName: userId?.name || "Guest",
      customerPhone: userId?.phone || "",
    });
  });

  return nearbyEntries.length; // ✅ return the count of drivers notified
}


async function acceptRide(io, { bookingId, driverId, socketId }) {
  console.log("🚦 acceptRide called with:", { bookingId, driverId, socketId });

  // Try to update ride status to 'on_the_way'
  const ride = await RideRequest.findOneAndUpdate(
    { bookingId, status: { $in: ["pending", "searching"] } },
    { status: "on_the_way", driverId },
    { new: true }
  );

  if (!ride) {
    console.warn(`⚠️ Ride ${bookingId} not found or already taken`);
    io.to(socketId).emit("rideAlreadyTaken", { bookingId });
    return;
  }

  console.log(`✅ Ride ${bookingId} accepted. ride.userSocketId =`, ride.userSocketId);

  // Fetch driver details
  let driver = null;
  try {
    driver = await Driver.findById(driverId).lean();
    console.log("🚚 Driver found:", driver ? driver.name : "No driver found");
  } catch (err) {
    console.error("❌ Error fetching driver:", err);
  }

  // Store active booking mapping
  activeBookings[bookingId] = {
    userSocketId: ride.userSocketId || null,
    driverSocketId: socketId
  };
  console.log("📌 activeBookings updated:", activeBookings[bookingId]);

  // Notify the winning driver
  console.log(`📤 Emitting 'ride-confirmed' to driver socket ${socketId}`);
  io.to(socketId).emit("ride-confirmed", {
    bookingId,
    driverId,
    driverName: driver?.name || "Driver",
    driverPhone: driver?.phone || "N/A",
    status: "on_the_way",
  });

  // Notify the user directly
  if (ride.userSocketId) {
    console.log(`📤 Emitting 'ride-confirmed' to user socket ${ride.userSocketId}`);
    io.to(ride.userSocketId).emit("ride-confirmed", {
      bookingId,
      driverId,
      driverName: driver?.name || "Driver",
      driverPhone: driver?.phone || "N/A",
      status: "on_the_way",
    });
  } else {
    console.warn(`⚠️ No userSocketId found for ride ${bookingId}, cannot emit to user`);
  }

  // Notify all other drivers
  Object.entries(availableDrivers).forEach(([sid, drv]) => {
    if (sid !== socketId) {
      console.log(`📤 Notifying driver ${drv.driverId} (socket ${drv.socketId}) that ride ${bookingId} is already taken`);
      io.to(drv.socketId).emit("rideAlreadyTaken", { bookingId });
    }
  });

  // Remove accepted driver from available list
  delete availableDrivers[socketId];
  console.log(`🗑️ Removed driver socket ${socketId} from availableDrivers`);
}


// Pickup complete
// Pickup complete
async function pickupComplete(io, bookingId) {
  const ride = await RideRequest.findOne({ bookingId });
  if (!ride) throw new Error("Ride not found");

  ride.status = "pickup_complete";
  await ride.save();

  const booking = activeBookings[bookingId];
  if (booking) {
    if (booking.userSocketId) {
      io.to(booking.userSocketId).emit("pickup-complete-update", {
        bookingId,
        status: "pickup_complete"
      });
    }
    if (booking.driverSocketId) {
      io.to(booking.driverSocketId).emit("pickup-complete-update", {
        bookingId,
        status: "pickup_complete"
      });
    }
  }
}

// Start ride
async function startRide(io, bookingId) {
  const ride = await RideRequest.findOne({ bookingId });
  if (!ride) throw new Error("Ride not found");

  ride.status = "in_progress";
  await ride.save();

  const booking = activeBookings[bookingId];
  if (booking) {
    if (booking.userSocketId) {
      io.to(booking.userSocketId).emit("ride-started-update", {
        bookingId,
        status: "in_progress"
      });
    }
    if (booking.driverSocketId) {
      io.to(booking.driverSocketId).emit("ride-started-update", {
        bookingId,
        status: "in_progress"
      });
    }
  }
}
// Complete ride
async function completeRide(io, bookingId) {
  const ride = await RideRequest.findOne({ bookingId });
  if (!ride) throw new Error("Ride not found");

  ride.status = "completed";
  await ride.save();

  const booking = activeBookings[bookingId];
  if (booking) {
    if (booking.userSocketId) {
      io.to(booking.userSocketId).emit("ride-completed-update", {
        bookingId,
        status: "completed"
      });
    }
    if (booking.driverSocketId) {
      io.to(booking.driverSocketId).emit("ride-completed-update", {
        bookingId,
        status: "completed"
      });
    }
  }

  // Stop tracking
  delete activeBookings[bookingId];
}

// ----------------- Socket Registration -----------------
module.exports = function registerRideRequestSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    // ✅ Allow frontend to register user socket ID
    socket.on("registerUser", async (userId) => {
      console.log(`📝 Registering user ${userId} with socket ${socket.id}`);
      try {
        await RideRequest.updateMany(
          { userId, status: { $in: ["pending", "searching"] } },
          { userSocketId: socket.id }
        );
      } catch (err) {
        console.error("Error registering user socket:", err);
      }
    });

    // ✅ Driver sends location updates
    socket.on("driverLocation", ({ driverId, location, vehicleType }) => {
      const lat = Number(location?.lat);
      const lng = Number(location?.lng);
      const type = String(vehicleType || "").trim().toLowerCase();

      if (!driverId || !Number.isFinite(lat) || !Number.isFinite(lng) || !type) {
        console.warn("⚠️ Invalid driver registration data", { driverId, location, vehicleType });
        return;
      }

      availableDrivers[socket.id] = {
        driverId: String(driverId),
        socketId: socket.id,
        location: { lat, lng },
        vehicleType: type,
      };

      // If driver has an active booking, send location to that booking's user
      const bookingId = Object.keys(activeBookings).find(
        (bId) => activeBookings[bId].driverSocketId === socket.id
      );
      if (bookingId && activeBookings[bookingId].userSocketId) {
        io.to(activeBookings[bookingId].userSocketId).emit("driver-location-update", {
          bookingId,
          location: { lat, lng }
        });
      }
    });

    // ✅ User requests a ride
    socket.on("rideRequest", async ({ bookingId }) => {
      try {
        const matchedCount = await matchAndEmitRide(io, bookingId);
        if (matchedCount === 0) {
          // No drivers found — notify user
          const ride = await RideRequest.findOne({ bookingId }).lean();
          if (ride?.userSocketId) {
            io.to(ride.userSocketId).emit("no-drivers-found", { bookingId });
          }
        }
        socket.bookingId = bookingId;
        socket.rideInProgress = true;
      } catch (err) {
        socket.emit("serverError", { message: err.message });
      }
    });

    // ✅ Driver accepts ride
    socket.on("acceptRide", async ({ driverId, bookingId }) => {
      try {
        await acceptRide(io, { bookingId, driverId, socketId: socket.id });
      } catch (err) {
        socket.emit("serverError", { message: err.message });
      }
    });

    // ✅ Pickup complete — only notify user & driver
    socket.on("pickupComplete", async ({ bookingId }) => {
      try {
        const ride = await RideRequest.findOne({ bookingId });
        if (!ride) throw new Error("Ride not found");
        ride.status = "pickup_complete";
        await ride.save();

        const booking = activeBookings[bookingId];
        if (booking) {
          if (booking.userSocketId) {
            io.to(booking.userSocketId).emit("pickup-complete-update", { bookingId, status: "pickup_complete" });
          }
          if (booking.driverSocketId) {
            io.to(booking.driverSocketId).emit("pickup-complete-update", { bookingId, status: "pickup_complete" });
          }
        }
      } catch (err) {
        socket.emit("serverError", { message: err.message });
      }
    });

    // ✅ Start ride — only notify user & driver
    socket.on("startRide", async ({ bookingId }) => {
      try {
        const ride = await RideRequest.findOne({ bookingId });
        if (!ride) throw new Error("Ride not found");
        ride.status = "in_progress";
        await ride.save();

        const booking = activeBookings[bookingId];
        if (booking) {
          if (booking.userSocketId) {
            io.to(booking.userSocketId).emit("ride-started-update", { bookingId, status: "in_progress" });
          }
          if (booking.driverSocketId) {
            io.to(booking.driverSocketId).emit("ride-started-update", { bookingId, status: "in_progress" });
          }
        }
      } catch (err) {
        socket.emit("serverError", { message: err.message });
      }
    });

    // ✅ Complete ride — only notify user & driver
    socket.on("completeRide", async ({ bookingId }) => {
      try {
        const ride = await RideRequest.findOne({ bookingId });
        if (!ride) throw new Error("Ride not found");
        ride.status = "completed";
        await ride.save();

        const booking = activeBookings[bookingId];
        if (booking) {
          if (booking.userSocketId) {
            io.to(booking.userSocketId).emit("ride-completed-update", { bookingId, status: "completed" });
          }
          if (booking.driverSocketId) {
            io.to(booking.driverSocketId).emit("ride-completed-update", { bookingId, status: "completed" });
          }
        }

        // Stop tracking
        delete activeBookings[bookingId];
      } catch (err) {
        socket.emit("serverError", { message: err.message });
      }
    });

    // ✅ Handle disconnect
    socket.on("disconnect", () => {
      if (availableDrivers[socket.id]) {
        const { driverId } = availableDrivers[socket.id];
        delete availableDrivers[socket.id];
        console.log(`🗑️ Removed driver ${driverId || socket.id} from available list`);
      }
    });
  });
};

// Export shared functions for REST controllers
module.exports.matchAndEmitRide = matchAndEmitRide;
module.exports.acceptRide = acceptRide;
module.exports.startRide = startRide;
module.exports.completeRide = completeRide;
