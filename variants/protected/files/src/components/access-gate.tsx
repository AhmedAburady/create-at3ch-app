import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useId, useState } from "react";

import { unlock } from "@/access/access.functions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { appName } from "@/lib/app";

/**
 * The way in: the access code, then on to `target`. The access page draws
 * it, and so does a locked home page, in place.
 */
export function AccessGate({ target = "/" }: { target?: string }) {
  const router = useRouter();
  const errorId = useId();
  // An empty code never reaches the server.
  const [empty, setEmpty] = useState(false);

  const open = useMutation({
    mutationFn: async (code: string) => {
      const result = await unlock({ data: { code } });
      if (!result.ok) throw new Error(result.error);
    },
    // The guards run again with the new session cookie.
    onSuccess: async () => {
      await router.invalidate();
      await router.navigate({ href: target });
    },
  });

  // Too many tries, or the server missing its settings, arrive as errors too.
  const error = empty ? "Enter the access code." : open.error?.message;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("code");
    const code = typeof value === "string" ? value.trim() : "";
    setEmpty(!code);
    if (code) open.mutate(code);
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <form
        onSubmit={submit}
        noValidate
        className="flex w-full max-w-sm flex-col gap-4"
      >
        <h1 className="font-heading text-3xl font-semibold">{appName}</h1>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="code">Access code</FieldLabel>
          <Input
            id="code"
            name="code"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          />
          {error && <FieldError id={errorId}>{error}</FieldError>}
        </Field>
        {/* Still pending while the app opens, so it can't go twice. */}
        <Button type="submit" disabled={open.isPending || open.isSuccess}>
          Continue
        </Button>
      </form>
    </main>
  );
}
