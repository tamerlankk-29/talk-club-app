import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const PURPOSES = {
  avatar: { permissions: null, types: ['image/png', 'image/jpeg', 'image/webp'] },
  teacher: { permissions: ['teachers.manage'], types: ['image/png', 'image/jpeg', 'image/webp'] },
  marketing: { permissions: ['broadcasts.manage', 'announcements.manage', 'settings.manage'], types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
  document: { permissions: ['settings.manage'], types: ['application/pdf', 'image/png', 'image/jpeg'] },
} as const;

export class UploadQueryDto {
  @ApiPropertyOptional({ enum: Object.keys(PURPOSES) })
  @IsOptional()
  @IsIn(Object.keys(PURPOSES))
  purpose?: keyof typeof PURPOSES;
}

export class UploadedFileDto {
  id: string;
  url: string;
  mimeType: string;
  size: number;
}
