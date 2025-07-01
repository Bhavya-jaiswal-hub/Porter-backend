const Vehicle= require('../models/Vehicle');

//get all vehicles

exports.getAllVehicles = async (req, res)=>{
    try{
        const vehicles= await Vehicle.find();
        res.status(200).json(vehicles);
    }
    catch(err){
        res.status(500).json({error: err.message});
    }
}



//post new vehicle
exports.addVehicle = async (req, res) => {
  const { name, ratePerKm, capacity } = req.body;

  try {
    const existing = await Vehicle.findOne({ name });
    if (existing) return res.status(409).json({ error: 'Vehicle already exists' });

    const vehicle = new Vehicle({ name, ratePerKm, capacity });
    await vehicle.save();
    res.status(201).json({ message: 'Vehicle added', vehicle });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteVehicle = async (req, res) => {
  try {
    await Vehicle.findByIdAndDelete(req.params.id);
    res.json({ message: 'Vehicle deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};