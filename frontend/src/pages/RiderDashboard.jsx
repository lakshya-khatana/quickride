import { useEffect, useState } from "react";
import api from "../api";
import socket from "../socket";
import { useAuth } from "../context/AuthContext";
import MapView from "../components/MapView";

const RiderDashboard = () => {
  const { user, logout } = useAuth();
  const [myLocation, setMyLocation] = useState({ lat: 28.6139, lng: 77.209 });
  const [destAddress, setDestAddress] = useState("");
  const [destCoords, setDestCoords] = useState(null); // { lat, lng } — set manually for demo
  const [vehicleType, setVehicleType] = useState("bike");
  const [activeRide, setActiveRide] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // Get browser geolocation for pickup point
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {} // fall back to default Delhi coords if denied
      );
    }
    fetchHistory();
  }, []);

  useEffect(() => {
    socket.on("rideAccepted", (ride) => {
      setActiveRide(ride);
    });
    socket.on("rideStatusUpdated", (ride) => {
      setActiveRide((prev) => (prev && prev._id === ride._id ? { ...prev, ...ride } : prev));
      if (ride.status === "completed") fetchHistory();
    });
    socket.on("driverLocationUpdate", ({ lng, lat }) => {
      setDriverLocation({ lat, lng });
    });

    return () => {
      socket.off("rideAccepted");
      socket.off("rideStatusUpdated");
      socket.off("driverLocationUpdate");
    };
  }, []);

  const fetchHistory = async () => {
    try {
      const { data } = await api.get("/rides/history");
      setHistory(data);
    } catch (err) {
      // silent fail for history
    }
  };

  // For demo purposes: click "Use sample destination" to simulate picking a spot on the map.
  // In a production build, wire this to a real Places/Nominatim search box.
  const setSampleDestination = () => {
    setDestAddress("Connaught Place, New Delhi");
    setDestCoords({ lat: myLocation.lat + 0.03, lng: myLocation.lng + 0.03 });
  };

  const requestRide = async () => {
    setError("");
    if (!destCoords) {
      setError("Please choose a destination first");
      return;
    }
    try {
      const { data } = await api.post("/rides/request", {
        pickup: { address: "Current location", coordinates: [myLocation.lng, myLocation.lat] },
        destination: { address: destAddress, coordinates: [destCoords.lng, destCoords.lat] },
        vehicleType,
      });
      setActiveRide(data.ride);
      setRatingSubmitted(false);
    } catch (err) {
      setError(err.response?.data?.message || "Could not request ride");
    }
  };

  const cancelRide = async () => {
    if (!activeRide) return;
    await api.put(`/rides/${activeRide._id}/status`, { status: "cancelled" });
    setActiveRide(null);
  };

  const submitRating = async (rating) => {
    await api.put(`/rides/${activeRide._id}/rate`, { rating });
    setRatingSubmitted(true);
    setTimeout(() => {
      setActiveRide(null);
      fetchHistory();
    }, 1200);
  };

  const markers = [{ lat: myLocation.lat, lng: myLocation.lng, label: "You (pickup)" }];
  if (destCoords) markers.push({ lat: destCoords.lat, lng: destCoords.lng, label: "Destination" });
  if (driverLocation) markers.push({ ...driverLocation, label: "Your driver" });

  return (
    <div className="container">
      <div className="top-bar">
        <h2>Hi, {user.name} 👋</h2>
        <button className="secondary" style={{ width: "auto", padding: "8px 14px" }} onClick={logout}>
          Logout
        </button>
      </div>

      <div className="map-wrap">
        <MapView center={[myLocation.lat, myLocation.lng]} markers={markers} />
      </div>

      {!activeRide && (
        <div className="card">
          <h3>Where to?</h3>
          <input
            placeholder="Destination address"
            value={destAddress}
            onChange={(e) => setDestAddress(e.target.value)}
          />
          <button className="secondary" onClick={setSampleDestination} type="button">
            📍 Use sample destination (demo)
          </button>
          <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
            <option value="bike">Bike</option>
            <option value="auto">Auto</option>
            <option value="cab">Cab</option>
          </select>
          {error && <p className="error-text">{error}</p>}
          <button onClick={requestRide}>Book Ride</button>
        </div>
      )}

      {activeRide && (
        <div className="card">
          <h3>Ride Status</h3>
          <span className="status-pill">{activeRide.status.replace("_", " ")}</span>
          <p>Fare estimate: ₹{activeRide.fare}</p>
          <p>Distance: {activeRide.distanceKm} km</p>

          {activeRide.driver && (
            <p>
              Driver: {activeRide.driver.name} · {activeRide.driver.vehicleType} ·{" "}
              {activeRide.driver.vehicleNumber} ⭐ {activeRide.driver.rating}
            </p>
          )}

          {activeRide.status === "requested" && <p>Looking for a nearby driver...</p>}

          {activeRide.status === "completed" && !ratingSubmitted && (
            <div>
              <p>Rate your driver:</p>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  style={{ width: "auto", marginRight: 6, padding: "6px 10px" }}
                  onClick={() => submitRating(n)}
                >
                  {n}⭐
                </button>
              ))}
            </div>
          )}

          {ratingSubmitted && <p>Thanks for rating!</p>}

          {["requested", "accepted"].includes(activeRide.status) && (
            <button className="danger" onClick={cancelRide}>
              Cancel Ride
            </button>
          )}
        </div>
      )}

      <div className="card">
        <h3>Ride History</h3>
        {history.length === 0 && <p>No rides yet.</p>}
        {history.map((r) => (
          <div className="ride-history-item" key={r._id}>
            {r.destination?.address || "Destination"} · ₹{r.fare} ·{" "}
            <span className="status-pill">{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RiderDashboard;
