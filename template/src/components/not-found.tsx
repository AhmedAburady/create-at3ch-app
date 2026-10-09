import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function NotFound() {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="font-heading text-3xl font-semibold">Page not found</h1>
			<p className="text-muted-foreground">
				The page you're looking for doesn't exist.
			</p>
			<Button nativeButton={false} render={<Link to="/" />}>
				Back home
			</Button>
		</div>
	);
}
