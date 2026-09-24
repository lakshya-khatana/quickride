import { useEffect, useRef, useState } from "react";
import api from "../api";
import socket from "../socket";
import { useAuth } from "../context/AuthContext";
import MapView from "../components/MapView";
import SideBrand from "../components/SideBrand";
import Footer from "../components/Footer";

// Same formulas as backend/controllers/rideController.js — keep both in sync
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

const calculateFare = (distanceKm, vehicleType) => {
  const baseFare = { bike: 15, auto: 25, cab: 40 }[vehicleType] || 15;
  const perKmRate = { bike: 6, auto: 9, cab: 13 }[vehicleType] || 6;
  return Math.round(baseFare + distanceKm * perKmRate);
};

// Rough average speeds by vehicle type (km/h) — accounts for city traffic
const AVG_SPEED_KMH = { bike: 25, auto: 20, cab: 18 };

const calculateEtaMinutes = (distanceKm, vehicleType) => {
  const speed = AVG_SPEED_KMH[vehicleType] || 20;
  const hours = distanceKm / speed;
  return Math.max(1, Math.round(hours * 60)); // minimum 1 min, avoid showing "0 min"
};

const RiderDashboard = () => {
  const { user, logout } = useAuth();
  const [myLocation, setMyLocation] = useState(null); // null until real GPS fix arrives
  const [pickupCoords, setPickupCoords] = useState(null); // null = use myLocation (GPS)
  const [pickupAddress, setPickupAddress] = useState("Current location");
  const [destAddress, setDestAddress] = useState("");
  const [destCoords, setDestCoords] = useState(null);
  const [selectMode, setSelectMode] = useState("destination"); // 'pickup' | 'destination'
  const [vehicleType, setVehicleType] = useState("bike");
  const [activeRide, setActiveRide] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [showCancelBox, setShowCancelBox] = useState(false);
  const [cancelReason, setCancelReason] = useState("Changed my mind");
  const [estimate, setEstimate] = useState(null); // { distanceKm, fare }
  const watchIdRef = useRef(null);

  const origin = pickupCoords || myLocation;

  // Get an initial GPS fix, then keep tracking the rider's live position continuously
  useEffect(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      fetchHistory();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        console.error("Location error:", err);
        alert("Please allow location access so we can show your position and pickup point on the map.");
      },
      { enableHighAccuracy: true }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.error("watchPosition error:", err),
      { enableHighAccuracy: true }
    );

    fetchHistory();

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    socket.emit("joinRiderRoom", user._id);
    socket.on("connect", () => {
      socket.emit("joinRiderRoom", user._id);
    });

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
      socket.off("connect");
      socket.off("rideAccepted");
      socket.off("rideStatusUpdated");
      socket.off("driverLocationUpdate");
    };
  }, [user._id]);

  const fetchHistory = async () => {
    try {
      const { data } = await api.get("/rides/history");
      setHistory(data);

      // Restore any in-progress ride on page load/refresh (avoids losing active ride state)
      const inProgress = data.find((r) => !["completed", "cancelled"].includes(r.status));
      if (inProgress) {
        setActiveRide(inProgress);
      }
    } catch (err) {}
  };

  // Recompute fare estimate live whenever pickup/destination/vehicle type changes
  useEffect(() => {
    if (!destCoords || !origin) {
      setEstimate(null);
      return;
    }
    const distanceKm = getDistanceKm(origin.lat, origin.lng, destCoords.lat, destCoords.lng);
    const fare = calculateFare(distanceKm, vehicleType);
    setEstimate({ distanceKm: Number(distanceKm.toFixed(2)), fare });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destCoords, vehicleType, origin?.lat, origin?.lng]);

  // Stream rider's live location to the assigned driver while the ride is in progress
  useEffect(() => {
    const trackableStatuses = ["accepted", "driver_arrived", "ongoing"];
    const driverId = activeRide?.driver?._id || activeRide?.driver;

    if (activeRide && driverId && trackableStatuses.includes(activeRide.status) && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation({ lat: latitude, lng: longitude });
        socket.emit("riderLocationUpdate", {
          rideId: activeRide._id,
          driverId,
          lng: longitude,
          lat: latitude,
        });
      });
    } else if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [activeRide?._id, activeRide?.status, activeRide?.driver]);

  // Called when the user taps the map — sets pickup or destination depending on selectMode
  const handleMapClick = (coords) => {
    if (activeRide) return; // don't allow re-picking once a ride is active
    if (selectMode === "pickup") {
      setPickupCoords(coords);
      setPickupAddress(`Pinned pickup (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
    } else {
      setDestCoords(coords);
      setDestAddress(`Pinned location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
    }
  };

  const useCurrentLocationAsPickup = () => {
    setPickupCoords(null);
    setPickupAddress("Current location");
  };

  const requestRide = async () => {
    setError("");
    if (!origin) {
      setError("Waiting for your location — please allow location access");
      return;
    }
    if (!destCoords) {
      setError("Please choose a destination first (tap the map)");
      return;
    }
    try {
      const { data } = await api.post("/rides/request", {
        pickup: { address: pickupAddress, coordinates: [origin.lng, origin.lat] },
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
    await api.put(`/rides/${activeRide._id}/status`, { status: "cancelled", cancelReason });
    setActiveRide(null);
    setShowCancelBox(false);
  };

  const submitRating = async (rating) => {
    await api.put(`/rides/${activeRide._id}/rate`, { rating });
    setRatingSubmitted(true);
    setTimeout(() => {
      setActiveRide(null);
      fetchHistory();
    }, 1200);
  };

  const trackingNow = activeRide && ["accepted", "driver_arrived", "ongoing"].includes(activeRide.status);

  // Live distance between the driver and the rider (updates as driverLocation streams in)
  const driverDistanceKm =
    driverLocation && trackingNow && myLocation
      ? getDistanceKm(driverLocation.lat, driverLocation.lng, myLocation.lat, myLocation.lng)
      : null;

  // Approx time for the driver to reach the rider, based on distance and vehicle type
  const driverEtaMinutes =
    driverDistanceKm !== null
      ? calculateEtaMinutes(driverDistanceKm, activeRide?.driver?.vehicleType || vehicleType)
      : null;

  const markers = [];
  if (origin) markers.push({ lat: origin.lat, lng: origin.lng, label: "Pickup" });
  if (destCoords) markers.push({ lat: destCoords.lat, lng: destCoords.lng, label: "Destination" });
  if (driverLocation) markers.push({ ...driverLocation, label: "Your driver" });

  // Draw a line between driver and rider while the driver is on the way
  const route =
    driverLocation && myLocation && activeRide && ["accepted", "driver_arrived"].includes(activeRide.status)
      ? [
          [driverLocation.lat, driverLocation.lng],
          [myLocation.lat, myLocation.lng],
        ]
      : [];

  const mapCenter = driverLocation && trackingNow ? [driverLocation.lat, driverLocation.lng] : origin ? [origin.lat, origin.lng] : null;

  return (
    <>
      <SideBrand />
      <div className="container">
        <div className="top-bar">
          <h2>Hi, {user.name} 👋</h2>
          <button className="secondary" style={{ width: "auto", padding: "8px 14px" }} onClick={logout}>
            Logout
          </button>
        </div>

        <div className="map-wrap">
          {mapCenter ? (
            <MapView
              center={mapCenter}
              markers={markers}
              route={route}
              autoCenter={trackingNow}
              onLocationSelect={!activeRide ? handleMapClick : null}
            />
          ) : (
            <p style={{ padding: 16 }}>Waiting for your location... please allow location access.</p>
          )}
        </div>

        {!activeRide && (
          <div className="card">
            <h3>Where to?</h3>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                className={selectMode === "pickup" ? "" : "secondary"}
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => setSelectMode("pickup")}
              >
                📍 Set Pickup
              </button>
              <button
                type="button"
                className={selectMode === "destination" ? "" : "secondary"}
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => setSelectMode("destination")}
              >
                🎯 Set Destination
              </button>
            </div>
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              Tap the map above to set your {selectMode === "pickup" ? "pickup point" : "destination"}.
            </p>

            <p>
              <strong>Pickup:</strong> {pickupAddress}{" "}
              {pickupCoords && (
                <button
                  type="button"
                  className="secondary"
                  style={{ width: "auto", padding: "4px 8px", marginLeft: 6 }}
                  onClick={useCurrentLocationAsPickup}
                >
                  Use current location
                </button>
              )}
            </p>

            <input
              placeholder="Destination address / name"
              value={destAddress}
              onChange={(e) => setDestAddress(e.target.value)}
            />

            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              <option value="bike">Bike</option>
              <option value="auto">Auto</option>
              <option value="cab">Cab</option>
            </select>
            {estimate && (
              <p className="status-pill">
                Estimated fare: ₹{estimate.fare} · {estimate.distanceKm} km
              </p>
            )}
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

            {driverDistanceKm !== null && ["accepted", "driver_arrived"].includes(activeRide.status) && (
              <p className="status-pill">
                🚗 Driver is {driverDistanceKm.toFixed(2)} km away · Arriving in ~{driverEtaMinutes} min
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

            {["requested", "accepted"].includes(activeRide.status) && !showCancelBox && (
              <button className="danger" onClick={() => setShowCancelBox(true)}>
                Cancel Ride
              </button>
            )}

            {["requested", "accepted"].includes(activeRide.status) && showCancelBox && (
              <div>
                <p>Why are you cancelling?</p>
                <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
                  <option>Changed my mind</option>
                  <option>Waiting too long</option>
                  <option>Booked by mistake</option>
                  <option>Driver not moving</option>
                  <option>Other</option>
                </select>
                <button className="danger" onClick={cancelRide}>
                  Confirm Cancel
                </button>
                <button className="secondary" onClick={() => setShowCancelBox(false)}>
                  Never mind
                </button>
              </div>
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
      <Footer />
    </>
  );
};

export default RiderDashboard;