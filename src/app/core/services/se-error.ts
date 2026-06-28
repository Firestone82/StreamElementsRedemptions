export class SEError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export function isAuthError(err: unknown): err is SEError {
  return err instanceof SEError && (err.status === 401 || err.status === 403);
}
