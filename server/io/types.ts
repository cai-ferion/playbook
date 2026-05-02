/**
 * server/io/types.ts
 * Shared TypeScript interfaces and types for IO domain modules.
 * Provides a common vocabulary across all route files.
 */
import type { Request, Response } from "express";

// ── Request Extensions ──────────────────────────────────────────
/** Standard actor headers injected by the frontend on every IO request. */
export interface IOActorHeaders {
  "x-actor-ohr"?: string;
  "x-actor-name"?: string;
}

/** Express Request with typed actor headers. */
export type IORequest = Request & {
  headers: Request["headers"] & IOActorHeaders;
};

// ── Common Query Params ──────────────────────────────────────────
export interface PaginationParams {
  limit?: string;
  offset?: string;
}

export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

export interface EmployeeFilterParams extends PaginationParams {
  ohr_id?: string;
  supervisor_name?: string;
  planning_group?: string;
  actual_role?: string;
  employement_status?: string;
  search?: string;
}

export interface AttendanceFilterParams extends DateRangeParams, PaginationParams {
  ohr_id?: string;
  status?: string;
  tag?: string;
  supervisor_name?: string;
  planning_group?: string;
  shift_time?: string;
  day?: string;
}

export interface CoachingFilterParams extends PaginationParams {
  ohr_id?: string;
  coach_ohr?: string;
  coaching_type?: string;
  startDate?: string;
  endDate?: string;
}

export interface LeaveFilterParams extends PaginationParams {
  ohr_id?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

// ── Domain Entities (lightweight view models) ──────────────────
export interface EmployeeView {
  ohr_id: string;
  full_name: string;
  supervisor_name: string | null;
  planning_group: string | null;
  actual_role: string | null;
  shift_time: string | null;
  department: string | null;
  employement_status: string | null;
}

export interface AttendanceRecord {
  id: number;
  ohr_id: string;
  date: string;
  status: string | null;
  tag: string | null;
  snap_planning_group: string | null;
  snap_actual_role: string | null;
  snap_shift_time: string | null;
}

// ── API Response Shapes ──────────────────────────────────────────
export interface ListResponse<T> {
  data: T[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface MutationResponse {
  success: boolean;
  id?: number | string;
  message?: string;
}

export interface BulkOperationResponse {
  success: boolean;
  inserted?: number;
  updated?: number;
  skipped?: number;
  total?: number;
  errors?: string[];
}

// ── Route Handler Type ──────────────────────────────────────────
export type IOHandler = (req: IORequest, res: Response) => Promise<any>;
