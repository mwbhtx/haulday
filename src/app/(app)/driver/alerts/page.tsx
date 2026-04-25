"use client";

import { AlertMatchesPanel } from "@/features/alerts/components/AlertMatchesPanel";
import { AlertsSection } from "@/features/alerts/components/AlertsSection";

export default function DriverAlertsPage() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <AlertMatchesPanel defaultExpanded />
      <AlertsSection />
    </div>
  );
}
