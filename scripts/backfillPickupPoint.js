const mongoose = require('mongoose');
require('dotenv').config();
const RideRequest = require('../models/RideRequest');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const rides = await RideRequest.find({
    'pickupLocation.lat': { $exists: true },
    'pickupLocation.lng': { $exists: true }
  });

  let updated = 0;
  for (const ride of rides) {
    if (!ride.pickupPoint || !ride.pickupPoint.coordinates) {
      ride.pickupPoint = {
        type: 'Point',
        coordinates: [ride.pickupLocation.lng, ride.pickupLocation.lat]
      };
      await ride.save();
      updated++;
    }
  }

  console.log(`✅ Backfilled pickupPoint for ${updated} rides`);
  process.exit();
})();
