import { useEffect, useRef, useState } from "react";
import api from "../api";
import socket from "../socket";
import { useAuth } from "../context/AuthContext";
import MapView from "../components/MapView";

const DriverDashboard = () => {
  const { user, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [myLocation, setMyLocation] = useState({ lat: 28.6139, lng: 77.209 });
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [history, setHistory] = useState([]);
  const watchIdRef = useRef(null);

  useEffect(() => {
    fetchHistory();
    socket.on("newRideRequest", (ride) => {
      setIncomingRequests((prev) => {
        if (prev.some((r) => r._id === ride._id)) return prev;
        return [...prev, ride];
      });
    });
    socket.on("rideStatusUpdated", (ride) => {
      setActiveRide((prev) => (prev && prev._id === ride._id ? { ...prev, ...ride } : prev));
    });

    return () => {
      socket.off("newRideRequest");
      socket.off("rideStatusUpdated");
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const fetchHistory = async () => {
    try {
      const { data } = await api.get("/rides/history");
      setHistory(data);
    } catch (err) {}
  };

  const toggleOnline = async () => {
    const { data } = await api.put("/drivers/toggle-online");
    setIsOnline(data.isOnline);

    if (data.isOnline && navigator.geolocation) {
      // Start watching + broadcasting location while online
      watchIdRef.current = navigator.geolocation.watchPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation({ lat: latitude, lng: longitude });
        await api.put("/drivers/location", { lng: longitude, lat: latitude });

        if (activeRide) {
          socket.emit("driverLocationUpdate", {
            rideId: activeRide._id,
            riderId: activeRide.rider._id || activeRide.rider,
            lng: longitude,
            lat: latitude,
          });
        }
      });
    } else if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
  };

  const acceptRide = async (rideId) => {
    const { data } = await api.put(`/rides/${rideId}/accept`);
    setActiveRide(data);
    setIncomingRequests([]); // clear other pending requests once one is accepted
  };

  const advanceStatus = async (status) => {
    const { data } = await api.put(`/rides/${activeRide._id}/status`, { status });
    setActiveRide(data);
    if (status === "completed") {
      setTimeout(() => {
        setActiveRide(null);
        fetchHistory();
      }, 1500);
    }
  };

  const nextStatusMap = {
    accepted: { label: "Mark Arrived", next: "driver_arrived" },
    driver_arrived: { label: "Start Ride", next: "ongoing" },
    ongoing: { label: "Complete Ride", next: "completed" },
  };

  return (
    <div className="container">
      <div className="top-bar">
        <h2>Hi, {user.name} 🏍️</h2>
        <button className="secondary" style={{ width: "auto", padding: "8px 14px" }} onClick={logout}>
          Logout
        </button>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Status: {isOnline ? "🟢 Online" : "⚪ Offline"}</h3>
          <button style={{ width: "auto", padding: "8px 16px" }} onClick={toggleOnline}>
            {isOnline ? "Go Offline" : "Go Online"}
          </button>
        </div>
      </div>

      <div className="map-wrap">
        <MapView
          center={[myLocation.lat, myLocation.lng]}
          markers={[{ lat: myLocation.lat, lng: myLocation.lng, label: "You" }]}
        />
      </div>

      {!activeRide && isOnline && incomingRequests.length > 0 && (
        <div className="card">
          <h3>Incoming Ride Requests</h3>
          {incomingRequests.map((r) => (
            <div key={r._id} className="ride-history-item">
              <p>
                {r.pickup.address} → {r.destination.address}
              </p>
              <p>
                ₹{r.fare} · {r.distanceKm} km · {r.vehicleType}
              </p>
              <button onClick={() => acceptRide(r._id)}>Accept</button>
            </div>
          ))}
        </div>
      )}

      {activeRide && (
        <div className="card">
          <h3>Active Ride</h3>
          <span className="status-pill">{activeRide.status.replace("_", " ")}</span>
          <p>Rider: {activeRide.rider?.name}</p>
          <p>
            {activeRide.pickup.address} → {activeRide.destination.address}
          </p>
          <p>Fare: ₹{activeRide.fare}</p>

          {nextStatusMap[activeRide.status] && (
            <button onClick={() => advanceStatus(nextStatusMap[activeRide.status].next)}>
              {nextStatusMap[activeRide.status].label}
            </button>
          )}
        </div>
      )}

      <div className="card">
        <h3>Ride History & Earnings</h3>
        <p>
          Total earned: ₹
          {history.filter((r) => r.status === "completed").reduce((sum, r) => sum + r.fare, 0)}
        </p>
        {history.map((r) => (
          <div className="ride-history-item" key={r._id}>
            {r.pickup?.address} → {r.destination?.address} · ₹{r.fare} ·{" "}
            <span className="status-pill">{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DriverDashboard;
