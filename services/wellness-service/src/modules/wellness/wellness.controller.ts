import { Body, Controller, Get, Post } from '@nestjs/common';
import { CoachRequestDto } from './dto/coach-request.dto';
import { WellnessService } from './wellness.service';

@Controller('wellness')
export class WellnessController {
  constructor(private readonly wellnessService: WellnessService) {}

  @Get('defaults')
  getDefaults() {
    return this.wellnessService.getDefaults();
  }

  @Post('coach')
  coach(@Body() coachRequest: CoachRequestDto) {
    return this.wellnessService.buildCoachResponse(coachRequest);
  }
}