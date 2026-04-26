import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FilterBar } from "./FilterBar";

afterEach(() => cleanup());

describe("FilterBar", () => {
  it("renders Location and Radius inputs with no order count picker", () => {
    render(<FilterBar onSearch={vi.fn()} />);
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/radius/i)).toBeInTheDocument();
    expect(screen.queryByText(/orders/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });

  it("disables Search until Location parses as 'City, ST'", () => {
    render(<FilterBar onSearch={vi.fn()} />);
    const button = screen.getByRole("button", { name: /search/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: "Houston" } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: "Houston, TX" } });
    expect(button).not.toBeDisabled();
  });

  it("emits onSearch with city, state, and radius — no order_count", () => {
    const onSearch = vi.fn();
    render(<FilterBar onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: "Houston, TX" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onSearch).toHaveBeenCalledWith({
      city: "Houston",
      state: "TX",
      radius_miles: 100,
    });
  });

  it("normalizes the state code to uppercase", () => {
    const onSearch = vi.fn();
    render(<FilterBar onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: "memphis, tn" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onSearch).toHaveBeenCalledWith({
      city: "memphis",
      state: "TN",
      radius_miles: 100,
    });
  });

  it("submits on Enter when valid", () => {
    const onSearch = vi.fn();
    render(<FilterBar onSearch={onSearch} />);
    const loc = screen.getByLabelText(/location/i);
    fireEvent.change(loc, { target: { value: "Atlanta, GA" } });
    fireEvent.keyDown(loc, { key: "Enter" });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});
