import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "MediaOS — One-Person Media Company OS",
  description: "Production-grade operating system for autonomous media companies with human-in-the-loop governance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased">
        <div className="flex h-screen overflow-hidden">
          {/* Main Desktop Sidebar */}
          <Sidebar className="hidden md:flex" />

          {/* Main Work Area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-zinc-950">
              <div className="max-w-7xl mx-auto w-full">
                {children}
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
