declare module 'csrf-sync' {
  import { Request, Response, NextFunction } from 'express';

  interface CsrfSyncOptions {
    getTokenFromRequest?: (req: Request) => string | null | undefined;
    getTokenFromState?: (req: Request) => string | null | undefined;
    storeTokenInState?: (req: Request, token: string) => void;
    size?: number;
    ttl?: number;
  }

  interface CsrfSyncResult {
    csrfSynchronisedProtection: (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => void;
    generateToken: (req: Request) => string;
    invalidCsrfTokenError: Error;
  }

  export function csrfSync(options?: CsrfSyncOptions): CsrfSyncResult;
}
