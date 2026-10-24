export class ChannelStatusDto {
  channel: string;
  provider: string;
  configured: boolean;
}

export class IntegrationsDto {
  channels: ChannelStatusDto[];
}
