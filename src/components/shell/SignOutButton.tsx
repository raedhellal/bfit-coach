"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/kit";
import { copy } from "@/lib/copy";

/** The one interactive element in the shell, so the shell itself stays a server component. */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    // replace(), not push(): the roster must not be reachable with the back button.
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" icon="logout" onClick={signOut} disabled={busy}>
      {copy.shell.signOut}
    </Button>
  );
}
