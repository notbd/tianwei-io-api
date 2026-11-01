/**
 * Response envelopes. Type-only: lib/responses.ts builds them with
 * `satisfies`, and responses are never runtime-validated (see posts.ts).
 */
export interface SuccessResponse<T> {
  status: 'success'
  data: T
}

export interface SuccessListResponse<T> {
  status: 'success'
  count: number
  data: T[]
}

export interface ErrorResponse {
  status: 'error'
  message: string
}
