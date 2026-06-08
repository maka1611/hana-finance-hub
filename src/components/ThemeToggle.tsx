import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle({
  className,
  variant = "ghost",
}: {
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      onClick={toggle}
      className={className}
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}