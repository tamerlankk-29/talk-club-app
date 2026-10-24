import { ApiOperation, ApiTags } from '@nestjs/swagger';

export class HealthDto {
  status: 'ok' | 'degraded';
  database: 'ok' | 'error';
  time: Date;
}
