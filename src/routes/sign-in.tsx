import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signInServerFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/sign-in")({
  beforeLoad: ({ context }) => {
    if (context.user) {
      throw redirect({ to: "/" });
    }
  },
  component: SignInPage,
});

function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signInServerFn({ data: { email, password } });
      if (result.success) {
        router.navigate({ to: "/" });
      } else {
        setError(result.error || "Sign in failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-dvh overflow-y-auto bg-background lg:grid lg:grid-cols-2 lg:overflow-hidden">
      <aside className="hidden flex-col justify-between bg-primary px-12 py-14 text-primary-foreground lg:flex">
        <img
          src="/wordmark.svg"
          alt="Better Bookkeeping"
          className="h-8 w-auto self-start"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <div className="max-w-sm space-y-4">
          <p className="text-3xl font-extrabold leading-tight tracking-tight">
            Every set, every session, in one place.
          </p>
          <p className="text-sm leading-relaxed text-primary-foreground/80">
            Track your lifts, see your progress, and keep the bookkeeping out of your training.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">Better Bookkeeping</p>
      </aside>

      <div className="flex min-h-full items-center justify-center px-4 py-10 sm:px-6 lg:h-full lg:min-h-0 lg:px-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <img src="/wordmark.svg" alt="Better Bookkeeping" className="h-8 w-auto" />
          </div>
          <Card className="p-6 md:p-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-card-foreground">Sign in to your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">Enter your credentials to continue</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </Field>
              <Field label="Password" htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </Field>
              <Button type="submit" className="w-full" disabled={isLoading} aria-busy={isLoading}>
                {isLoading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/create-account" className="font-medium text-primary hover:underline">
                Create one
              </Link>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
