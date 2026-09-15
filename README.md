# QuickRide 🏍️ — Full-Stack Ride Booking App (Rapido-style)

A full-stack ride-booking platform with real-time driver matching, live location
tracking, and a rider/driver ride lifecycle — built with the MERN stack + Socket.io.

## Tech Stack
- **Frontend:** React (Vite), React Router, Leaflet (OpenStreetMap) for maps, Socket.io-client
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (Mongoose) with 2dsphere geospatial index for nearest-driver matching
- **Real-time:** Socket.io (ride requests, status updates, live driver location)
- **Auth:** JWT + bcrypt

## Features
- Rider & Driver auth with role-based access
- Rider: request ride, live fare/distance estimate, live map, ride history, rate driver
- Driver: go online/offline, receive nearby ride requests in real time, accept ride,
  update ride status, live location broadcast, earnings summary
- Nearest-driver matching using MongoDB `$near` geospatial query (5 km radius)
- Ride lifecycle state machine: `requested → accepted → driver_arrived → ongoing → completed`
- Rating system (rider ↔ driver)

## Project Structure
```
quickride/
  backend/
    config/db.js
    models/User.js, Ride.js
    controllers/authController.js, rideController.js
    routes/authRoutes.js, rideRoutes.js, driverRoutes.js
    middleware/authMiddleware.js
    socket.js
    server.js
  frontend/
    src/pages/Login.jsx, Register.jsx, RiderDashboard.jsx, DriverDashboard.jsx
    src/components/MapView.jsx, PrivateRoute.jsx
    src/context/AuthContext.jsx
    src/api.js, socket.js
```

## Setup & Run Locally

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env       # then fill in MONGO_URI and JWT_SECRET
npm run dev                # requires nodemon, or use: npm start
```
Backend runs on `http://localhost:5000`.

You need MongoDB running locally, OR use a free MongoDB Atlas cluster and paste
its connection string into `MONGO_URI` in `.env`.

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
Frontend runs on `http://localhost:5173`.

### 3. Try it out
1. Open two browser windows (or one normal + one incognito).
2. In window 1: register as a **Driver**, then click "Go Online" (allow location access).
3. In window 2: register as a **Rider**, click "Use sample destination", then "Book Ride".
4. Watch the ride request appear instantly on the driver's screen (Socket.io), accept it,
   and progress the ride through its lifecycle.

## How the core matching logic works
When a rider requests a ride, the backend runs a MongoDB geospatial query
(`$near` on a `2dsphere` index) to find online, available drivers within 5 km of
the pickup point, then emits a `newRideRequest` Socket.io event only to those drivers'
rooms — so drivers far away never see irrelevant requests.

## Possible Improvements (good for interview talking points)
- Replace the "sample destination" button with a real address autocomplete
  (Google Places API or free Nominatim/OpenStreetMap search)
- Add Razorpay/Stripe test-mode payment on ride completion
- Add an admin dashboard (total rides, revenue charts, active drivers)
- Add push notifications (FCM) for ride status changes
- Move from polling-based geolocation to a debounced/throttled location stream
- Add automated tests (Jest + Supertest for backend, React Testing Library for frontend)
- Deploy: frontend → Vercel/Netlify, backend → Render/Railway, DB → MongoDB Atlas

## Resume bullet you can use
> Built QuickRide, a full-stack ride-booking platform (React, Node.js, Express,
> MongoDB, Socket.io) with real-time geospatial driver matching, live location
> tracking, and a complete ride lifecycle from request to payment and rating.
