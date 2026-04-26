import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/core/services/auth-provider";
import { fetchTopRoutes } from "../api";

export function useTopRoutes() {
  const { activeCompanyId } = useAuth();
  return useQuery({
    queryKey: ["route-discovery", "top-routes", activeCompanyId],
    queryFn: () => {
      if (!activeCompanyId) throw new Error("no company");
      return fetchTopRoutes(activeCompanyId);
    },
    enabled: !!activeCompanyId,
    staleTime: 5 * 60 * 1000,
  });
}
