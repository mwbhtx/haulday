import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TopStatesTable } from "../top-states-table";

vi.mock("@/core/hooks/use-analytics", () => ({
  useAnalyticsTopStates: vi.fn(),
}));

import { useAnalyticsTopStates } from "@/core/hooks/use-analytics";

afterEach(() => {
  cleanup();
});

describe("TopStatesTable", () => {
  it("renders 'Top Origin States' for side=origin", () => {
    (useAnalyticsTopStates as unknown as { mockReturnValue: Function }).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<TopStatesTable companyId="c-1" side="origin" />);
    expect(screen.getByText("Top Origin States")).toBeInTheDocument();
    expect(screen.getByText("Outbound Diversity")).toBeInTheDocument();
  });

  it("renders rows with state-level fields", () => {
    (useAnalyticsTopStates as unknown as { mockReturnValue: Function }).mockReturnValue({
      data: [
        { state: "TX", load_count: 50, loads_per_day: 7.1, median_rate_per_mile: 2.18, entropy_h: 3.11 },
      ],
      isLoading: false,
      isError: false,
    });
    render(<TopStatesTable companyId="c-1" side="origin" />);
    expect(screen.getByText("TX")).toBeInTheDocument();
    expect(screen.getByText("7.1")).toBeInTheDocument();
    expect(screen.getByText("$2.18")).toBeInTheDocument();
    expect(screen.getByText("3.11")).toBeInTheDocument();
  });

  it("renders 'No data available' when array is empty", () => {
    (useAnalyticsTopStates as unknown as { mockReturnValue: Function }).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<TopStatesTable companyId="c-1" side="destination" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });
});
