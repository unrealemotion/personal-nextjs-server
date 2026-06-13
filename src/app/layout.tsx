import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
  title: "UnrealEmo's Tools",
  description: "A meticulously crafted collection of utilities for modern web development.",
  icons: {
    icon: "/icon.svg",
  },
};

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/sonner";
import { LoadingTransition } from "@/components/layout/LoadingTransition";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // 1. matchMedia polyfill for privacy/anti-fingerprinting browsers or environments that return undefined
                var safeMatchMedia = function(query) {
                  return {
                    matches: false,
                    media: query,
                    onchange: null,
                    addListener: function() {},
                    removeListener: function() {},
                    addEventListener: function() {},
                    removeEventListener: function() {},
                    dispatchEvent: function() { return false; }
                  };
                };

                try {
                  if (!window.matchMedia) {
                    window.matchMedia = safeMatchMedia;
                  } else {
                    var testResult = window.matchMedia("(prefers-color-scheme: dark)");
                    if (!testResult || typeof testResult.addListener !== "function") {
                      var originalMatchMedia = window.matchMedia;
                      window.matchMedia = function(query) {
                        try {
                          var res = originalMatchMedia.call(window, query);
                          if (res && typeof res.addListener === "function") return res;
                        } catch (e) {}
                        return safeMatchMedia(query);
                      };
                    }
                  }
                } catch (e) {
                  window.matchMedia = safeMatchMedia;
                }

                // 2. Suppress Monaco Editor's internal "Canceled" promise rejections and browser extension errors
                var uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

                window.addEventListener("error", function(event) {
                  var error = event.error;
                  var filename = event.filename || "";
                  var message = event.message || (error && error.message) || "";
                  var stack = (error && error.stack) || "";

                  var isExtension =
                    filename.indexOf("extension") !== -1 ||
                    filename.indexOf("15bf9991-da51-4aa5-9517-f45f5a550730") !== -1 ||
                    stack.indexOf("extension") !== -1 ||
                    stack.indexOf("15bf9991-da51-4aa5-9517-f45f5a550730") !== -1 ||
                    uuidRegex.test(filename) ||
                    uuidRegex.test(stack) ||
                    message.indexOf("extension") !== -1 ||
                    message.indexOf("addListener") !== -1;

                  if (isExtension) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    console.warn("Interceded and suppressed browser extension/external error:", message);
                  }
                }, true);

                window.addEventListener("unhandledrejection", function(event) {
                  var reason = event.reason;
                  if (!reason) return;

                  // Monaco Editor cancellation
                  var isMonacoCancel =
                    reason.name === "Canceled" ||
                    reason.message === "Canceled" ||
                    reason.type === "cancelation" ||
                    (typeof reason === "object" && reason.message === "Canceled");

                  if (isMonacoCancel) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    console.warn("Interceded and suppressed Monaco Canceled rejection.");
                    return;
                  }

                  var filename = "";
                  var message = "";
                  var stack = "";

                  if (reason instanceof Error) {
                    message = reason.message || "";
                    stack = reason.stack || "";
                  } else if (typeof reason === "object") {
                    message = reason.message || "";
                    stack = reason.stack || "";
                  } else if (typeof reason === "string") {
                    message = reason;
                  }

                  var isExtension =
                    filename.indexOf("extension") !== -1 ||
                    filename.indexOf("15bf9991-da51-4aa5-9517-f45f5a550730") !== -1 ||
                    stack.indexOf("extension") !== -1 ||
                    stack.indexOf("15bf9991-da51-4aa5-9517-f45f5a550730") !== -1 ||
                    uuidRegex.test(filename) ||
                    uuidRegex.test(stack) ||
                    message.indexOf("extension") !== -1 ||
                    message.indexOf("chrome.runtime") !== -1;

                  if (isExtension) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    console.warn("Interceded and suppressed browser extension rejection:", message);
                  }
                }, true);

                // 3. Intercept console logs for agent troubleshooting
                (function() {
                  window.__SURGE_CONSOLE_LOGS__ = [];
                  var maxLogs = 500;
                  
                  var originalLog = console.log;
                  var originalWarn = console.warn;
                  var originalError = console.error;
                  var originalInfo = console.info;

                  function formatArg(arg) {
                    if (arg === null) return "null";
                    if (arg === undefined) return "undefined";
                    if (arg instanceof Error) {
                      return arg.message + (arg.stack ? "\\n" + arg.stack : "");
                    }
                    if (typeof arg === "object") {
                      try {
                        return JSON.stringify(arg);
                      } catch (e) {
                        return String(arg);
                      }
                    }
                    return String(arg);
                  }

                  function addLog(type, args) {
                    try {
                      var message = Array.prototype.map.call(args, formatArg).join(" ");
                      window.__SURGE_CONSOLE_LOGS__.push({
                        timestamp: new Date().toISOString(),
                        type: type,
                        message: message
                      });
                      if (window.__SURGE_CONSOLE_LOGS__.length > maxLogs) {
                        window.__SURGE_CONSOLE_LOGS__.shift();
                      }
                    } catch (e) {
                      // silence
                    }
                  }

                  console.log = function() {
                    addLog("log", arguments);
                    originalLog.apply(console, arguments);
                  };
                  console.warn = function() {
                    addLog("warn", arguments);
                    originalWarn.apply(console, arguments);
                  };
                  console.error = function() {
                    addLog("error", arguments);
                    originalError.apply(console, arguments);
                  };
                  console.info = function() {
                    addLog("info", arguments);
                    originalInfo.apply(console, arguments);
                  };
                })();
              })();
            `
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <LoadingTransition />
        <Script
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-6GN3FQY74P"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-6GN3FQY74P');
          `}
        </Script>
        <Header />
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
        <Toaster theme="dark" position="top-right" />
      </body>
    </html>
  );
}
