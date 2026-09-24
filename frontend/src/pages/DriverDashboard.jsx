import { useEffect, useRef, useState } from "react";
import api from "../api";
import socket from "../socket";
import { useAuth } from "../context/AuthContext";
import MapView from "../components/MapView";
import SideBrand from "../components/SideBrand";
import Footer from "../components/Footer";

// Same formula as backend/controllers/rideController.js — keep both in sync
const getDistanceKm = (lat1, lng1, lat2, lng2) => {
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

// Plays a short two-tone "ping" using the Web Audio API (no audio file needed)
const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    const now = ctx.currentTime;
    playTone(880, now, 0.15);
    playTone(1100, now + 0.15, 0.15);
  } catch (err) {
    // Audio not supported/allowed — fail silently
  }
};

const DriverDashboard = () => {
  const { user, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const [history, setHistory] = useState([]);
  const watchIdRef = useRef(null);
  const activeRideRef = useRef(null); // keeps watchPosition's callback in sync with the latest activeRide
  const originalTitleRef = useRef(document.title);
  const blinkIntervalRef = useRef(null);

  // Keep the ref updated whenever activeRide state changes, so the long-lived
  // watchPosition callback (created once when going online) always sees the latest value.
  useEffect(() => {
    activeRideRef.current = activeRide;
  }, [activeRide]);

  useEffect(() => {
    fetchHistory();
    fetchMyStatus();

    // Join (and re-join after any reconnect — e.g. backend restart, network drop)
    socket.emit("joinDriverRoom", user._id);
    socket.on("connect", () => {
      socket.emit("joinDriverRoom", user._id);
    });

    socket.on("newRideRequest", (ride) => {
      setIncomingRequests((prev) => {
        if (prev.some((r) => r._id === ride._id)) return prev;
        return [...prev, ride];
      });
      playNotificationSound();
    });
    socket.on("rideStatusUpdated", (ride) => {
      setActiveRide((prev) => (prev && prev._id === ride._id ? { ...prev, ...ride } : prev));
    });
    socket.on("riderLocationUpdate", ({ lng, lat }) => {
      setRiderLocation({ lat, lng });
    });

    return () => {
      socket.off("connect");
      socket.off("newRideRequest");
      socket.off("rideStatusUpdated");
      socket.off("riderLocationUpdate");
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [user._id]);

  const fetchHistory = async () => {
    try {
      const { data } = await api.get("/rides/history");
      setHistory(data);
    } catch (err) {}
  };

  const fetchMyStatus = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setIsOnline(data.isOnline);
    } catch (err) {}
  };

  // Blink the browser tab title while there's an unhandled incoming request
  useEffect(() => {
    if (!activeRide && incomingRequests.length > 0) {
      let showAlert = true;
      blinkIntervalRef.current = setInterval(() => {
        document.title = showAlert ? "🔔 New Ride!" : originalTitleRef.current;
        showAlert = !showAlert;
      }, 1000);
    } else {
      clearInterval(blinkIntervalRef.current);
      document.title = originalTitleRef.current;
    }

    return () => clearInterval(blinkIntervalRef.current);
  }, [incomingRequests.length, activeRide]);

  const toggleOnline = async () => {
    if (isOnline) {
      // Going offline — no location needed
      const { data } = await api.put("/drivers/toggle-online");
      setIsOnline(data.isOnline);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      return;
    }

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    // Get an immediate location fix BEFORE marking driver online/available
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation({ lat: latitude, lng: longitude });

        try {
          // Save location first
          await api.put("/drivers/location", { lng: longitude, lat: latitude });

          // NOW mark online — driver is guaranteed to have a real location
          const { data } = await api.put("/drivers/toggle-online");
          setIsOnline(data.isOnline);
        } catch (err) {
          alert(err.response?.data?.message || "Could not go online. Please try again.");
          return;
        }

        // Start continuous tracking
        watchIdRef.current = navigator.geolocation.watchPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            setMyLocation({ lat: latitude, lng: longitude });
            await api.put("/drivers/location", { lng: longitude, lat: latitude });

            // Read the LATEST active ride via the ref (not the `activeRide` closed over
            // when this callback was created) so location updates keep flowing after accept.
            const currentRide = activeRideRef.current;
            if (currentRide) {
              socket.emit("driverLocationUpdate", {
                rideId: currentRide._id,
                riderId: currentRide.rider._id || currentRide.rider,
                lng: longitude,
                lat: latitude,
              });
            }
          },
          (err) => console.error("watchPosition error:", err),
          { enableHighAccuracy: true }
        );
      },
      (err) => {
        alert("Location permission is required to go online. Please allow location access.");
        console.error("getCurrentPosition error:", err);
      },
      { enableHighAccuracy: true }
    );
  };

  const acceptRide = async (rideId) => {
    const { data } = await api.put(`/rides/${rideId}/accept`);
    setActiveRide(data);
    setIncomingRequests([]);
    setRiderLocation(null);
  };

  const rejectRide = (rideId) => {
    setIncomingRequests((prev) => prev.filter((r) => r._id !== rideId));
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

  // Rider's current point: their live shared location if available, else the original pickup point
  const riderPoint = riderLocation
    ? riderLocation
    : activeRide
    ? { lat: activeRide.pickup.coordinates[1], lng: activeRide.pickup.coordinates[0] }
    : null;

  const pickupDistanceKm =
    myLocation && riderPoint
      ? getDistanceKm(myLocation.lat, myLocation.lng, riderPoint.lat, riderPoint.lng)
      : null;

  const markers = myLocation ? [{ lat: myLocation.lat, lng: myLocation.lng, label: "You" }] : [];
  if (activeRide) {
    markers.push({
      lat: activeRide.pickup.coordinates[1],
      lng: activeRide.pickup.coordinates[0],
      label: "Pickup point",
    });
  }
  if (riderLocation) markers.push({ ...riderLocation, label: "Rider (live)" });

  const route =
    myLocation && riderPoint && activeRide
      ? [
          [myLocation.lat, myLocation.lng],
          [riderPoint.lat, riderPoint.lng],
        ]
      : [];

  return (
    <>
      <SideBrand />
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
          {myLocation && (
            <MapView
              center={[myLocation.lat, myLocation.lng]}
              markers={markers}
              route={route}
              autoCenter={true}
            />
          )}
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
                <button
                  className="secondary"
                  style={{ marginTop: "6px" }}
                  onClick={() => rejectRide(r._id)}
                >
                  Decline
                </button>
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

            {pickupDistanceKm !== null && ["accepted", "driver_arrived"].includes(activeRide.status) && (
              <p className="status-pill">📍 Rider is {pickupDistanceKm.toFixed(2)} km away</p>
            )}

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
      <Footer />
    </>
  );
};

export default DriverDashboard;