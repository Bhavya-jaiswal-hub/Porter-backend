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

// Approve driver onboarding
async function approveApplication(req, res) {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findById(driverId);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    if (driver.onboarding.status !== 'under_review') {
      return res.status(400).json({ error: 'Driver is not under review' });
    }

    driver.onboarding.status = 'approved';
    driver.onboarding.approvedAt = new Date();
    await driver.save();

    ioEmit(req, driver._id, 'onboarding:approved', {
      approvedAt: driver.onboarding.approvedAt
    });

    res.json({ success: true, status: driver.onboarding.status, approvedAt: driver.onboarding.approvedAt });
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

    driver.onboarding.status = 'rejected';
    driver.onboarding.rejectedAt = new Date();
    if (reason) driver.onboarding.rejectionReason = reason;
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
  approveApplication,
  rejectApplication
};
