/**
 * Standard API response envelope used by NEW certificate endpoints.
 *
 * Successful:  { success: true,  data: T,    error: null }
 * Failure:     { success: false, data: null, error: { message, code } }
 *
 * Existing endpoints intentionally keep their original shapes to avoid
 * breaking the current frontend consumers; new endpoints adopt this envelope
 * so the public API moves toward consistency without a big-bang refactor.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiFailure {
  success: false;
  data: null;
  error: {
    message: string;
    code: string;
  };
}

export interface ApiFailureWithData<D> {
  success: false;
  data: D;
  error: {
    message: string;
    code: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data, error: null };
}

export function fail(message: string, code: string): ApiFailure {
  return { success: false, data: null, error: { message, code } };
}

export function failWith<D>(message: string, code: string, data: D): ApiFailureWithData<D> {
  return { success: false, data, error: { message, code } };
}
