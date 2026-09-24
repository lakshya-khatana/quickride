// Sets up Socket.io connection/room handling.
// Rooms: each rider joins `rider_<userId>`, each driver joins `driver_<userId>`.
// This lets us emit targeted events (ride requests, status updates, location) to the right user.

const initSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("joinRiderRoom", (userId) => {
      socket.join(`rider_${userId}`);
    });

    socket.on("joinDriverRoom", (userId) => {
      socket.join(`driver_${userId}`);
    });

    // Driver streams live location while on a ride; forward to the rider tracking them
    socket.on("driverLocationUpdate", ({ rideId, riderId, lng, lat }) => {
      io.to(`rider_${riderId}`).emit("driverLocationUpdate", { rideId, lng, lat });
    });

    // Rider streams live location too, so the driver can see where to pick them up
    socket.on("riderLocationUpdate", ({ rideId, driverId, lng, lat }) => {
      io.to(`driver_${driverId}`).emit("riderLocationUpdate", { rideId, lng, lat });
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};

module.exports = initSocket;