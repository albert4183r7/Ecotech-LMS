"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  // "system" on the server and on the first client render alike. Reading the
  // stored theme straight into a rendered attribute makes the toaster's own
  // markup differ between the two, which is a hydration mismatch in a
  // component mounted on every page.
  const { theme = "system", resolvedTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const active = hydrated ? (theme === "system" ? (resolvedTheme ?? "system") : theme) : "system";

  return (
    <Sonner
      theme={active as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
