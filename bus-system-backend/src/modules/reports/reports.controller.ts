import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { QueryReportDto, ReportExportFormat } from './dto/report.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Reports')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'مؤشرات لوحة الإدارة (للمدير فقط)' })
  getDashboard() {
    return this.reportsService.getDashboard();
  }

  @Get('occupancy')
  @ApiOperation({ summary: 'تقرير الإشغال حسب الخط والفترة (JSON/CSV/PDF)' })
  async getOccupancy(
    @Query() query: QueryReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.reportsService.getOccupancyReport(query);
    return this.respondWithFormat(
      res,
      query.format,
      'occupancy-report',
      'Occupancy Report',
      data.items,
      data,
    );
  }

  @Get('revenue')
  @ApiOperation({
    summary: 'تقرير الإيرادات من الحجوزات المؤكدة غير الملغاة (JSON/CSV/PDF)',
  })
  async getRevenue(
    @Query() query: QueryReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.reportsService.getRevenueReport(query);
    return this.respondWithFormat(
      res,
      query.format,
      'revenue-report',
      'Revenue Report',
      data.items,
      data,
    );
  }

  @Get('top-routes')
  @ApiOperation({ summary: 'تقرير أكثر الوجهات طلباً (JSON/CSV/PDF)' })
  async getTopRoutes(
    @Query() query: QueryReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.reportsService.getTopRoutesReport(query);
    return this.respondWithFormat(
      res,
      query.format,
      'top-routes-report',
      'Top Routes Report',
      data.items,
      data,
    );
  }

  @Get('staff')
  @ApiOperation({ summary: 'تقرير الحجوزات والإلغاءات لكل موظف (JSON/CSV/PDF)' })
  async getStaff(
    @Query() query: QueryReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.reportsService.getStaffReport(query);
    return this.respondWithFormat(
      res,
      query.format,
      'staff-report',
      'Staff Activity Report',
      data.items,
      data,
    );
  }

  private async respondWithFormat(
    res: Response,
    format: ReportExportFormat | undefined,
    filename: string,
    pdfTitle: string,
    rows: Array<Record<string, unknown>>,
    jsonPayload: unknown,
  ) {
    if (format === ReportExportFormat.CSV) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.csv"`,
      );
      return this.reportsService.toCsv(rows);
    }

    if (format === ReportExportFormat.PDF) {
      const pdf = await this.reportsService.toPdf(pdfTitle, rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.pdf"`,
      );
      res.send(pdf);
      return;
    }

    return jsonPayload;
  }
}
