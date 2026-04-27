import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TopRegionsTable } from "../top-regions-table";

vi.mock("@/core/hooks/use-analytics", () => ({
  useAnalyticsTopRegions: vi.fn(),
}));

import { useAnalyticsTopRegions } from "@/core/hooks/use-analytics";

const mockHook = useAnalyticsTopRegions as unknown as { mockReturnValue: Function; mockClear: () => void };

describe("TopRegionsTable", () => {
  afterEach(() => {
    cleanup();
    mockHook.mockClear();
  });

  it("renders 'Top Export Regions' for side=origin", () => {
    mockHook.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<TopRegionsTable companyId="c-1" side="origin" />);
    expect(screen.getByText("Top Export Regions")).toBeInTheDocument();
  });

  it("renders 'Top Import Regions' for side=destination and 'Inbound Diversity' header", () => {
    mockHook.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<TopRegionsTable companyId="c-1" side="destination" />);
    expect(screen.getByText("Top Import Regions")).toBeInTheDocument();
    expect(screen.getByText("Inbound Diversity")).toBeInTheDocument();
  });

  it("formats numeric columns: loads/day to 1 dp, $/mi to currency 2 dp, entropy to 2 dp; em-dash for null median", () => {
    mockHook.mockReturnValue({
      data: [
        {
          cell_lat: 35.5, cell_lng: -90.0,
          display_city: "Memphis", display_state: "TN",
          load_count: 12, loads_per_day: 12.4, median_rate_per_mile: 2.41, entropy_h: 2.84,
        },
        {
          cell_lat: 32.5, cell_lng: -97.0,
          display_city: "Dallas", display_state: "TX",
          load_count: 1, loads_per_day: 0.4, median_rate_per_mile: null, entropy_h: 0,
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<TopRegionsTable companyId="c-1" side="origin" />);
    expect(screen.getByText("Memphis, TN")).toBeInTheDocument();
    expect(screen.getByText("12.4")).toBeInTheDocument();
    expect(screen.getByText("$2.41")).toBeInTheDocument();
    expect(screen.getByText("2.84")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders 'No data available' when array is empty", () => {
    mockHook.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<TopRegionsTable companyId="c-1" side="origin" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("clicking $/mi header re-ranks rows client-side by median_rate_per_mile DESC", () => {
    mockHook.mockReturnValue({
      data: [
        { cell_lat: 35.5, cell_lng: -90, display_city: "HighVol", display_state: "TN", load_count: 100, loads_per_day: 10, median_rate_per_mile: 2.0, entropy_h: 2.5 },
        { cell_lat: 32.5, cell_lng: -97, display_city: "HighRate", display_state: "TX", load_count: 50, loads_per_day: 5, median_rate_per_mile: 3.5, entropy_h: 1.0 },
      ],
      isLoading: false,
      isError: false,
    });
    render(<TopRegionsTable companyId="c-1" side="origin" />);
    let rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("HighVol");
    fireEvent.click(screen.getByText("$/mi"));
    rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("HighRate");
  });
});
