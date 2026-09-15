const Ride = require("../models/Ride");
const User = require("../models/User");

// Simple fare calculator: base fare + per-km rate (tweak as needed)
const calculateFare = (distanceKm, vehicleType) => {
  const baseFare = { bike: 15, auto: 25, cab: 40 }[vehicleType] || 15;
  const perKmRate = { bike: 6, auto: 9, cab: 13 }[vehicleType] || 6;
  return Math.round(baseFare + distanceKm * perKmRate);
};

// Haversine distance in km between two [lng, lat] points
const getDistanceKm = ([lng1, lat1], [lng2, lat2]) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// @desc Rider requests a new ride. Finds nearest online, available driver.
// @route POST /api/rides/request
const requestRide = async (req, res) => {
  try {
    const { pickup, destination, vehicleType } = req.body;
    // pickup/destination: { address, coordinates: [lng, lat] }

    if (!pickup?.coordinates || !destination?.coordinates) {
      return res.status(400).json({ message: "Pickup and destination coordinates are required" });
    }

    const distanceKm = getDistanceKm(pickup.coordinates, destination.coordinates);
    const fare = calculateFare(distanceKm, vehicleType);

    const ride = await Ride.create({
      rider: req.user._id,
      pickup,
      destination,
      vehicleType,
      distanceKm: Number(distanceKm.toFixed(2)),
      fare,
      status: "requested",
    });

    // Find nearest available driver within 5km using geospatial query
    const nearbyDrivers = await User.find({
      role: "driver",
      isOnline: true,
      isAvailable: true,
      currentLocation: {
        $near: {
          $geometry: { type: "Point", coordinates: pickup.coordinates },
          $maxDistance: 5000, // 5 km in meters
        },
      },
    }).limit(5);

    const populatedRide = await ride.populate("rider", "name phone rating");

    // Emit to nearby drivers via Socket.io (set up in socket.js / server.js)
    const io = req.app.get("io");
    nearbyDrivers.forEach((driver) => {
      io.to(`driver_${driver._id}`).emit("newRideRequest", populatedRide);
    });

    return res.status(201).json({ ride: populatedRide, nearbyDriversCount: nearbyDrivers.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc Driver accepts a ride
// @route PUT /api/rides/:id/accept
const acceptRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.status !== "requested") {
      return res.status(400).json({ message: "Ride is no longer available" });
    }

    ride.driver = req.user._id;
    ride.status = "accepted";
    await ride.save();

    await User.findByIdAndUpdate(req.user._id, { isAvailable: false });

    const populatedRide = await ride.populate([
      { path: "rider", select: "name phone rating" },
      { path: "driver", select: "name phone vehicleType vehicleNumber rating currentLocation" },
    ]);

    const io = req.app.get("io");
    io.to(`rider_${ride.rider}`).emit("rideAccepted", populatedRide);

    return res.json(populatedRide);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc Update ride status (driver_arrived, ongoing, completed, cancelled)
// @route PUT /api/rides/:id/status
const updateRideStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["driver_arrived", "ongoing", "completed", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    ride.status = status;
    if (status === "completed") {
      ride.paymentStatus = "paid"; // simplified — hook real payment gateway here
    }
    await ride.save();

    // Free up the driver once ride ends
    if (["completed", "cancelled"].includes(status) && ride.driver) {
      await User.findByIdAndUpdate(ride.driver, { isAvailable: true });
    }

    const io = req.app.get("io");
    io.to(`rider_${ride.rider}`).emit("rideStatusUpdated", ride);
    if (ride.driver) io.to(`driver_${ride.driver}`).emit("rideStatusUpdated", ride);

    return res.json(ride);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc Rate a completed ride
// @route PUT /api/rides/:id/rate
const rateRide = async (req, res) => {
  try {
    const { rating } = req.body; // 1-5
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.status !== "completed") {
      return res.status(400).json({ message: "Can only rate completed rides" });
    }

    let targetUserId;
    if (req.user.role === "rider") {
      ride.riderRating = rating;
      targetUserId = ride.driver;
    } else {
      ride.driverRating = rating;
      targetUserId = ride.rider;
    }
    await ride.save();

    // Update running average rating on target user
    const target = await User.findById(targetUserId);
    if (target) {
      const newCount = target.ratingCount + 1;
      const newAvg = (target.rating * target.ratingCount + rating) / newCount;
      target.rating = Number(newAvg.toFixed(2));
      target.ratingCount = newCount;
      await target.save();
    }

    return res.json(ride);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc Get logged-in user's rides (history)
// @route GET /api/rides/history
const getMyRides = async (req, res) => {
  try {
    const filter =
      req.user.role === "rider" ? { rider: req.user._id } : { driver: req.user._id };

    const rides = await Ride.find(filter)
      .sort({ createdAt: -1 })
      .populate("rider", "name phone rating")
      .populate("driver", "name phone vehicleType vehicleNumber rating");

    return res.json(rides);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc Get single ride by id
// @route GET /api/rides/:id
const getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate("rider", "name phone rating")
      .populate("driver", "name phone vehicleType vehicleNumber rating currentLocation");
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    return res.json(ride);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  requestRide,
  acceptRide,
  updateRideStatus,
  rateRide,
  getMyRides,
  getRideById,
};
