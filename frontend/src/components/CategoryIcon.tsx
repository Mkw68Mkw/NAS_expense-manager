import { getCategoryIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function CategoryIcon({ icon, color, size = "md" }: { icon: string; color: string; size?: "sm" | "md" | "lg" }) {
  const Icon = getCategoryIcon(icon);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        size === "sm" && "size-6 [&_svg]:size-3.5",
        size === "md" && "size-8 [&_svg]:size-4",
        size === "lg" && "size-10 [&_svg]:size-5",
      )}
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <Icon />
    </span>
  );
}

export function CategoryLabel({ name, icon, color }: { name: string; icon: string; color: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <CategoryIcon icon={icon} color={color} size="sm" />
      <span className="truncate">{name}</span>
    </span>
  );
}
