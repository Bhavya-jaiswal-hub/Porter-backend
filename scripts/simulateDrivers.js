// simulateDrivers.js
const mongoose = require("mongoose");
const { io } = require("socket.io-client");

// ==== CONFIG ====
require("dotenv").config();
const SERVER_URL = "http://localhost:8080"; // backend socket URL
const API_URL = "http://localhost:8080/api/ride-requests"; // backend HTTP API
const MONGO_URI = process.env.MONGO_URI;
const VEHICLE_TYPE = "truck";
const BASE_LAT = 27.1767;
const BASE_LNG = 78.0081;
const START_RADIUS_KM = 5; // driver start radius
const PICKUP_RADIUS_KM = 8; // pickup random radius
const TEST_BOOKING_INTERVAL = 30000; // 30s between test bookings
const TEST_USER_TOKEN = process.env.TEST_USER_TOKEN; // JWT for a test user

// ==== DRIVER MODEL ====
const driverSchema = new mongoose.Schema({
  name: String,
  phone: String,
  onboarding: { status: String },
  vehicleType: String
});
const Driver = mongoose.model("Driver", driverSchema);

// ==== HELPERS ====
// Convert km to degrees roughly (valid for small distances)
function kmToDeg(km) {
  return km / 111;
}

// Generate a random lat/lng within a circle of given radius (km)
function randomPoint(baseLat, baseLng, radiusKm) {
  const r = radiusKm * Math.sqrt(Math.random()); // uniform distribution in circle
  const theta = Math.random() * 2 * Math.PI;
  const dx = r * Math.cos(theta);
  const dy = r * Math.sin(theta);
  const newLat = baseLat + kmToDeg(dy);
  const newLng = baseLng + kmToDeg(dx) / Math.cos(baseLat * Math.PI / 180);
  return { lat: newLat, lng: newLng };
}

// Small jitter for movement simulation
function randomOffset() {
  return (Math.random() - 0.5) * 0.002;
}

function createDriverSocket(driver) {
  let onRide = false; // track per-driver ride state

  // Assign a unique start location for this driver
  const startLoc = randomPoint(BASE_LAT, BASE_LNG, START_RADIUS_KM);

  const socket = io(SERVER_URL, {
    transports: ["websocket"],
    reconnection: true
  });

  function sendLocation() {
    socket.emit("driverLocation", {
      driverId: driver._id.toString(),
      vehicleType: driver.vehicleType || VEHICLE_TYPE,
      location: {
        lat: startLoc.lat + randomOffset(),
        lng: startLoc.lng + randomOffset()
      }
    });
  }

  socket.on("connect", () => {
    console.log(`🚚 Driver ${driver.name} (${driver._id}) connected as socket ${socket.id}`);
    sendLocation();
    setInterval(sendLocation, 5000);
  });

  socket.on("new-ride-request", (data) => {
    if (!onRide) {
      onRide = true; // mark driver busy
      console.log(`📦 Driver ${driver.name} got ride request: ${data.bookingId}`);
      setTimeout(() => {
        console.log(`✅ Driver ${driver.name} accepting ride ${data.bookingId}`);
        socket.emit("acceptRide", {
          driverId: driver._id.toString(),
          bookingId: data.bookingId
        });
      }, Math.random() * 2000 + 500);
    } else {
      console.log(`❌ Driver ${driver.name} ignoring ride ${data.bookingId} (already on a ride)`);
    }
  });

  socket.on("ride-confirmed", (data) => {
    if (data.driverId === driver._id.toString()) {
      console.log(`🚀 Driver ${driver.name} confirmed for booking ${data.bookingId}`);

      setTimeout(() => {
        console.log(`📍 Pickup complete`);
        socket.emit("pickupComplete", { bookingId: data.bookingId });
      }, 2000);

      setTimeout(() => {
        console.log(`🛣️ Starting ride`);
        socket.emit("startRide", { bookingId: data.bookingId });
      }, 4000);

      setTimeout(() => {
        console.log(`🏁 Completed ride`);
        socket.emit("completeRide", { bookingId: data.bookingId });

        // After ride completion, mark driver free and re-register location
        setTimeout(() => {
          onRide = false;
          console.log(`🔄 Driver ${driver.name} is now available again`);
          sendLocation();
        }, 2000);
      }, 8000);
    }
  });

  socket.on("rideAlreadyTaken", (data) => {
    console.log(`❌ Driver ${driver.name} notified: ride ${data.bookingId} already taken`);
  });
}

// ==== TEST BOOKING GENERATOR ====
async function sendTestBooking() {
  const pickup = randomPoint(BASE_LAT, BASE_LNG, PICKUP_RADIUS_KM);
  const drop = randomPoint(BASE_LAT, BASE_LNG, PICKUP_RADIUS_KM);

  const body = {
    vehicleType: VEHICLE_TYPE,
    pickupLocation: {
      lat: pickup.lat,
      lng: pickup.lng,
      address: `Random Pickup (${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)})`
    },
    dropLocation: {
      lat: drop.lat,
      lng: drop.lng,
      address: `Random Drop (${drop.lat.toFixed(4)}, ${drop.lng.toFixed(4)})`
    },
    fareEstimate: Math.floor(Math.random() * 100) + 50,
    userSocketId: "SIM_USER_SOCKET" // placeholder for simulation
  };

  console.log(`📡 Sending test booking: ${body.pickupLocation.address}`);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_USER_TOKEN}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log(`🆔 Booking created: ${data.bookingId || data.ride?.bookingId}`);
  } catch (err) {
    console.error("❌ Error sending test booking:", err);
  }
}

// ==== MAIN ====
(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const approvedDrivers = await Driver.find({
      "onboarding.status": "approved",
      vehicleType: VEHICLE_TYPE
    }).limit(5).lean();

    if (!approvedDrivers.length) {
      console.log("🚫 No approved drivers found in DB for simulation");
      process.exit(0);
    }

    console.log(`🚀 Connecting ${approvedDrivers.length} approved drivers...`);
    approvedDrivers.forEach((driver) => createDriverSocket(driver));

    // Start sending random bookings if token is provided
    if (TEST_USER_TOKEN) {
      console.log(`📅 Auto-booking every ${TEST_BOOKING_INTERVAL / 1000}s...`);
      setInterval(sendTestBooking, TEST_BOOKING_INTERVAL);
    } else {
      console.warn("⚠ No TEST_USER_TOKEN set — skipping auto bookings");
    }
  } catch (err) {
    console.error("❌ Error starting simulation:", err);
    process.exit(1);
  }
})();
