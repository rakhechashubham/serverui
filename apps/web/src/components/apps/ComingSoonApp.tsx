"use client";

import { BrandMark } from "@/src/components/brand/BrandMark";
import { useSelectedServer } from "@/src/lib/session";

export function ComingSoonApp({ feature }: { feature: string }) {
  const selected = useSelectedServer();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 sui-app px-8 text-center">
      <BrandMark size={48} />
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] sui-muted">ServerUI</p>
      <h3 className="text-2xl font-semibold tracking-tight sui-title">{feature}</h3>
      <p className="max-w-sm text-sm leading-6 sui-muted">
        Coming soon. Dashboard, Terminal, and Files operate against the selected server; Editor and
        everything else lands in a later phase.
      </p>
      {selected ? <p className="text-[12px] sui-muted">Current server: {selected.name}</p> : null}
    </div>
  );
}
