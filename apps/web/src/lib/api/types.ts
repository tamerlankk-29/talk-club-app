import type { components } from './schema';

/** Shorthand for a schema type generated from the API's OpenAPI document. */
export type S<K extends keyof components['schemas']> = components['schemas'][K];

export type SessionUser = S<'SessionUserDto'>;
export type AuthTokens = S<'AuthTokensDto'>;
export type ClientSession = S<'ClientSessionDto'>;
export type Session = S<'SessionDto'>;
export type SessionAdmin = S<'SessionAdminDto'>;
export type Booking = S<'BookingDto'>;
export type BookingConfirmation = S<'BookingConfirmationDto'>;
export type Membership = S<'MembershipDto'>;
export type MembershipDetail = S<'MembershipDetailDto'>;
export type MembershipPlan = S<'MembershipPlanDto'>;
export type Payment = S<'PaymentDto'>;
export type AdminPayment = S<'AdminPaymentDto'>;
export type PaymentMethod = S<'PaymentMethodDto'>;
export type NotificationItem = S<'NotificationItemDto'>;
export type Teacher = S<'TeacherPublicDto'>;
export type TeacherAdmin = S<'TeacherAdminDto'>;
export type ClientProfile = S<'ClientProfileDto'>;
export type Home = S<'HomeDto'>;
export type PublicClub = S<'PublicClubDto'>;
export type Level = S<'LevelDto'>;
export type BookingStatus = S<'BookingStatus'>;
export type SessionDisplayStatus = S<'SessionDisplayStatus'>;
