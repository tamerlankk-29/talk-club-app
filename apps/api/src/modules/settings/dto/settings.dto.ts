import { ClubContentDto } from '../../public/public.dto';

export class LocalizedContentDto {
  content: ClubContentDto;
  /** True when an administrator wrote these texts for this language; false for the built-in translation. */
  customized: boolean;
}

export class ChannelStatusDto {
  channel: string;
  provider: string;
  configured: boolean;
}

export class IntegrationsDto {
  channels: ChannelStatusDto[];
}
