import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class LoginService {
  constructor(
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    // Mock user validation - replace with actual database lookup
    const user = { username: loginDto.username, userId: 1 };
    
    const payload = { username: user.username, sub: user.userId };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}