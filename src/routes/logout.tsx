import { logoutServerFn } from "@/lib/auth.functions";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
    <div className="h-dvh overflow-y-auto bg-background px-4 py-10">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <img src="/wordmark.svg" alt="Better Bookkeeping" className="h-8 w-auto" />
          </div>
          <Card className="p-6 text-center md:p-8">
            <h1 className="text-xl font-extrabold tracking-tight text-card-foreground md:text-2xl">
              Sign out of Better Bookkeeping?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">You can sign back in at any time.</p>
            <form method="post" onSubmit={handleSubmit} className="mt-6 flex flex-col gap-2">
              <Button type="submit" className="w-full">
                Log out
              </Button>
              <Link
                to="/current-workout"
                className="inline-flex h-11 w-full items-center justify-center rounded-control border border-border bg-card px-4 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-10">
                Cancel
              </Link>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
