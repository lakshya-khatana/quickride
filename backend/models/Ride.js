const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema(
  {
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    pickup: {
      address: String,
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    destination: {
      address: String,
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },

    vehicleType: { type: String, enum: ["bike", "auto", "cab"], default: "bike" },
    distanceKm: { type: Number, default: 0 },
    fare: { type: Number, default: 0 },

    status: {
      type: String,
      enum: [
        "requested",
        "accepted",
        "driver_arrived",
        "ongoing",
        "completed",
        "cancelled",
      ],
      default: "requested",
    },

    riderRating: { type: Number, default: null }, // rider rates driver
    driverRating: { type: Number, default: null }, // driver rates rider

    paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ride", rideSchema);
