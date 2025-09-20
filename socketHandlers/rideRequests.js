
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
// ----------------- Match and Emit Ride -----------------
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

    const driverDoc = await Driver.findById(drv.driverId).lean();
    if (!driverDoc || driverDoc.onboarding.status !== "approved") continue;

    nearbyEntries.push([socketId, drv, driverDoc]);
  }

  if (nearbyEntries.length === 0) {
    console.log("🚫 No approved drivers available within radius/type for", bookingId);
    if (ride.userSocketId) {
      io.to(ride.userSocketId).emit("no-drivers-found", { bookingId });
    }
    return 0;
  }

  console.log(`✅ Notifying ${nearbyEntries.length} approved driver(s) for booking ${bookingId}:`);
  nearbyEntries.forEach(([, , driverDoc], index) => {
    console.log(
      `   ${index + 1}. DriverID: ${driverDoc._id}, Name: ${driverDoc.name}, Phone: ${driverDoc.phone || "N/A"}`
    );
  });

  nearbyEntries.forEach(([, drv]) => {
    io.to(drv.socketId).emit("new-ride-request", {
      ...ride,
      vehicleType: type,
      userId: userId?._id || null,
      customerName: userId?.name || "Guest",
      customerPhone: userId?.phone || "",
    });
  });

  return nearbyEntries.length;
}

// ----------------- Accept Ride -----------------
async function acceptRide(io, { bookingId, driverId, socketId }) {
  console.log("🚦 acceptRide called with:", { bookingId, driverId, socketId });

  try {
    // Step 1: Atomically update ride status to 'accepted'
    const rideDoc = await RideRequest.findOneAndUpdate(
      { bookingId, status: { $in: ["pending", "searching"] } },
      { $set: { status: "accepted", driverId } },
      { new: true }
    );

    if (!rideDoc) {
      console.warn(`⚠️ Ride ${bookingId} not found or already taken`);
      io.to(socketId).emit("rideAlreadyTaken", { bookingId });
      return;
    }

    // Convert to plain object
    const ride = rideDoc.toObject();

    // ✅ Normalize fields so frontend always has pickupLocation/dropLocation
    ride.pickupLocation = ride.pickupLocation || ride.pickupPoint || null;
    ride.dropLocation = ride.dropLocation || ride.dropPoint || null;

    // Step 2: Fetch driver details
    let driver = null;
    try {
      driver = await Driver.findById(driverId).lean();
      console.log("🚚 Driver found:", driver ? driver.name : "No driver found");
    } catch (err) {
      console.error("❌ Error fetching driver:", err);
    }

    // Step 3: Store active booking mapping
    activeBookings[bookingId] = {
      userSocketId: ride.userSocketId || null,
      driverSocketId: socketId,
    };

    // Step 4: Build payload with normalized ride + driver info
    const payload = {
      ...ride,
      driverId,
      driverName: driver?.name || "Driver",
      driverPhone: driver?.phone || "N/A",
      status: "accepted",
    };

    // Step 5: Notify the winning driver
    io.to(socketId).emit("ride-confirmed", payload);

    // Step 6: Notify the user directly
    if (ride.userSocketId) {
      io.to(ride.userSocketId).emit("ride-confirmed", payload);
    }

    // Step 7: Notify all other drivers they lost
    Object.entries(availableDrivers).forEach(([sid, drv]) => {
      if (sid !== socketId) {
        io.to(drv.socketId).emit("rideAlreadyTaken", { bookingId });
      }
    });

    // Step 8: Remove accepted driver from available list
    delete availableDrivers[socketId];
    console.log(`🗑️ Removed driver socket ${socketId} from availableDrivers`);
  } catch (err) {
    console.error("❌ Error in acceptRide:", err);
    io.to(socketId).emit("serverError", { message: err.message });
  }
}


// ----------------- Start Pickup -----------------
async function startPickup(io, { bookingId, driverId, socketId }) {
  console.log("🚦 startPickup called with:", { bookingId, driverId, socketId });

  try {
    const rideDoc = await RideRequest.findOneAndUpdate(
      { bookingId, driverId, status: "accepted" },
      { $set: { status: "on_the_way" } },
      { new: true }
    );

    if (!rideDoc) {
      io.to(socketId).emit("serverError", { message: "Invalid transition" });
      return;
    }

    const ride = rideDoc.toObject();
    const booking = activeBookings[bookingId];
    const payload = { ...ride };

    io.to(socketId).emit("pickup-started", payload);
    if (booking?.userSocketId) io.to(booking.userSocketId).emit("pickup-started-update", payload);
  } catch (err) {
    console.error("❌ Error in startPickup:", err);
    io.to(socketId).emit("serverError", { message: err.message });
  }
}

// ----------------- Pickup Complete -----------------
async function pickupComplete(io, { bookingId, socketId }) {
  try {
    const rideDoc = await RideRequest.findOneAndUpdate(
      { bookingId, status: "on_the_way" },
      { $set: { status: "pickup_complete" } },
      { new: true }
    );

    if (!rideDoc) {
      io.to(socketId).emit("serverError", { message: "Invalid transition" });
      return;
    }

    const ride = rideDoc.toObject();
    const booking = activeBookings[bookingId];
    const payload = { ...ride };

    if (booking?.driverSocketId) io.to(booking.driverSocketId).emit("pickup-complete-update", payload);
    if (booking?.userSocketId) io.to(booking.userSocketId).emit("pickup-complete-update", payload);
  } catch (err) {
    console.error("❌ Error in pickupComplete:", err);
    io.to(socketId).emit("serverError", { message: err.message });
  }
}

