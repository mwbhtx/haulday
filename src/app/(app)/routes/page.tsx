"use client";

import { useIsMobile } from "@/platform/web/hooks/use-is-mobile";
import { DesktopRoutesView } from "@/features/routes/views/desktop/desktop-routes-view";
import { MobileRoutesView } from "@/features/routes/views/mobile/mobile-routes-view";

export default function RoutesPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileRoutesView /> : <DesktopRoutesView />;
}
