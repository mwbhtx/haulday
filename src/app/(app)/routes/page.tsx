"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Search, FlaskConical } from "lucide-react";
import { useIsMobile } from "@/platform/web/hooks/use-is-mobile";
import { DesktopRoutesView } from "@/features/routes/views/desktop/desktop-routes-view";
import { MobileRoutesView } from "@/features/routes/views/mobile/mobile-routes-view";
import { DesktopSimulationView } from "@/features/simulation/views/desktop/desktop-simulation-view";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/platform/web/components/ui/tabs";

const VALID_TABS = ["generate", "build"] as const;
type TabValue = (typeof VALID_TABS)[number];

function isValidTab(value: string | null): value is TabValue {
  return value !== null && (VALID_TABS as readonly string[]).includes(value);
}

export default function RoutesPage() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  if (isMobile) return <MobileRoutesView />;

  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = isValidTab(tabParam) ? tabParam : "generate";

  function setTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={activeTab} onValueChange={setTab} className="h-full">
      <TabsList variant="line" className="mb-2">
        <TabsTrigger value="generate" className="gap-1.5">
          <Search className="h-4 w-4" />
          Generate
        </TabsTrigger>
        <TabsTrigger value="build" className="gap-1.5">
          <FlaskConical className="h-4 w-4" />
          Build
        </TabsTrigger>
      </TabsList>
      <TabsContent value="generate" className="flex-1">
        <DesktopRoutesView />
      </TabsContent>
      <TabsContent value="build" className="flex-1">
        <DesktopSimulationView />
      </TabsContent>
    </Tabs>
  );
}
