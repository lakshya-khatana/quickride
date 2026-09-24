import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "rider",
    vehicleType: "bike",
    vehicleNumber: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await register(form);
      navigate(data.role === "driver" ? "/driver" : "/rider");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container auth-center">
      <div className="card">
        <h1>🏍️ QuickRide</h1>
        <p>Create your account</p>
        <form onSubmit={handleSubmit}>
          <input name="name" placeholder="Full name" onChange={handleChange} required />
          <input name="email" type="email" placeholder="Email" onChange={handleChange} required />
          <input name="phone" placeholder="Phone number" onChange={handleChange} required />
          <input
            name="password"
            type="password"
            placeholder="Password"
            onChange={handleChange}
            required
          />
          <select name="role" onChange={handleChange} value={form.role}>
            <option value="rider">I want to book rides (Rider)</option>
            <option value="driver">I want to drive (Driver)</option>
          </select>

          {form.role === "driver" && (
            <>
              <select name="vehicleType" onChange={handleChange} value={form.vehicleType}>
                <option value="bike">Bike</option>
                <option value="auto">Auto</option>
                <option value="cab">Cab</option>
              </select>
              <input
                name="vehicleNumber"
                placeholder="Vehicle number (e.g. HR12AB1234)"
                onChange={handleChange}
                required
              />
            </>
          )}

          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
        <p className="link-text">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;