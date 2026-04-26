"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Zap, Wrench } from "lucide-react";
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
    <Tabs
      value={activeTab}
      onValueChange={setTab}
      className="-mx-6 -mt-6 flex h-[calc(100%+3rem)] flex-col"
    >
      {/* Sub-nav band — flush with the top nav, fixed as page scrolls.
          Outer Tabs container absorbs main's p-6 via negative margins so the
          sticky child has the full content area to stick within. */}
      <div className="sticky top-0 z-10 shrink-0 border-b border-border/50 bg-sidebar px-6 py-2">
        <TabsList variant="line" className="bg-transparent gap-6">
          <TabsTrigger value="generate" className="gap-1.5">
            <Zap className="h-4 w-4" />
            Generate
          </TabsTrigger>
          <TabsTrigger value="build" className="gap-1.5">
            <Wrench className="h-4 w-4" />
            Build
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="generate" className="flex-1 px-6 pt-8 pb-6">
        <DesktopRoutesView />
      </TabsContent>
      <TabsContent value="build" className="flex-1 px-6 pt-8 pb-6">
        <DesktopSimulationView />
      </TabsContent>
    </Tabs>
  );
}
