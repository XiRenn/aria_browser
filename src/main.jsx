import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { store } from "./store";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(15, 23, 42, 0.88)",
            color: "#e2e8f0",
            border: "1px solid rgba(148, 163, 184, 0.3)",
          },
        }}
      />
    </Provider>
  </React.StrictMode>
);
