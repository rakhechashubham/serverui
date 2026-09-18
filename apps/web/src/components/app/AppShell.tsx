"use client";

import { BootScreen } from "@/src/components/boot/BootScreen";
import { LogoutScreen } from "@/src/components/boot/LogoutScreen";
import { Desktop } from "@/src/components/desktop/Desktop";
import { ServerSelection } from "@/src/components/server-selection/ServerSelection";
import { RuntimeProvider } from "@/src/lib/runtime";
import { SessionProvider, useSession } from "@/src/lib/session";
import { ThemeProvider } from "@/src/lib/theme";

export function AppShell() {
  return (
    <ThemeProvider>
      <RuntimeProvider>
        <SessionProvider>
          <AppScreens />
        </SessionProvider>
      </RuntimeProvider>
    </ThemeProvider>
  );
}

function AppScreens() {
  const { screen, selectedServer, completeBoot, completeLogOut } = useSession();

  if (screen === "booting" && selectedServer) {
    return <BootScreen server={selectedServer} onComplete={completeBoot} />;
  }

  if (screen === "logging-off" && selectedServer) {
    return <LogoutScreen server={selectedServer} onComplete={completeLogOut} />;
  }

  if (screen === "desktop" && selectedServer) {
    return (
      <div className="h-dvh w-full animate-desktop-in">
        <Desktop key={selectedServer.id} />
      </div>
    );
  }

  return <ServerSelection />;
}
