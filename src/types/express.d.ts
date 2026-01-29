import 'express';

declare global {
  namespace Express {
    interface Locals {
      csrfToken?: string;
      cspNonce?: string;
    }
  }
}
