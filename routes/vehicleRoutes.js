const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const authenticateToken = require('../middlewares/authMiddleware'); 
const adminOnly = require('../middlewares/adminMiddleware');

// const authenticateToken = require('../middleware/authMiddleware'); // for protected route later

// Get all vehicles
router.get('/', vehicleController.getAllVehicles);

// Add a new vehicle (you can protect this later with token + role)
router.post('/', authenticateToken, vehicleController.addVehicle);
router.delete('/:id', authenticateToken, adminOnly, vehicleController.deleteVehicle);



module.exports = router;
