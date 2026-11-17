import { IsEnum, IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ReportExportFormat {
  JSON = 'json',
  CSV = 'csv',
  PDF = 'pdf',
}

export class QueryReportDto {
  @ApiPropertyOptional({
    description: 'تاريخ البداية بتوقيت دمشق YYYY-MM-DD',
    example: '2026-11-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD',
  })
  from?: string;

  @ApiPropertyOptional({
    description: 'تاريخ النهاية بتوقيت دمشق YYYY-MM-DD',
    example: '2026-11-30',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD',
  })
  to?: string;

  @ApiPropertyOptional({
    enum: ReportExportFormat,
    default: ReportExportFormat.JSON,
  })
  @IsOptional()
  @IsEnum(ReportExportFormat)
  format?: ReportExportFormat = ReportExportFormat.JSON;
}
