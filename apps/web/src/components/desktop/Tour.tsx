"use client";

import { useEffect, useRef, useState } from "react";
import type { Driver } from "driver.js";
import { useSession } from "@/src/lib/session";

const STEPS = [
  {
    element: "[data-tour='server-switcher']",
    title: "Server Switcher",
    text: "Click here to see all your servers and switch between them. The demo server is already configured!",
  },
  {
    element: "[data-tour='dock-terminal']",
    title: "Terminal",
    text: "Click the Terminal icon to open an SSH terminal to the selected server. Try running commands like `ls`, `htop`, or `docker ps`.",
  },
  {
    element: "[data-tour='dock-files']",
    title: "File Manager",
    text: "Open Files to browse the remote filesystem via SFTP. You can upload, download, edit, and manage files.",
  },
  {
    element: "[data-tour='dock-monitor']",
    title: "Monitor",
    text: "View live CPU, memory, disk, and network metrics. Switch between tabs for processes, services, and more.",
  },
];

const STORAGE_KEY = "serverui-tour-completed";

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [driver, setDriver] = useState<Driver | null>(null);
  const { selectedServer, screen } = useSession();
  const initialized = useRef(false);

  // Initialize driver.js on first mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Only start tour on first desktop visit with a server selected
    const hasCompleted = localStorage.getItem(STORAGE_KEY) === "true";
    if (!hasCompleted && screen === "desktop" && selectedServer) {
      // Dynamically import driver.js
      import("driver.js").then(({ driver: createDriver }) => {
        const d = createDriver({
          showProgress: true,
          steps: STEPS,
          onDestroyStarted: () => setIsOpen(false),
          onDestroyed: () => {
            setIsOpen(false);
            setCurrentStep(0);
          },
        });
        setDriver(d);
        setIsOpen(true);
      });
    }
  }, [screen, selectedServer]);

  // Start the tour when driver is ready
  useEffect(() => {
    if (driver && isOpen) {
      driver.drive(currentStep);
    }
  }, [driver, isOpen, currentStep]);

  const completeTour = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsOpen(false);
    driver?.destroy();
  };

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipTour = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsOpen(false);
    driver?.destroy();
  };

  // Render tour overlay using driver.js internal methods
  if (!isOpen || !driver) return <>{children}</>;

  // We'll use a custom overlay instead of driver.js built-in UI for better styling
  const step = STEPS[currentStep];
  const element = document.querySelector(step.element);

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-[100] pointer-events-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={skipTour}
        />

        {/* Highlight the target element */}
        {element && (
          <div
            className="pointer-events-none"
            style={{
              position: "fixed",
              left: element.getBoundingClientRect().left - 8,
              top: element.getBoundingClientRect().top - 8,
              width: element.getBoundingClientRect().width + 16,
              height: element.getBoundingClientRect().height + 16,
              borderRadius: "12px",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.6), 0 4px 24px rgba(0,0,0,0.4)",
              border: "2px solid #22d3ee",
              zIndex: 101,
              pointerEvents: "auto",
            }}
          />
        )}

        {/* Tour popup */}
        <div
          className="pointer-events-auto fixed bottom-6 left-1/2 -translate-x-1/2 z-[102] max-w-md w-full mx-4"
          style={{
            animation: "slideUp 0.3s ease-out",
          }}
        >
          <div className="sui-card rounded-[22px] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5)] border border-white/10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 id="tour-title" className="text-[16px] font-semibold text-white">
                  {step.title}
                </h3>
                <p id="tour-text" className="mt-2 text-[14px] leading-6 text-white/80">
                  {step.text}
                </p>
              </div>
              <button
                onClick={skipTour}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition"
                aria-label="Skip tour"
              >
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="flex items-center gap-1.5" role="tablist" aria-label="Tour progress">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentStep(i)}
                    className={`size-2 rounded-full transition ${
                      i === currentStep ? "bg-cyan-400 w-6" : "bg-white/20 hover:bg-white/30"
                    }`}
                    role="tab"
                    aria-selected={i === currentStep}
                    aria-label={`Step ${i + 1}`}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={prevStep}
                    className="rounded-full px-4 py-2 text-[13px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={currentStep === STEPS.length - 1 ? completeTour : nextStep}
                  className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-zinc-900 hover:bg-white/90 transition"
                >
                  {currentStep === STEPS.length - 1 ? "Get Started" : "Next"}
                </button>
              </div>
            </div>
          </div>

          <p className="mt-3 text-center text-[12px] text-white/50">
            Press Esc to skip · Click outside to dismiss
          </p>
        </div>

        <style jsx>{`
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translate(-50%, 20px);
            }
            to {
              opacity: 1;
              transform: translate(-50%, 0);
            }
          }
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </>
  );
}
