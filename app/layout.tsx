import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { Rail } from "./rail";

export const metadata: Metadata = {
  title: "Flight Bag — Dispatch Planner",
  description: "Dump thoughts. AI files the flight plan.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Rail />
          <main className="main">{children}</main>
        </div>
        <Toaster richColors position="bottom-left" />
      </body>
    </html>
  );
}
