import { Link } from "react-router";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Seite nicht gefunden"
      description="Die angeforderte Seite existiert nicht."
      action={
        <Button asChild>
          <Link to="/">Zum Dashboard</Link>
        </Button>
      }
      className="py-24"
    />
  );
}
