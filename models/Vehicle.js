const mongoose= require('mongoose');

const vehicleschema= new mongoose.Schema({
    name:{type: String, required: true, unique: true},
    ratePerKm:{type:Number, required:true},
    capacity:{type:Number, requireed:true}
});

module.exports = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleschema);