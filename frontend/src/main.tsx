import React from "react";
import ReactDOM from "react-dom/client";
import AccountApp from "./AccountApp";
import App from "./App";
import LoginApp from "./LoginApp";
import UserApp from "./UserApp";
import { AUTH_TOKEN_KEY } from "./api";
import "./styles.css";
import "./studio.css";

const isAdminRoute = window.location.pathname.startsWith("/admin");
const isLoginRoute = window.location.pathname === "/admin/login";
const isAccountRoute = window.location.pathname.startsWith("/account");

function RootApp() {
  if (isAccountRoute) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
      return <LoginApp />;
    }
    return <AccountApp />;
  }
  if (isLoginRoute) {
    return <LoginApp />;
  }
  if (isAdminRoute) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
      return <LoginApp />;
    }
    return <App />;
  }
  return <UserApp />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
