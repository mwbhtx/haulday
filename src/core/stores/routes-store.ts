import { create } from 'zustand';
import type { RouteChain } from '@/core/types';
import type { RouteSearchParams } from '@/core/hooks/use-routes';

interface RoutesStore {
  searchParams: RouteSearchParams | null;
  selectedItemIndex: number;
  selectedChain: RouteChain | null;
  originFilter: { lat: number; lng: number; city: string } | null;
  destFilter: { lat: number; lng: number; city: string } | null;
  set: (patch: Partial<Omit<RoutesStore, 'set'>>) => void;
}

export const useRoutesStore = create<RoutesStore>((setState) => ({
  searchParams: null,
  selectedItemIndex: 0,
  selectedChain: null,
  originFilter: null,
  destFilter: null,
  set: (patch) => setState(patch),
}));
