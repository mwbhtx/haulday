import { create } from 'zustand';
import type { RouteChain } from '@/core/types';
import type { PlaceResult } from '@/features/routes/components/search-form';

export type SortKey = 'profit' | 'pay' | 'distance' | 'pickup';
export type SortDir = 'asc' | 'desc';

interface SimulationStore {
  origin: PlaceResult | null;
  destination: PlaceResult | null;
  radius: number;
  departureDate: string;
  orderA: RouteChain | null;
  orderB: RouteChain | null;
  col1Sort: { key: SortKey; dir: SortDir };
  col2Sort: { key: SortKey; dir: SortDir };
  set: (patch: Partial<Omit<SimulationStore, 'set'>>) => void;
}

export const useSimulationStore = create<SimulationStore>((setState) => ({
  origin: null,
  destination: null,
  radius: 250,
  departureDate: new Date().toISOString().slice(0, 10),
  orderA: null,
  orderB: null,
  col1Sort: { key: 'pay', dir: 'desc' },
  col2Sort: { key: 'pay', dir: 'desc' },
  set: (patch) => setState(patch),
}));
