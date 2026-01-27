declare module 'lusca' {
  import { RequestHandler } from 'express';

  interface LuscaOptions {
    csrf?:
      | boolean
      | {
          cookie?:
            | string
            | {
                name?: string;
                httpOnly?: boolean;
                secure?: boolean;
                sameSite?: 'strict' | 'lax' | 'none';
              };
          header?: string;
          angular?: boolean;
        };
    xframe?: string | boolean;
    p3p?: string;
    hsts?:
      | boolean
      | {
          maxAge?: number;
          includeSubDomains?: boolean;
          preload?: boolean;
        };
    xssProtection?:
      | boolean
      | {
          enabled?: boolean;
          mode?: 'block' | null;
        };
    nosniff?: boolean;
    referrerPolicy?: string;
  }

  function lusca(options?: LuscaOptions): RequestHandler;

  namespace lusca {
    function csrf(options?: LuscaOptions['csrf']): RequestHandler;
    function xframe(value: string | boolean): RequestHandler;
    function p3p(value: string): RequestHandler;
    function hsts(options?: LuscaOptions['hsts']): RequestHandler;
    function xssProtection(
      options?: LuscaOptions['xssProtection'],
    ): RequestHandler;
    function nosniff(): RequestHandler;
    function referrerPolicy(value: string): RequestHandler;
  }

  export = lusca;
}
