"use client";

import { useMemo, useState } from "react";
import { Button } from "@/platform/web/components/ui/button";
import { Input } from "@/platform/web/components/ui/input";
import { LocationCombobox } from "./LocationCombobox";
import { parseCityState } from "../utils/city-list";

export interface FilterBarValues {
  city: string;
  state: string;
  radius_miles: number;
}

interface Props {
  onSearch: (values: FilterBarValues) => void;
}

export function FilterBar({ onSearch }: Props) {
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState(100);

  const parsed = useMemo(() => parseCityState(location), [location]);
  const isValid = parsed !== null && radius >= 50 && radius <= 500;

  const handleSubmit = () => {
    if (!parsed) return;
    onSearch({
      city: parsed.city,
      state: parsed.state,
      radius_miles: radius,
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
      <div className="w-72">
        <label htmlFor="rd-location" className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm font-medium">Location</span>
          <span className="text-xs text-muted-foreground">City, ST</span>
        </label>
        <LocationCombobox
          id="rd-location"
          value={location}
          onChange={setLocation}
          onEnter={() => isValid && handleSubmit()}
          placeholder="City, State"
        />
      </div>

      <div className="w-28">
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
        />
      </div>

      <Button type="button" onClick={handleSubmit} disabled={!isValid}>
        Search
      </Button>
    </div>
  );
}
