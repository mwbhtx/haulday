"use client";

import { useMemo, useState } from "react";
import { Button } from "@/platform/web/components/ui/button";
import { Input } from "@/platform/web/components/ui/input";
import { US_CITIES, parseCityState } from "../utils/city-list";

export interface FilterBarValues {
  city: string;
  state: string;
  radius_miles: number;
  order_count: 2 | 3 | 4;
}

interface Props {
  onSearch: (values: FilterBarValues) => void;
}

export function FilterBar({ onSearch }: Props) {
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState(100);
  const [orders, setOrders] = useState<2 | 3 | 4>(3);

  const parsed = useMemo(() => parseCityState(location), [location]);
  const isValid = parsed !== null && radius >= 50 && radius <= 500;

  const handleSubmit = () => {
    if (!parsed) return;
    onSearch({
      city: parsed.city,
      state: parsed.state,
      radius_miles: radius,
      order_count: orders,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && isValid) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[260px]">
        <label htmlFor="rd-location" className="block text-sm font-medium mb-1.5">
          Location
        </label>
        <Input
          id="rd-location"
          list="rd-location-list"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Houston, TX"
          aria-describedby="rd-location-hint"
          autoComplete="off"
        />
        <datalist id="rd-location-list">
          {US_CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <span
          id="rd-location-hint"
          className="block text-xs text-muted-foreground mt-1"
        >
          City, ST
        </span>
      </div>

      <div>
        <label htmlFor="rd-radius" className="block text-sm font-medium mb-1.5">
          Radius (mi)
        </label>
        <Input
          id="rd-radius"
          type="number"
          min={50}
          max={500}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          onKeyDown={handleKeyDown}
          className="w-24"
        />
      </div>

      <div>
        <span className="block text-sm font-medium mb-1.5">Orders</span>
        <div role="group" className="flex gap-1">
          {([2, 3, 4] as const).map((n) => (
            <Button
              key={n}
              type="button"
              variant={orders === n ? "default" : "outline"}
              size="sm"
              onClick={() => setOrders(n)}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>

      <Button type="button" onClick={handleSubmit} disabled={!isValid}>
        Search
      </Button>
    </div>
  );
}
