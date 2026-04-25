"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/platform/web/components/ui/input";
import { US_CITIES } from "../utils/city-list";
import { cn } from "@/core/utils";

interface Props {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  onEnter?: () => void;
  placeholder?: string;
}

const MAX_VISIBLE = 8;

/**
 * A small controlled combobox for picking a "City, ST" from the curated
 * US_CITIES list. Free-text is allowed (so small towns not in the list
 * still work — the backend zipcodes resolver handles them). The dropdown
 * opens below the input when focused with at least one prefix match;
 * arrow-key + Enter selects.
 */
export function LocationCombobox({ id, value, onChange, onEnter, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return US_CITIES.filter((c) => c.toLowerCase().startsWith(q)).slice(0, MAX_VISIBLE);
  }, [value]);

  // Reset highlight when the match set shrinks past the cursor.
  useEffect(() => {
    if (highlight >= matches.length) setHighlight(0);
  }, [matches.length, highlight]);

  // Close on outside click / blur (with a small delay so click-to-select works).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        inputRef.current && !inputRef.current.contains(t) &&
        listRef.current && !listRef.current.contains(t)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selectMatch = (s: string) => {
    onChange(s);
    setOpen(false);
    setHighlight(0);
    // Re-focus so the user can type more or press Enter to submit
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(matches.length - 1, h + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        // If the highlighted match is already the current value (user has
        // typed it in full), treat Enter as a submit signal — otherwise
        // select the highlighted suggestion.
        if (matches[highlight] === value) {
          onEnter?.();
          setOpen(false);
        } else {
          selectMatch(matches[highlight]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={`${id ?? "rd-loc"}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches.length > 0 ? `${id ?? "rd-loc"}-opt-${highlight}` : undefined
        }
      />
      {open && matches.length > 0 && (
        <ul
          ref={listRef}
          id={`${id ?? "rd-loc"}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-72 overflow-auto rounded-lg border border-input bg-popover py-1 shadow-md ring-1 ring-foreground/10"
        >
          {matches.map((c, i) => (
            <li
              key={c}
              id={`${id ?? "rd-loc"}-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectMatch(c)}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "cursor-pointer px-3 py-1.5 text-sm",
                i === highlight ? "bg-accent text-accent-foreground" : "text-foreground"
              )}
            >
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
