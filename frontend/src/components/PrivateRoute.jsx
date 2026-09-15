import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Wraps a route: redirects to /login if not authenticated,
// and optionally enforces a required role (rider/driver).
const PrivateRoute = ({ children, role }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  return children;
};

export default PrivateRoute;
