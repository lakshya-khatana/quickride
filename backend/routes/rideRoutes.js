const express = require("express");
const router = express.Router();
const {
  requestRide,
  acceptRide,
  updateRideStatus,
  rateRide,
  getMyRides,
  getRideById,
} = require("../controllers/rideController");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

router.post("/request", protect, authorizeRoles("rider"), requestRide);
router.put("/:id/accept", protect, authorizeRoles("driver"), acceptRide);
router.put("/:id/status", protect, updateRideStatus);
router.put("/:id/rate", protect, rateRide);
router.get("/history", protect, getMyRides);
router.get("/:id", protect, getRideById);

module.exports = router;
