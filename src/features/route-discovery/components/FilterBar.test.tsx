import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FilterBar } from "./FilterBar";

afterEach(() => cleanup());

describe("FilterBar", () => {
  it("renders a single Location input, Radius, Orders, and Search", () => {
    render(<FilterBar onSearch={vi.fn()} />);
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/radius/i)).toBeInTheDocument();
    expect(screen.getByText(/orders/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });

  it("disables Search until Location parses as 'City, ST'", () => {
    render(<FilterBar onSearch={vi.fn()} />);
    const button = screen.getByRole("button", { name: /search/i });
    expect(button).toBeDisabled();

    const loc = screen.getByLabelText(/location/i);
    fireEvent.change(loc, { target: { value: "Houston" } });
    expect(button).toBeDisabled();

    fireEvent.change(loc, { target: { value: "Houston, TX" } });
    expect(button).not.toBeDisabled();
  });

  it("emits onSearch with the parsed city + state", () => {
    const onSearch = vi.fn();
    render(<FilterBar onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText(/location/i), {
      target: { value: "Houston, TX" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onSearch).toHaveBeenCalledWith({
      city: "Houston",
      state: "TX",
      radius_miles: 100,
      order_count: 3,
    });
  });

  it("normalizes the state code to uppercase", () => {
    const onSearch = vi.fn();
    render(<FilterBar onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText(/location/i), {
      target: { value: "memphis, tn" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onSearch).toHaveBeenCalledWith({
      city: "memphis",
      state: "TN",
      radius_miles: 100,
      order_count: 3,
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
