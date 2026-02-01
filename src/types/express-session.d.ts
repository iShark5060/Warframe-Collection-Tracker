import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user_id?: number;
    username?: string;
    is_admin?: boolean;
    login_time?: number;
    csrfToken?: string;
  }
}
