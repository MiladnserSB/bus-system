import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTicketQrDto {
  @ApiProperty({
    description: 'نص الحمولة المقروء من رمز QR (JSON)',
  })
  @IsString()
  @IsNotEmpty()
  qrPayload: string;
}
