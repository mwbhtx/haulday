import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { act, renderHook, cleanup } from "@testing-library/react";
import { computeCadence, useSyncAllState } from "./useSyncAllState";
import * as api from "../api";

vi.mock("../api");

const now = new Date("2026-04-18T12:00:00.000Z");

describe("computeCadence", () => {
  it("returns 1s when <= 10s remaining", () => {
    expect(computeCadence(10_000)).toBe(1_000);
    expect(computeCadence(0)).toBe(1_000);
  });

  it("returns 5s when 10s < remaining <= 60s", () => {
    expect(computeCadence(11_000)).toBe(5_000);
    expect(computeCadence(60_000)).toBe(5_000);
  });

  it("returns 60s when > 60s remaining", () => {
    expect(computeCadence(61_000)).toBe(60_000);
    expect(computeCadence(15 * 60_000)).toBe(60_000);
  });
});

describe("useSyncAllState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("starts in 'ready' when no active task and cooldown already elapsed", () => {
    const { result } = renderHook(() =>
      useSyncAllState({
        activeSyncTask: null,
        nextSyncAvailableAt: now.toISOString(),
        onFinished: vi.fn(),
      }),
    );
    expect(result.current.state).toBe("ready");
    expect(result.current.enabled).toBe(true);
  });

  it("starts in 'ready' when nextSyncAvailableAt is null (never synced)", () => {
    const { result } = renderHook(() =>
      useSyncAllState({
        activeSyncTask: null,
        nextSyncAvailableAt: null,
        onFinished: vi.fn(),
      }),
    );
    expect(result.current.state).toBe("ready");
    expect(result.current.enabled).toBe(true);
  });

  it("starts in 'cooldown' with remainingMs > 0", () => {
    const future = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const { result } = renderHook(() =>
      useSyncAllState({
        activeSyncTask: null,
        nextSyncAvailableAt: future,
        onFinished: vi.fn(),
      }),
    );
    expect(result.current.state).toBe("cooldown");
    expect(result.current.enabled).toBe(false);
    expect(result.current.remainingMs).toBe(10 * 60 * 1000);
  });

  it("transitions cooldown -> ready when time elapses", async () => {
    const future = new Date(now.getTime() + 5_000).toISOString();
    const { result } = renderHook(() =>
      useSyncAllState({
        activeSyncTask: null,
        nextSyncAvailableAt: future,
        onFinished: vi.fn(),
      }),
    );
    expect(result.current.state).toBe("cooldown");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(result.current.state).toBe("ready");
  });

  it("polls /tasks/:id while in-flight and exits to 'just_finished' on completion", async () => {
    const mockGetTask = api.getTask as unknown as ReturnType<typeof vi.fn>;
    mockGetTask
      .mockResolvedValueOnce({
        task_id: "t1",
        task_status: "processing",
        orders_total: 10,
        orders_completed: 5,
        updated_at: now.toISOString(),
      })
      .mockResolvedValueOnce({
        task_id: "t1",
        task_status: "completed",
        orders_total: 10,
        orders_completed: 10,
        updated_at: now.toISOString(),
      });
    const onFinished = vi.fn();
    const { result } = renderHook(() =>
      useSyncAllState({
        activeSyncTask: {
          task_id: "t1",
          task_status: "processing",
          orders_total: 10,
          orders_completed: 0,
          updated_at: now.toISOString(),
        },
        nextSyncAvailableAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
        onFinished,
      }),
    );
    expect(result.current.state).toBe("in_flight");
    expect(result.current.progress).toEqual({ completed: 0, total: 10 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.progress?.completed).toBe(5);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.state).toBe("just_finished");
    expect(onFinished).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.state).toBe("cooldown");
  });

  it("transitions to 'failed' briefly then cooldown when task fails", async () => {
    const mockGetTask = api.getTask as unknown as ReturnType<typeof vi.fn>;
    mockGetTask.mockResolvedValueOnce({
      task_id: "t1",
      task_status: "failed",
      orders_total: 10,
      orders_completed: 2,
      updated_at: now.toISOString(),
    });
    const { result } = renderHook(() =>
      useSyncAllState({
        activeSyncTask: {
          task_id: "t1",
          task_status: "processing",
          orders_total: 10,
          orders_completed: 0,
          updated_at: now.toISOString(),
        },
        nextSyncAvailableAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
        onFinished: vi.fn(),
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.state).toBe("failed");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.state).toBe("cooldown");
  });
});
