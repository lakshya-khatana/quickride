const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

// @desc Toggle driver online/offline status
// @route PUT /api/drivers/toggle-online
router.put("/toggle-online", protect, authorizeRoles("driver"), async (req, res) => {
  try {
    const driver = await User.findById(req.user._id);
    const goingOnline = !driver.isOnline;

    if (goingOnline) {
      const [lng, lat] = driver.currentLocation?.coordinates || [0, 0];
      if (lng === 0 && lat === 0) {
        return res.status(400).json({
          message: "Location not set. Please enable location access before going online.",
        });
      }
    }

    driver.isOnline = goingOnline;
    if (!goingOnline) {
      driver.isAvailable = true; // reset when going offline, so driver never stays stuck as "busy"
    }
    await driver.save();
    return res.json({ isOnline: driver.isOnline });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @desc Update driver's live location
// @route PUT /api/drivers/location
router.put("/location", protect, authorizeRoles("driver"), async (req, res) => {
  try {
    const { lng, lat } = req.body;
    const driver = await User.findByIdAndUpdate(
      req.user._id,
      { currentLocation: { type: "Point", coordinates: [lng, lat] } },
      { new: true }
    );

    // Broadcast to riders who might be tracking this driver on an active ride
    const io = req.app.get("io");
    io.emit(`driverLocation_${driver._id}`, { lng, lat });

    return res.json({ message: "Location updated", currentLocation: driver.currentLocation });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;