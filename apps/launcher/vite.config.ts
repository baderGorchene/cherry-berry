import { defineConfig } from "vite";

// Relative asset URLs so the page loads from the shells' custom schemes (tauri://, capacitor://).
export default defineConfig({ base: "./", server: { port: 1420, strictPort: true } });
