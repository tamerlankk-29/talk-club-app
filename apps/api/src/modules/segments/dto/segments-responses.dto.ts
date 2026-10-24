import { ApiProperty } from '@nestjs/swagger';

export class SegmentFieldDto {
  field: string;
  label: string;
  ops: string[];
  /** boolean | number | enum:A,B | enum[]:A,B | level[] | teacher[] | tag[] | source[] | stage[] */
  valueType: string;
}

export class SegmentDefinitionDto {
  @ApiProperty({ enum: ['all', 'any'] })
  match: 'all' | 'any';
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  rules: Array<Record<string, unknown>>;
}

export class SegmentDto {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  definition: SegmentDefinitionDto;
  isSystem: boolean;
  clientCount: number;
  updatedAt: Date;
}

export class SegmentPreviewClientDto {
  id: string;
  name: string;
  phone: string | null;
  category: string;
  lastVisitAt: Date | null;
}

export class SegmentPreviewDto {
  count: number;
  sample: SegmentPreviewClientDto[];
}
