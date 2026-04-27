import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TopRegionLanesTable } from "../top-region-lanes-table";

vi.mock("@/core/hooks/use-analytics", () => ({
  useAnalyticsTopRegionLanes: vi.fn(),
}));

import { useAnalyticsTopRegionLanes } from "@/core/hooks/use-analytics";

const mockHook = useAnalyticsTopRegionLanes as unknown as { mockReturnValue: Function; mockClear: () => void };

describe("TopRegionLanesTable", () => {
  afterEach(() => {
    cleanup();
    mockHook.mockClear();
  });

  it("renders 'Top Lanes (Regions)' title", () => {
    mockHook.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<TopRegionLanesTable companyId="c-1" />);
    expect(screen.getByText("Top Lanes (Regions)")).toBeInTheDocument();
  });

  it("renders origin_label → destination_label and formats numeric columns", () => {
    mockHook.mockReturnValue({
      data: [
        {
          origin_cell_lat: 35.5, origin_cell_lng: -90,
          destination_cell_lat: 32.5, destination_cell_lng: -97,
          origin_display_city: "Memphis", origin_display_state: "TN",
          destination_display_city: "Dallas", destination_display_state: "TX",
          origin_label: "Memphis, TN", destination_label: "Dallas, TX",
          load_count: 8, loads_per_day: 8.4, median_rate_per_mile: 2.40, median_pay: 1820,
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<TopRegionLanesTable companyId="c-1" />);
    expect(screen.getByText("Memphis, TN → Dallas, TX")).toBeInTheDocument();
    expect(screen.getByText("8.4")).toBeInTheDocument();
    expect(screen.getByText("$2.40")).toBeInTheDocument();
    expect(screen.getByText("$1,820")).toBeInTheDocument();
  });

  it("renders em-dash for null median_rate_per_mile and null median_pay", () => {
    mockHook.mockReturnValue({
      data: [
        {
          origin_cell_lat: 35.5, origin_cell_lng: -90,
          destination_cell_lat: 32.5, destination_cell_lng: -97,
          origin_display_city: "Memphis", origin_display_state: "TN",
          destination_display_city: "Dallas", destination_display_state: "TX",
          origin_label: "Memphis, TN", destination_label: "Dallas, TX",
          load_count: 1, loads_per_day: 0.1, median_rate_per_mile: null, median_pay: null,
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<TopRegionLanesTable companyId="c-1" />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(2);
  });

  it("renders 'No data available' when array is empty", () => {
    mockHook.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<TopRegionLanesTable companyId="c-1" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("clicking Median Pay re-ranks rows client-side by median_pay DESC", () => {
    mockHook.mockReturnValue({
      data: [
        {
          origin_cell_lat: 35.5, origin_cell_lng: -90, destination_cell_lat: 32.5, destination_cell_lng: -97,
          origin_display_city: "HighVol", origin_display_state: "TN", destination_display_city: "A", destination_display_state: "TX",
          origin_label: "HighVol, TN", destination_label: "A, TX",
          load_count: 100, loads_per_day: 10, median_rate_per_mile: 2.0, median_pay: 1000,
        },
        {
          origin_cell_lat: 32.5, origin_cell_lng: -97, destination_cell_lat: 30, destination_cell_lng: -95,
          origin_display_city: "HighPay", origin_display_state: "TX", destination_display_city: "B", destination_display_state: "TX",
          origin_label: "HighPay, TX", destination_label: "B, TX",
          load_count: 20, loads_per_day: 2, median_rate_per_mile: 3.0, median_pay: 3000,
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<TopRegionLanesTable companyId="c-1" />);
    let rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("HighVol");
    fireEvent.click(screen.getByText("Median Pay"));
    rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("HighPay");
  });
});
