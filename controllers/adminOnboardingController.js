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

// Get full application details for a single driver
async function getDriverApplication(req, res) {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findById(driverId)
      .select('-password')
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

// Approve driver onboarding
async function approveApplication(req, res) {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findById(driverId);

    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    if (driver.onboarding.status !== 'under_review') {
      return res.status(400).json({ error: 'Driver is not under review' });
    }

    // Enum safety
    if (!driver.schema.path('onboarding.status').enumValues.includes('approved')) {
      return res.status(500).json({
        error: "'approved' is not in schema enum — update your Driver schema."
      });
    }

    driver.onboarding.status = 'approved';
    driver.onboarding.approvedAt = new Date();
    driver.markModified('onboarding');
    await driver.save();

    // Emit over socket.io
    try {
      req.io.to(driver._id.toString()).emit('onboarding:approved', {
        approvedAt: driver.onboarding.approvedAt
      });
    } catch (emitErr) {
      console.warn('⚠️ Socket emit failed (approveApplication):', emitErr.message);
    }

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

// Reject driver onboarding
async function rejectApplication(req, res) {
  try {
    const { driverId } = req.params;
    const { reason } = req.body;
    const driver = await Driver.findById(driverId);

    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    if (driver.onboarding.status !== 'under_review') {
      return res.status(400).json({ error: 'Driver is not under review' });
    }

    // Enum safety
    if (!driver.schema.path('onboarding.status').enumValues.includes('rejected')) {
      return res.status(500).json({
        error: "'rejected' is not in schema enum — update your Driver schema."
      });
    }

    driver.onboarding.status = 'rejected';
    driver.onboarding.rejectedAt = new Date();
    if (reason && typeof reason === 'string' && reason.trim()) {
      driver.onboarding.rejectionReason = reason.trim();
    }
    driver.markModified('onboarding');
    await driver.save();

    // Emit over socket.io
    try {
      req.io.to(driver._id.toString()).emit('onboarding:rejected', {
        rejectedAt: driver.onboarding.rejectedAt,
        reason: driver.onboarding.rejectionReason || null
      });
    } catch (emitErr) {
      console.warn('⚠️ Socket emit failed (rejectApplication):', emitErr.message);
    }

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
  getDriverApplication,
  approveApplication,
  rejectApplication
};
