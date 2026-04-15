import { Module } from '@nestjs/common';
import { WellnessController } from './wellness.controller';
import { WellnessService } from './wellness.service';
import { WellnessStorageService } from './wellness-storage.service';
import { StravaService } from './strava.service';

@Module({
  controllers: [WellnessController],
  providers: [WellnessService, WellnessStorageService, StravaService],
  exports: [WellnessService, WellnessStorageService, StravaService],
})
export class WellnessModule {}