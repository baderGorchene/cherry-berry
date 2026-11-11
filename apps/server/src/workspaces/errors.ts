import { HttpError } from "../errors";

const STATUS = {
  not_found: 404,
  wrong_password: 401,
  forbidden: 403,
  wrong_mode: 400,
  password_required: 400,
  invitation_invalid: 400,
  invitation_used: 400,
  invitation_wrong_email: 400,
} as const;

export type WorkspaceErrorCode = keyof typeof STATUS;

/** Domain error; its HTTP status comes from STATUS so the app error handler can send it as-is. */
export class WorkspaceError extends HttpError {
  constructor(public override code: WorkspaceErrorCode) { super(STATUS[code], code); }
}
