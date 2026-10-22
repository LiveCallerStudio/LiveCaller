import type { Metadata, Viewport } from "next";
import "@livekit/components-styles";
import "./globals.css";
export const metadata: Metadata = { title: "Live Caller Studio — Call In", description: "Screened live audio and video call-ins.", appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Live Call In" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#070807" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
