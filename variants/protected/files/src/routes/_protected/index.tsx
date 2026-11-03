import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";

import { getUnlockedAt, lock } from "@/access/access.functions";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { appName } from "@/lib/app";

export const Route = createFileRoute("/_protected/")({ component: Home });

function Home() {
  const router = useRouter();
  const unlockedAt = useQuery({
    queryKey: ["access", "unlockedAt"],
    queryFn: () => getUnlockedAt(),
  });
  // The guards run again without the session, so the gate comes back.
  const signOut = useMutation({
    mutationFn: () => lock(),
    onSuccess: () => router.invalidate(),
  });

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-heading text-lg font-semibold">{appName}</span>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button
            variant="outline"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            Lock
          </Button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <h1 className="font-heading text-3xl font-semibold">{appName}</h1>
        <p className="mt-2 text-muted-foreground">
          Edit <code>src/routes/_protected/index.tsx</code> to get started.
        </p>
        {unlockedAt.data && (
          <p className="mt-2 text-muted-foreground">
            Unlocked at {new Date(unlockedAt.data).toLocaleString()}
          </p>
        )}
      </main>
    </div>
  );
}
