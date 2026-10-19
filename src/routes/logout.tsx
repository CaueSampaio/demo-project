import { logoutServerFn } from "@/lib/auth.server";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { FormEvent } from "react";

export const Route = createFileRoute("/logout")({
  component: LogoutPage,
});

function LogoutPage() {
  const router = useRouter();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    logoutServerFn().finally(() => {
      // Best-effort navigation: redirect even if logout fails, so a sign-out error never strands the user here.
      router.navigate({ to: "/sign-in" });
    });
  };

  return (
    <form method="post" onSubmit={handleSubmit}>
      <button type="submit">Log out</button>
    </form>
  );
}
