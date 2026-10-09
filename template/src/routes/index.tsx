import { createFileRoute } from "@tanstack/react-router";
import { ModeToggle } from "@/components/mode-toggle";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<div className="flex min-h-svh flex-col">
			<header className="flex items-center justify-between border-b px-6 py-4">
				<span className="font-heading text-lg font-semibold">__APP_NAME__</span>
				<ModeToggle />
			</header>
			<main className="flex-1 p-6">
				<h1 className="font-heading text-3xl font-semibold">__APP_NAME__</h1>
				<p className="mt-2 text-muted-foreground">
					Edit <code>src/routes/index.tsx</code> to get started.
				</p>
			</main>
		</div>
	);
}
