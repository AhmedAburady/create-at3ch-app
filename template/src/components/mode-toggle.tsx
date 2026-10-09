import { Monitor, Moon, Sun } from "lucide-react";
import { type Theme, useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

const order: Theme[] = ["light", "dark", "system"];

const meta: Record<Theme, { icon: typeof Sun; label: string }> = {
	light: { icon: Sun, label: "Light" },
	dark: { icon: Moon, label: "Dark" },
	system: { icon: Monitor, label: "System" },
};

export function ModeToggle({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme();
	const { icon: Icon, label } = meta[theme];

	return (
		<Button
			variant="ghost"
			size="icon"
			className={className}
			title={`Theme: ${label}. Click to change.`}
			onClick={() => setTheme(order[(order.indexOf(theme) + 1) % order.length])}
		>
			<Icon className="size-4" strokeWidth={1.75} />
			<span className="sr-only">Theme: {label}. Click to change.</span>
		</Button>
	);
}
