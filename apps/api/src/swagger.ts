import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ERROR_CATALOG } from './common/errors/error-codes';
import { DEFAULT_ROLES, PERMISSIONS } from './modules/rbac/permissions';

const DESCRIPTION = `
REST API of the Talk Club platform — the same API serves the web PWA, the admin and teacher
panels, and future native iOS/Android apps.

## Authentication
* **Clients** sign in with a phone number + SMS code (\`POST /auth/otp/request\` → \`POST /auth/otp/verify\`).
  New numbers receive a \`registrationToken\` for \`POST /auth/register\`. Email/phone + password
  (\`POST /auth/login\`) works for clients who set a password and for staff.
* Send the access token as \`Authorization: Bearer <token>\` (valid ${15} minutes by default).
* **Web**: the refresh token lives in an httpOnly, SameSite=Strict cookie scoped to \`/api/auth\`.
  **Native apps** send \`X-Client-Platform: native\` and receive/send \`refreshToken\` in the body.
* Parents act for a child profile by sending \`X-Acting-Client: <clientId>\` on client endpoints.

## Errors
Every error has the same envelope: \`{ "error": { "code", "message", "details?", "requestId" } }\`.
\`message\` is safe to show to end users. Codes:

| Code | HTTP | Meaning |
|---|---|---|
${Object.entries(ERROR_CATALOG)
  .map(([code, e]) => `| \`${code}\` | ${e.status} | ${e.message} |`)
  .join('\n')}

## Permissions
Admin endpoints list their required permissions in the 403 response description.
Default roles (editable in Admin → Roles):

${Object.entries(DEFAULT_ROLES)
  .map(([key, role]) => `* **${key}** — ${role.description}`)
  .join('\n')}

| Permission | Group | Description |
|---|---|---|
${Object.entries(PERMISSIONS)
  .map(([key, p]) => `| \`${key}\` | ${p.group} | ${p.description} |`)
  .join('\n')}
`;

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Talk Club API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function setupSwagger(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'Talk Club API',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
  });
}
