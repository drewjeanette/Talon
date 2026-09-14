import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { DESIGN_MODE } from "./design/designMode";
import "./styles.css";

const app = (
  <AuthProvider>
    <App />
  </AuthProvider>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Design files open straight from disk (file://), where URL-based routing cannot work. */}
    {DESIGN_MODE ? <MemoryRouter>{app}</MemoryRouter> : <BrowserRouter>{app}</BrowserRouter>}
  </React.StrictMode>
);
