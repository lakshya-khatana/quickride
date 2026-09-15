const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["rider", "driver"], required: true },

    // Driver-specific fields
    vehicleType: { type: String, enum: ["bike", "auto", "cab"], default: "bike" },
    vehicleNumber: { type: String },
    isOnline: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true }, // false while on an active ride

    // Live location (used mainly for drivers), GeoJSON Point
    currentLocation: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },

    rating: { type: Number, default: 5 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Geospatial index so we can find nearby drivers with $near
userSchema.index({ currentLocation: "2dsphere" });

module.exports = mongoose.model("User", userSchema);
