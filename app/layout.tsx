import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOP Writer",
  description: "Generate parameterized Standard Operating Procedures from a single topic.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
