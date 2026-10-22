import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Caller Studio — Call Control",
  description: "Live radio call screening and FaceTime-inspired audio/video calling.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Live Caller" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07090d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
