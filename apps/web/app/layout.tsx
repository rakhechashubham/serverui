import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ServerUI",
  description: "A modern, open-source control panel for your servers.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

const themeScript = `try {
  var theme = localStorage.getItem("serverui-theme");
  var resolved = theme;
  if (theme === "system") {
    resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  if (resolved !== "light" && resolved !== "dark") resolved = "dark";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
} catch (e) {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}
try {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) {
      if (!rs.length) return;
      Promise.all(rs.map(function (r) { return r.unregister(); })).then(function () {
        try {
          if (!sessionStorage.getItem("sui-sw")) {
            sessionStorage.setItem("sui-sw", "1");
            location.reload();
          }
        } catch (err) {}
      });
    });
  }
  if (window.caches) {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) { caches.delete(k); });
    });
  }
} catch (e) {}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full overflow-hidden bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
