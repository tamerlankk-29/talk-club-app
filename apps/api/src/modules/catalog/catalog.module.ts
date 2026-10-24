import { Global, Module } from '@nestjs/common';
import { AdminCatalogController, PublicCatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Global()
@Module({
  controllers: [PublicCatalogController, AdminCatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
