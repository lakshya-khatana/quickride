const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");

// @desc Register a new user (rider or driver)
// @route POST /api/auth/register
const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, role, vehicleType, vehicleNumber } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({ message: "Please fill all required fields" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      role,
      vehicleType: role === "driver" ? vehicleType : undefined,
      vehicleNumber: role === "driver" ? vehicleNumber : undefined,
    });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id, user.role),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc Login user
// @route POST /api/auth/login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isOnline: user.isOnline,
      token: generateToken(user._id, user.role),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc Get logged-in user's profile
// @route GET /api/auth/me
const getMe = async (req, res) => {
  return res.json(req.user);
};

module.exports = { registerUser, loginUser, getMe };
