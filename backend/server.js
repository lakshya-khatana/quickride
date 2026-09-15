require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const initSocket = require("./socket");

const authRoutes = require("./routes/authRoutes");
const rideRoutes = require("./routes/rideRoutes");
const driverRoutes = require("./routes/driverRoutes");

connectDB();

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "*" },
});

// Make io accessible inside controllers via req.app.get("io")
app.set("io", io);
initSocket(io);

app.get("/", (req, res) => res.send("QuickRide API is running..."));
app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/drivers", driverRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
