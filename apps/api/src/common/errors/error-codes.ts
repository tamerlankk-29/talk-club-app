/**
 * Stable, documented error codes. Clients switch on `code`; `message` is safe
 * to show to end users as-is. The HTTP status is the default for the code.
 */
export const ERROR_CATALOG = {
  // Generic
  VALIDATION_FAILED: { status: 400, message: 'Please check the highlighted fields and try again.' },
  UNAUTHENTICATED: { status: 401, message: 'Please sign in to continue.' },
  FORBIDDEN: { status: 403, message: "You don't have access to this action." },
  NOT_FOUND: { status: 404, message: 'We could not find what you were looking for.' },
  CONFLICT: { status: 409, message: 'This change conflicts with existing data. Please refresh and try again.' },
  RATE_LIMITED: { status: 429, message: 'Too many attempts. Please wait a moment and try again.' },
  INTERNAL: { status: 500, message: 'Something went wrong. Please try again.' },

  // Authentication
  AUTH_INVALID_CREDENTIALS: { status: 401, message: 'Incorrect login or password.' },
  AUTH_ACCOUNT_BLOCKED: { status: 403, message: 'This account is blocked. Please contact Talk Club.' },
  AUTH_REFRESH_INVALID: { status: 401, message: 'Your session has expired. Please sign in again.' },
  AUTH_OTP_INVALID: { status: 400, message: 'The code is incorrect. Please check and try again.' },
  AUTH_OTP_EXPIRED: { status: 400, message: 'The code has expired. Please request a new one.' },
  AUTH_OTP_TOO_MANY_ATTEMPTS: { status: 429, message: 'Too many incorrect attempts. Please request a new code.' },
  AUTH_OTP_COOLDOWN: { status: 429, message: 'Please wait before requesting another code.' },
  AUTH_SMS_UNAVAILABLE: { status: 400, message: 'Codes by SMS are not available yet. Please get your code in Telegram.' },
  AUTH_TELEGRAM_UNAVAILABLE: { status: 400, message: 'Codes in Telegram are not available right now. Please use SMS.' },
  AUTH_TELEGRAM_NOT_LINKED: { status: 409, message: 'Open the Talk Club bot in Telegram and share your phone number first.' },
  AUTH_SMS_COUNTRY_NOT_SUPPORTED: { status: 400, message: 'Codes by SMS go only to Kazakhstan numbers (+7). Please get your code in Telegram.' },
  AUTH_SMS_DAILY_LIMIT: { status: 429, message: 'Codes by SMS are paused for a while. Please get your code in Telegram.' },
  AUTH_CAPTCHA_REQUIRED: { status: 400, message: 'Please confirm that you are not a robot.' },
  AUTH_CAPTCHA_INVALID: { status: 400, message: 'The check did not pass. Please try again.' },
  AUTH_PHONE_INVALID: { status: 400, message: 'Please enter a valid phone number, e.g. +7 701 123 45 67.' },
  AUTH_PHONE_TAKEN: { status: 409, message: 'An account with this phone number already exists.' },
  AUTH_EMAIL_TAKEN: { status: 409, message: 'An account with this email already exists.' },
  AUTH_REGISTRATION_TOKEN_INVALID: { status: 400, message: 'Your verification has expired. Please verify your phone again.' },
  AUTH_TERMS_REQUIRED: { status: 400, message: 'Please accept the Talk Club terms to continue.' },
  AUTH_PASSWORD_WEAK: { status: 400, message: 'Password must be at least 8 characters and include a letter and a number.' },
  AUTH_PASSWORD_NOT_SET: { status: 400, message: 'This account has no password yet. Sign in with a phone code instead.' },
  CLIENT_PROFILE_REQUIRED: { status: 403, message: 'This action is available for Talk Club members only.' },

  // Booking
  BOOKING_NO_ACTIVE_MEMBERSHIP: { status: 409, message: "You don't have an active membership for this session." },
  BOOKING_NO_VISITS_LEFT: { status: 409, message: 'Your membership has no remaining visits.' },
  BOOKING_MEMBERSHIP_EXPIRES_BEFORE_SESSION: { status: 409, message: 'Your membership expires before this session.' },
  BOOKING_PLAN_NOT_VALID_FOR_SESSION: { status: 409, message: 'Your membership cannot be used for this type of session.' },
  BOOKING_SESSION_FULL: { status: 409, message: 'This session is full. You can join the waitlist.' },
  BOOKING_SESSION_CANCELLED: { status: 409, message: 'This session has been cancelled.' },
  BOOKING_SESSION_STARTED: { status: 409, message: 'This session has already started.' },
  BOOKING_CLOSED: { status: 409, message: 'Booking for this session is closed.' },
  BOOKING_NOT_OPEN_YET: { status: 409, message: 'Booking for this session is not open yet.' },
  BOOKING_ALREADY_BOOKED: { status: 409, message: 'You are already booked for this session.' },
  BOOKING_OVERLAP: { status: 409, message: 'You already have a session booked at this time.' },
  BOOKING_LEVEL_MISMATCH: { status: 409, message: "This session doesn't match your English level." },
  BOOKING_CATEGORY_NOT_ALLOWED: { status: 409, message: 'This group is not available for your profile.' },
  BOOKING_TRIALS_DISABLED: { status: 409, message: 'Trial sessions are not available right now.' },
  BOOKING_TRIAL_NOT_ALLOWED: { status: 409, message: 'Trial participants cannot join this session.' },
  BOOKING_TRIAL_ALREADY_USED: { status: 409, message: 'You have already used your trial session.' },
  BOOKING_NOT_CANCELLABLE: { status: 409, message: 'This booking can no longer be cancelled.' },
  BOOKING_LATE_CANCELLATION_CONFIRMATION_REQUIRED: {
    status: 409,
    message: 'The cancellation deadline has passed. Please confirm that the visit will not be returned.',
  },
  BOOKING_OFFER_RESERVED: { status: 409, message: 'The last seat is reserved for someone on the waitlist.' },

  // Waitlist
  WAITLIST_DISABLED: { status: 409, message: 'The waitlist is not available.' },
  WAITLIST_SESSION_NOT_FULL: { status: 409, message: 'This session still has free seats — you can book it directly.' },
  WAITLIST_ALREADY_JOINED: { status: 409, message: 'You are already on the waitlist for this session.' },
  WAITLIST_OFFER_EXPIRED: { status: 409, message: 'This offer has expired.' },
  WAITLIST_NO_OFFER: { status: 409, message: 'There is no reserved place for you in this session.' },

  // Sessions / schedule
  SESSION_INVALID_TIME: { status: 400, message: 'The session end time must be after the start time.' },
  SESSION_ROOM_CONFLICT: { status: 409, message: 'The room is already booked for another session at this time.' },
  SESSION_TEACHER_CONFLICT: { status: 409, message: 'The teacher already has another session at this time.' },
  SESSION_CAPACITY_BELOW_BOOKED: { status: 409, message: 'Capacity cannot be lower than the number of booked clients.' },
  SESSION_ALREADY_CANCELLED: { status: 409, message: 'This session is already cancelled.' },
  SESSION_IN_PAST: { status: 409, message: 'This session has already finished.' },

  // Memberships
  MEMBERSHIP_NOT_ACTIVE: { status: 409, message: 'This membership is not active.' },
  MEMBERSHIP_BALANCE_NEGATIVE: { status: 409, message: 'The visit balance cannot go below zero.' },
  MEMBERSHIP_PLAN_UNAVAILABLE: { status: 409, message: 'This membership is not available for purchase.' },

  // Payments
  PAYMENT_INVALID_STATE: { status: 409, message: 'This payment cannot be changed in its current state.' },
  PAYMENT_METHOD_UNAVAILABLE: { status: 409, message: 'This payment method is not available.' },
  PAYMENT_REFUND_EXCEEDS: { status: 400, message: 'The refund amount exceeds the paid amount.' },
  PAYMENT_PROVIDER_ERROR: { status: 502, message: 'The payment provider is not responding. Please try again later.' },
  PAYMENT_WEBHOOK_INVALID: { status: 400, message: 'Invalid payment notification.' },
  PAYMENT_ALREADY_PENDING: { status: 409, message: 'You already have a pending payment for this membership.' },

  // Attendance / check-in
  ATTENDANCE_NOT_YOUR_SESSION: { status: 403, message: 'You can only manage attendance for your own sessions.' },
  ATTENDANCE_WINDOW_CLOSED: { status: 409, message: 'Attendance for this session can no longer be changed here.' },
  ATTENDANCE_BOOKING_CANCELLED: { status: 409, message: 'This booking was cancelled.' },
  CHECKIN_DISABLED: { status: 409, message: 'QR check-in is turned off.' },
  CHECKIN_TOKEN_INVALID: { status: 400, message: 'This QR code is invalid or has expired. Ask the client to refresh it.' },
  CHECKIN_NO_BOOKING: { status: 404, message: 'This client has no booking for a current session.' },

  // Feedback
  FEEDBACK_DISABLED: { status: 409, message: 'Teacher feedback is turned off.' },

  // Trials / CRM
  TRIAL_INVALID_STATE: { status: 409, message: 'This trial cannot be changed in its current state.' },

  // Content / settings
  SETTINGS_INVALID: { status: 400, message: 'Some settings values are invalid.' },
  IMPORT_INVALID_FILE: { status: 400, message: 'The file could not be read. Please upload a valid CSV file.' },
  FILE_TOO_LARGE: { status: 413, message: 'The file is too large.' },
  FILE_TYPE_NOT_ALLOWED: { status: 415, message: 'This file type is not allowed.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;
