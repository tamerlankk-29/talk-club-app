# Integrations

Every external service sits behind an interface with a working development
implementation, so the platform runs fully without contracts or credentials, and
connecting a real provider never touches business logic.

| Area | Interface | Included implementations | Selected by |
| --- | --- | --- | --- |
| Payments | `PaymentProvider` (`apps/api/src/modules/payments/providers`) | `manual` (Kaspi invoice, cash, card at the desk, bank transfer), `mock_online` (test checkout, dev only), `kaspi` (skeleton) | Payment method's `provider` (Admin → Settings → Payment methods) |
| Messaging | `ChannelProvider` (`apps/api/src/modules/messaging`) | `web-push` (VAPID), `console` for SMS / WhatsApp / Telegram / email | `NOTIFY_SMS_PROVIDER`, `NOTIFY_WHATSAPP_PROVIDER`, `NOTIFY_TELEGRAM_PROVIDER`, `NOTIFY_EMAIL_PROVIDER` |
| File storage | `StorageProvider` (`apps/api/src/modules/files/storage.ts`) | `LocalDiskStorage` | `STORAGE_LOCAL_DIR` (an S3 adapter adds a `STORAGE_DRIVER` option) |
| Data migration | CSV/XLSX importers (`apps/api/src/modules/data-transfer`) | Clients, Altegio clients / visits / payments | Admin → Import & export |

Admin → Settings → Notifications shows which channel providers are configured (secrets are never displayed).

## Payments

### Current Kaspi workflow (manual, works today)

1. Staff create a **payment request** for the client (Admin → client → Payment request, or Admin → Payments), or the client chooses "Kaspi invoice" when buying in the app.
2. The client receives a notification with the instructions; the admin sends the Kaspi invoice from the Kaspi business app as usual.
3. When Kaspi shows it paid, staff press **Confirm payment** and enter the Kaspi reference. The membership activates immediately; the client gets a confirmation.
4. Unpaid requests stay visible on the dashboard ("pending payments") and can be cancelled.

### Connecting automatic Kaspi Pay (or another acquirer)

`KaspiPaymentProvider` is the integration point:

1. Set `KASPI_MERCHANT_ID`, `KASPI_API_KEY` and `PAYMENT_WEBHOOK_SECRET`.
2. Implement `initiate()` — create the invoice/payment link with the provider and return `checkoutUrl` and `providerPaymentId`.
3. Implement `parseWebhook()` — verify the signature, then return `{ providerPaymentId, status: 'PAID' | 'FAILED', amount }`. The provider calls `POST /api/payments/webhooks/kaspi`.
4. Optionally implement `refund()`.
5. In Admin → Settings → Payment methods, switch the KASPI method's provider to `kaspi` and allow it in the app.

Confirmation through a webhook is idempotent (a repeated callback for a paid payment is ignored) and runs the same activation code as a manual confirmation. Other providers (bank acquiring, Halyk, Freedom Pay…) follow the same steps with their own provider class registered in `PaymentProviderRegistry`.

The `mock_online` provider redirects to `/payments/:id/checkout` where "Pay" simulates the provider callback. It is refused at startup when `NODE_ENV` is production/staging.

## Notifications and messaging

The notification engine renders a **template** (Admin → Notifications; `{{placeholders}}`,
up to two buttons), stores an in-app notification, and creates one **delivery** per
channel. Deliveries are sent by the dispatcher every minute with retries and are visible in
the delivery log. Rules:

- Transactional messages are always sent; reminders respect the client's preference; marketing respects marketing consent and the channel toggles in the client's profile.
- **SMS is a fallback**: used only when the client has no push-enabled device (saves money).
- Expired push subscriptions reported by the push service are removed automatically.

### Web Push (included)

1. Generate VAPID keys: `npx web-push generate-vapid-keys`.
2. Set `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT` (a `mailto:` or `https:` contact).
3. Clients enable notifications in the app (Profile → Notifications). On iPhone, web push works when Talk Club is added to the Home Screen (iOS 16.4+); the app explains this to iOS users.

The service worker (`apps/web/public/sw.js`) shows the notification and opens the linked page on tap.

### Adding WhatsApp, Telegram, SMS or email

1. Create a class implementing `ChannelProvider`:

   ```ts
   export class WhatsAppCloudProvider implements ChannelProvider {
     readonly channel = 'WHATSAPP';
     readonly name = 'whatsapp_cloud';
     constructor(private readonly token: string, private readonly phoneNumberId: string) {}
     isConfigured() { return !!this.token; }
     async send(message: OutboundMessage): Promise<ChannelSendResult> {
       // call the provider API with message.to.phone, message.title, message.body, message.url
       return { status: 'SENT', provider: this.name, providerMessageId: '…' };
     }
   }
   ```

2. Register it in `ChannelRegistry.create()` under a name, e.g. `whatsapp_cloud`.
3. Set `NOTIFY_WHATSAPP_PROVIDER=whatsapp_cloud` and the provider's credentials (`WHATSAPP_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SMS_API_KEY`, SMTP settings…).
4. Enable the channel on the templates that should use it (Admin → Notifications).

Suggested providers for Kazakhstan: WhatsApp Business Cloud API (or a BSP such as Wazzup/Twilio), a Telegram bot, an SMS gateway such as Mobizon or SMSC.kz, and any SMTP/transactional email service.

Until a provider is configured, the `console` provider logs messages and records them in an
in-memory outbox (`GET /api/admin/notifications/outbox`, development aid), so the flows can
be tested end to end.

## File storage

Profile photos, teacher photos, marketing images and documents are uploaded through
`POST /api/files?purpose=avatar|teacher|marketing|document` (type sniffing, size limits) and
served from `/api/files/:id`. `LocalDiskStorage` writes under `STORAGE_LOCAL_DIR` — mount it as
a persistent volume in production. For object storage (S3, Cloudflare R2, Yandex Object
Storage, MinIO), implement the three-method `StorageProvider` (`put`, `get`, `delete`) with the
S3 SDK, add a `STORAGE_DRIVER` value for it in `src/config/app-config.ts`, and construct it in
the files module instead of `LocalDiskStorage` when that driver is selected.

## Importing from Altegio (and spreadsheets)

Admin → Import & export → Import accepts CSV (UTF-8, comma or semicolon) or XLSX:

| Kind | What it creates |
| --- | --- |
| Clients (CSV/XLSX) | Client profiles — matched by phone (then email), so re-importing updates instead of duplicating |
| Altegio — clients | Client profiles plus a note with their Altegio visit count and spend |
| Altegio — visits | Past sessions, bookings and attendance (history only — memberships are untouched) |
| Altegio — payments | Historical payment records |

Column names are matched flexibly in English or Russian (e.g. `Phone` / `Телефон`,
`First name` / `Имя`, `Дата визита`, `Сотрудник`, `Сумма`, `Способ оплаты`). Dates in
`yyyy-MM-dd`, `dd.MM.yyyy` (optionally with time) are understood. Always run a **dry run**
first: it reports created / updated / skipped rows and errors without saving.

## Exports

CSV or XLSX exports of clients, bookings, attendance, memberships, leads, payments and revenue
(the last two need `finance.view`), optionally for a date range. Every export is written to the
audit log.
