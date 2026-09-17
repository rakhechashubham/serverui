"use client";

import { AboutApp } from "@/src/components/apps/AboutApp";
import { ApplicationsApp } from "@/src/components/apps/ApplicationsApp";
import { DashboardApp } from "@/src/components/apps/DashboardApp";
import { DatabasesApp } from "@/src/components/apps/DatabasesApp";
import { DomainsApp } from "@/src/components/apps/DomainsApp";
import { EditorApp } from "@/src/components/apps/EditorApp";
import { FileViewer } from "@/src/components/apps/files/viewers/FileViewer";
import { FilesApp } from "@/src/components/apps/FilesApp";
import { SettingsApp } from "@/src/components/apps/SettingsApp";
import { TerminalApp } from "@/src/components/apps/TerminalApp";
import { Window } from "@/src/components/window/Window";
import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";
import type { AppId } from "@/src/data/apps";

export function WindowManager() {
  const { windows } = useWindowManager();

  return (
    <>
      {windows
        .filter((item) => !item.minimized)
        .map((item) => (
          <Window key={item.id} window={item}>
            <AppBody app={item.app} payload={item.payload} windowId={item.id} />
          </Window>
        ))}
    </>
  );
}

function AppBody({
  app,
  payload,
  windowId,
}: {
  app: AppId;
  payload?: WindowPayload;
  windowId: string;
}) {
  switch (app) {
    case "dashboard":
      return <DashboardApp />;
    case "files":
      return <FilesApp />;
    case "terminal":
      return <TerminalApp payload={payload} />;
    case "editor":
      return <EditorApp />;
    case "viewer":
      return <FileViewer payload={payload} windowId={windowId} />;
    case "applications":
      return <ApplicationsApp />;
    case "domains":
      return <DomainsApp />;
    case "databases":
      return <DatabasesApp />;
    case "settings":
      return <SettingsApp />;
    case "about":
      return <AboutApp />;
  }
}
