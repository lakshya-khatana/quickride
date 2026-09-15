import { createContext, useContext, useEffect, useState } from "react";
import api from "../api";
import socket from "../socket";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("quickride_user");
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    // Once we know who's logged in, join the correct socket room
    if (user) {
      if (user.role === "rider") socket.emit("joinRiderRoom", user._id);
      if (user.role === "driver") socket.emit("joinDriverRoom", user._id);
    }
  }, [user]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("quickride_token", data.token);
    localStorage.setItem("quickride_user", JSON.stringify(data));
    setUser(data);
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("quickride_token", data.token);
    localStorage.setItem("quickride_user", JSON.stringify(data));
    setUser(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem("quickride_token");
    localStorage.removeItem("quickride_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
