"use client";

import { BrandMark } from "@/src/components/brand/BrandMark";

export function AboutApp() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 sui-app px-8 text-center">
      <BrandMark size={72} />
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] sui-muted">ServerUI</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight sui-title">About ServerUI</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 sui-muted">
          A modern, open-source control panel for managing servers from the browser.
        </p>
        <p className="mt-4 text-sm leading-6 sui-muted">
          Contact{" "}
          <a href="mailto:contact@skyrekon.com" className="underline underline-offset-2">
            contact@skyrekon.com
          </a>
        </p>
      </div>
    </div>
  );
}
