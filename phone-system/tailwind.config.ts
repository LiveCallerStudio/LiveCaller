import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { lcs: { lime: "#53FC18", ink: "#070807", panel: "#111411" } }, boxShadow: { glow: "0 0 36px rgba(83,252,24,.14)" } } },
  plugins: []
};
export default config;