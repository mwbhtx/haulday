"use client";

import { useRef, useEffect } from "react";
import type { CardComponentProps } from "onborda";
import { useOnborda } from "onborda";
import { X } from "lucide-react";
import { useUpdateSettings } from "@/core/hooks/use-settings";
import { isDemoUser } from "@/core/services/auth";

export function OnbordaCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  arrow,
}: CardComponentProps) {
  const { closeOnborda } = useOnborda();
  const updateSettings = useUpdateSettings();
  const cardRef = useRef<HTMLDivElement>(null);

  const dismiss = () => {
    if (isDemoUser()) {
      sessionStorage.setItem("hv-tour-dismissed", "1");
    } else {
      updateSettings.mutate({ onboarding_completed: true } as any);
    }
    closeOnborda();
  };

  // Nudge card back into viewport if it overflows — preserves onborda's
  // positioning and arrow, just shifts enough to stop clipping.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = "";

    const timer = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let dx = 0;
      let dy = 0;

      // Only nudge if actually clipped (negative position or past viewport)
      if (rect.left < 0) dx = -rect.left + 8;
      else if (rect.right > vw) dx = vw - rect.right - 8;
      if (rect.top < 0) dy = -rect.top + 8;
      else if (rect.bottom > vh) dy = vh - rect.bottom - 8;

      if (dx !== 0 || dy !== 0) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [currentStep]);

  return (
    <div ref={cardRef} className="relative w-72 rounded-lg border border-border bg-card p-4 shadow-xl">
      {/* Close button */}
      <button
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Icon + title */}
      <div className="flex items-center gap-2 pr-6">
        {step.icon}
        <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
      </div>

      {/* Content */}
      <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
        {step.content}
      </div>

      {/* Controls */}
      {step.showControls && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {currentStep + 1} of {totalSteps}
          </span>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={prevStep}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={currentStep + 1 === totalSteps ? dismiss : nextStep}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {currentStep + 1 === totalSteps ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      )}

      {/* Arrow pointing at the target element */}
      {arrow}
    </div>
  );
}
