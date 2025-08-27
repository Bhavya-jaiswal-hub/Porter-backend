const Driver = require('../models/Driver');

// List all drivers under_review (pending admin decision)
async function listSubmissions(req, res) {
  try {
    const drivers = await Driver.find({ 'onboarding.status': 'under_review' })
      .select('name email vehicleType onboarding.submittedAt onboarding.personal onboarding.vehicle')
      .lean();

    res.json({ count: drivers.length, submissions: drivers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list submissions' });
  }
}

// ✅ NEW: Get full application details for a single driver
async function getDriverApplication(req, res) {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findById(driverId)
      .select('-password') // hide sensitive auth data
      .lean();

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.json(driver);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch driver application' });
  }
}

// Approve driver onboarding (enum-safe)
async function approveApplication(req, res) {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findById(driverId);

    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    if (driver.onboarding.status !== 'under_review') {
      return res.status(400).json({ error: 'Driver is not under review' });
    }

    // ✅ Enum safety check
    if (driver.schema.path('onboarding.status').enumValues.includes('approved') === false) {
      return res.status(500).json({
        error: "'approved' is not a valid status in schema enum — please update Driver schema."
      });
    }

    driver.onboarding.status = 'approved';
    driver.onboarding.approvedAt = new Date();
    driver.markModified('onboarding');

    await driver.save();

    ioEmit(req, driver._id, 'onboarding:approved', {
      approvedAt: driver.onboarding.approvedAt
    });

    res.json({
      success: true,
      status: driver.onboarding.status,
      approvedAt: driver.onboarding.approvedAt
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve driver' });
  }
}

// Reject driver onboarding (enum-safe)
async function rejectApplication(req, res) {
  try {
    const { driverId } = req.params;
    const { reason } = req.body;

    const driver = await Driver.findById(driverId);

    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    if (driver.onboarding.status !== 'under_review') {
      return res.status(400).json({ error: 'Driver is not under review' });
    }

    // ✅ Enum safety check
    if (driver.schema.path('onboarding.status').enumValues.includes('rejected') === false) {
      return res.status(500).json({
        error: "'rejected' is not a valid status in schema enum — please update Driver schema."
      });
    }

    driver.onboarding.status = 'rejected';
    driver.onboarding.rejectedAt = new Date();
    if (reason && typeof reason === 'string' && reason.trim()) {
      driver.onboarding.rejectionReason = reason.trim();
    }
    driver.markModified('onboarding');

    await driver.save();

    ioEmit(req, driver._id, 'onboarding:rejected', {
      rejectedAt: driver.onboarding.rejectedAt,
      reason: driver.onboarding.rejectionReason || null
    });

    res.json({
      success: true,
      status: driver.onboarding.status,
      rejectedAt: driver.onboarding.rejectedAt,
      reason: driver.onboarding.rejectionReason || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject driver' });
  }
}

module.exports = {
  listSubmissions,
  getDriverApplication, // ✅ export new function
  approveApplication,
  rejectApplication
};
