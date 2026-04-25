"use client";

import { Card, CardContent } from "@/platform/web/components/ui/card";
import { Compass } from "lucide-react";

interface Props {
  city: string;
  state: string;
  radiusMiles: number;
}

export function EmptyState({ city, state, radiusMiles }: Props) {
  return (
    <Card className="my-12">
      <CardContent className="py-12 text-center max-w-md mx-auto">
        <div className="flex justify-center mb-4">
          <Compass className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Not enough data for this region</h2>
        <p className="text-sm text-muted-foreground mb-2">
          We don't have enough recent order history near {city}, {state} at radius {radiusMiles} mi to surface high-confidence routes.
        </p>
        <p className="text-sm text-muted-foreground">
          Try a wider radius, a different anchor city, or a smaller order count (2 instead of 3).
        </p>
      </CardContent>
    </Card>
  );
}
