import { Module } from '@nestjs/common';
import { WellnessModule } from './modules/wellness/wellness.module';

@Module({
  imports: [WellnessModule],
})
export class AppModule {}