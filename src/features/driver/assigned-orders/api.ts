import { fetchApi } from "@/core/services/api";
import type {
  ActiveSyncTask,
  AssignedOrdersListResponse,
  SyncAllResponse,
} from "./types";

/**
 * Returns the assigned-orders list payload including sync state. Callers that
 * only care about the orders array can destructure `.orders` from the result.
 */
export async function listAssignedOrders(): Promise<AssignedOrdersListResponse> {
  return fetchApi<AssignedOrdersListResponse>("/driver/assigned-orders");
}

export async function refreshAssignedOrders(): Promise<{ queued: true }> {
  return fetchApi<{ queued: true }>("/driver/assigned-orders/refresh", {
    method: "POST",
  });
}

export async function syncAllAssignedOrders(): Promise<SyncAllResponse> {
  return fetchApi<SyncAllResponse>("/driver/assigned-orders/sync-all", {
    method: "POST",
  });
}

export async function getTask(taskId: string): Promise<ActiveSyncTask> {
  return fetchApi<ActiveSyncTask>(`/tasks/${encodeURIComponent(taskId)}`);
}
