import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import "./styles/globals.css"

// Force light grayscale theme for the current redesign pass.
document.documentElement.classList.remove("dark")
document.body.classList.remove("dark")
document.documentElement.style.colorScheme = "light"

if (__TEST_MODE__) {
  document.documentElement.dataset.testMode = "true"
  document.body.dataset.testMode = "true"
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