// ----------------- Start Ride -----------------
async function startRide(io, { bookingId, socketId }) {
  try {
    const rideDoc = await RideRequest.findOneAndUpdate(
      { bookingId, status: "pickup_complete" },
      { $set: { status: "in_progress" } },
      { new: true }
    );

    if (!rideDoc) {
      io.to(socketId).emit("serverError", { message: "Invalid transition" });
      return;
    }

    const ride = rideDoc.toObject();
    const booking = activeBookings[bookingId];
    const payload = { ...ride };

    if (booking?.driverSocketId) io.to(booking.driverSocketId).emit("ride-started-update", payload);
    if (booking?.userSocketId) io.to(booking.userSocketId).emit("ride-started-update", payload);
  } catch (err) {
    console.error("❌ Error in startRide:", err);
    io.to(socketId).emit("serverError", { message: err.message });
  }
}

// ----------------- Complete Ride -----------------
async function completeRide(io, { bookingId, socketId }) {
  try {
    const rideDoc = await RideRequest.findOneAndUpdate(
      { bookingId, status: "in_progress" },
      { $set: { status: "completed" } },
      { new: true }
    );

    if (!rideDoc) {
      io.to(socketId).emit("serverError", { message: "Invalid transition" });
      return;
    }

    const ride = rideDoc.toObject();
    const booking = activeBookings[bookingId];
    const payload = { ...ride };

    if (booking?.driverSocketId) io.to(booking.driverSocketId).emit("ride-completed-update", payload);
    if (booking?.userSocketId) io.to(booking.userSocketId).emit("ride-completed-update", payload);

    delete activeBookings[bookingId];
  } catch (err) {
    console.error("❌ Error in completeRide:", err);
    io.to(socketId).emit("serverError", { message: err.message });
  }
}


// ----------------- Socket Registration -----------------



module.exports = function registerRideRequestSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    // ✅ Register user socket for all active rides
    socket.on("registerUser", async (userId) => {
      console.log(`📝 Registering user ${userId} with socket ${socket.id}`);
      try {
        await RideRequest.updateMany(
          {
            userId,
            status: {
              $in: [
                "pending",
                "searching",
                "accepted",
                "on_the_way",
                "pickup_complete",
                "in_progress",
              ],
            },
          },
          { userSocketId: socket.id }
        );
      } catch (err) {
        console.error("❌ Error registering user socket:", err);
      }
    });

    // ✅ Driver sends location updates
    socket.on("driverLocation", ({ driverId, location, vehicleType }) => {
      const lat = Number(location?.lat);
      const lng = Number(location?.lng);
      const type = String(vehicleType || "").trim().toLowerCase();

      if (!driverId || !Number.isFinite(lat) || !Number.isFinite(lng) || !type) {
        console.warn("⚠️ Invalid driver registration data", {
          driverId,
          location,
          vehicleType,
        });
        return;
      }

      availableDrivers[socket.id] = {
        driverId: String(driverId),
        socketId: socket.id,
        location: { lat, lng },
        vehicleType: type,
      };

      // If driver has an active booking, forward location to user
      const bookingId = Object.keys(activeBookings).find(
        (bId) => activeBookings[bId].driverSocketId === socket.id
      );
      if (bookingId && activeBookings[bookingId].userSocketId) {
        io.to(activeBookings[bookingId].userSocketId).emit(
          "driver-location-update",
          {
            bookingId,
            location: { lat, lng },
          }
        );
      }
    });

    // ✅ User requests a ride
    socket.on("rideRequest", async ({ bookingId }) => {
      try {
        const matchedCount = await matchAndEmitRide(io, bookingId);
        if (matchedCount === 0) {
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

    // ✅ Driver accepts a ride (this was missing!)
    socket.on("acceptRide", (data) => {
      acceptRide(io, { ...data, socketId: socket.id });
    });

    // ✅ Driver lifecycle events
    socket.on("startPickup", (data) =>
      startPickup(io, { ...data, socketId: socket.id })
    );
    socket.on("pickupComplete", (data) =>
      pickupComplete(io, { ...data, socketId: socket.id })
    );
    socket.on("startRide", (data) =>
      startRide(io, { ...data, socketId: socket.id })
    );
    socket.on("completeRide", (data) =>
      completeRide(io, { ...data, socketId: socket.id })
    );

    // ✅ Disconnect cleanup
    socket.on("disconnect", () => {
      if (availableDrivers[socket.id]) {
        const { driverId } = availableDrivers[socket.id];
        delete availableDrivers[socket.id];
        console.log(
          `🗑️ Removed driver ${driverId || socket.id} from available list`
        );
      }
    });
  });
};


// Export shared functions for REST controllers
module.exports.startPickup = startPickup;
module.exports.pickupComplete = pickupComplete;
module.exports.startRide = startRide;
module.exports.completeRide = completeRide;
