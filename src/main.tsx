import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Import Excalidraw App
import ExcalidrawApp from "./excalidraw-app/App";

// Set the SHA for Excalidraw (can be set via env var)
window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA || "tauridraw-dev";

const rootElement = document.getElementById("root")!;

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <ExcalidrawApp />
  </StrictMode>,
);
