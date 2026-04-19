export interface AssignedOrder {
  order_id: string;
  status: "dispatched" | "settled";
  ingested_at: string;
  has_order_details: boolean;
  // Merged fields from orders table (present when has_order_details = true):
  pickup_date?: string;
  dispatch_date?: string;
  origin_city?: string;
  origin_state?: string;
  destination_city?: string;
  destination_state?: string;
  loaded_miles?: number;
  rate_per_mile?: number;
  pay?: number;
  unit_number?: string;
  trailer?: string;
}

export type TaskStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Subset of the backend Task type (from @mwbhtx/haulvisor-core) needed by the
 * Sync All UI. The backend returns the full Task object on
 * GET /driver/assigned-orders.active_sync_task and GET /tasks/:id; we only
 * type the fields the button + hook actually read.
 */
export interface ActiveSyncTask {
  task_id: string;
  task_status: TaskStatus;
  orders_total: number;
  orders_completed: number;
  updated_at: string;
}

export interface AssignedOrdersListResponse {
  orders: AssignedOrder[];
  count: number;
  next_sync_available_at: string | null;
  active_sync_task: ActiveSyncTask | null;
}

export interface SyncAllResponse {
  task_id: string;
  orders_total: number;
  next_sync_available_at: string;
}
