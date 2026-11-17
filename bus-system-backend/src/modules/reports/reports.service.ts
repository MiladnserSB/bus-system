import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { BookingStatus, Role, TripStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  addDaysToDateString,
  damascusDateAndTimeToUtc,
  formatDamascusDate,
} from '../../common/helpers/damascus-time.helper.js';
import { QueryReportDto } from './dto/report.dto.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();
    const todayStr = formatDamascusDate(now);
    const todayStart = damascusDateAndTimeToUtc(todayStr, '00:00');
    const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);
    const weekStartStr = addDaysToDateString(todayStr, -6);
    const weekStart = damascusDateAndTimeToUtc(weekStartStr, '00:00');

    const [
      todayBookingsCount,
      activeTripsCount,
      weeklySeats,
      activeTrips,
    ] = await Promise.all([
      this.prisma.booking.count({
        where: {
          status: BookingStatus.CONFIRMED,
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.trip.count({
        where: {
          status: {
            in: [
              TripStatus.OPEN,
              TripStatus.FULL,
              TripStatus.CLOSED,
              TripStatus.DEPARTED,
            ],
          },
        },
      }),
      this.prisma.bookingSeat.findMany({
        where: {
          isActive: true,
          booking: {
            status: BookingStatus.CONFIRMED,
            createdAt: { gte: weekStart, lte: todayEnd },
          },
        },
        select: { unitPrice: true },
      }),
      this.prisma.trip.findMany({
        where: {
          status: {
            in: [
              TripStatus.OPEN,
              TripStatus.FULL,
              TripStatus.CLOSED,
              TripStatus.DEPARTED,
            ],
          },
        },
        include: {
          busType: { select: { totalSeats: true } },
          _count: { select: { bookingSeats: { where: { isActive: true } } } },
        },
      }),
    ]);

    const weeklyRevenue = weeklySeats.reduce(
      (sum, s) => sum + Number(s.unitPrice),
      0,
    );

    const totalCapacity = activeTrips.reduce(
      (sum, t) => sum + t.busType.totalSeats,
      0,
    );
    const totalBooked = activeTrips.reduce(
      (sum, t) => sum + t._count.bookingSeats,
      0,
    );
    const occupancyRatePercent =
      totalCapacity > 0
        ? Number(((totalBooked / totalCapacity) * 100).toFixed(2))
        : 0;

    return {
      todayBookingsCount,
      occupancyRatePercent,
      weeklyRevenue,
      activeTripsCount,
      totalCapacity,
      totalBookedSeats: totalBooked,
    };
  }

  async getOccupancyReport(query: QueryReportDto) {
    const { startUtc, endUtc } = this.resolveRange(query);

    const trips = await this.prisma.trip.findMany({
      where: {
        status: { not: TripStatus.CANCELLED },
        ...(startUtc || endUtc
          ? {
              departAt: {
                ...(startUtc ? { gte: startUtc } : {}),
                ...(endUtc ? { lte: endUtc } : {}),
              },
            }
          : {}),
      },
      include: {
        origin: true,
        destination: true,
        busType: { select: { totalSeats: true } },
        _count: { select: { bookingSeats: { where: { isActive: true } } } },
      },
    });

    const routeMap = new Map<
      string,
      {
        originId: number;
        destinationId: number;
        route: string;
        tripsCount: number;
        totalCapacity: number;
        bookedSeats: number;
      }
    >();

    for (const trip of trips) {
      const key = `${trip.originId}-${trip.destinationId}`;
      const existing = routeMap.get(key) ?? {
        originId: trip.originId,
        destinationId: trip.destinationId,
        route: `${trip.origin.nameAr} ← ${trip.destination.nameAr}`,
        tripsCount: 0,
        totalCapacity: 0,
        bookedSeats: 0,
      };
      existing.tripsCount += 1;
      existing.totalCapacity += trip.busType.totalSeats;
      existing.bookedSeats += trip._count.bookingSeats;
      routeMap.set(key, existing);
    }

    const items = Array.from(routeMap.values()).map((r) => ({
      ...r,
      occupancyPercent:
        r.totalCapacity > 0
          ? Number(((r.bookedSeats / r.totalCapacity) * 100).toFixed(2))
          : 0,
    }));

    return { items };
  }

  async getRevenueReport(query: QueryReportDto) {
    const { startUtc, endUtc } = this.resolveRange(query);

    // Strictly confirmed, non-cancelled active seats only (REQ-RPT-09)
    const activeSeats = await this.prisma.bookingSeat.findMany({
      where: {
        isActive: true,
        status: BookingStatus.CONFIRMED,
        booking: {
          status: BookingStatus.CONFIRMED,
          ...(startUtc || endUtc
            ? {
                createdAt: {
                  ...(startUtc ? { gte: startUtc } : {}),
                  ...(endUtc ? { lte: endUtc } : {}),
                },
              }
            : {}),
        },
      },
      include: {
        trip: {
          include: {
            origin: true,
            destination: true,
            busType: true,
          },
        },
      },
    });

    const grouped = new Map<
      string,
      {
        route: string;
        busType: string;
        seatsSold: number;
        bookingIds: Set<number>;
        revenue: number;
      }
    >();

    let grandTotalRevenue = 0;
    for (const seat of activeSeats) {
      const price = Number(seat.unitPrice);
      grandTotalRevenue += price;
      const route = `${seat.trip.origin.nameAr} ← ${seat.trip.destination.nameAr}`;
      const busType = seat.trip.busType.nameAr;
      const key = `${seat.trip.originId}-${seat.trip.destinationId}-${seat.trip.busTypeId}`;
      const entry = grouped.get(key) ?? {
        route,
        busType,
        seatsSold: 0,
        bookingIds: new Set<number>(),
        revenue: 0,
      };
      entry.seatsSold += 1;
      entry.bookingIds.add(seat.bookingId);
      entry.revenue += price;
      grouped.set(key, entry);
    }

    const items = Array.from(grouped.values()).map((g) => ({
      route: g.route,
      busType: g.busType,
      bookingsCount: g.bookingIds.size,
      seatsSold: g.seatsSold,
      revenue: g.revenue,
    }));

    return {
      totalRevenue: grandTotalRevenue,
      totalSeatsSold: activeSeats.length,
      items,
    };
  }

  async getTopRoutesReport(query: QueryReportDto) {
    const rev = await this.getRevenueReport(query);
    const byRoute = new Map<
      string,
      { route: string; bookingsCount: number; seatsSold: number; revenue: number }
    >();

    for (const row of rev.items) {
      const existing = byRoute.get(row.route) ?? {
        route: row.route,
        bookingsCount: 0,
        seatsSold: 0,
        revenue: 0,
      };
      existing.bookingsCount += row.bookingsCount;
      existing.seatsSold += row.seatsSold;
      existing.revenue += row.revenue;
      byRoute.set(row.route, existing);
    }

    const items = Array.from(byRoute.values()).sort(
      (a, b) => b.seatsSold - a.seatsSold,
    );
    return { items };
  }

  async getStaffReport(query: QueryReportDto) {
    const { startUtc, endUtc } = this.resolveRange(query);

    const staffUsers = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.RECEPTIONIST] } },
      select: { id: true, name: true, username: true, role: true },
    });

    const dateFilter =
      startUtc || endUtc
        ? {
            ...(startUtc ? { gte: startUtc } : {}),
            ...(endUtc ? { lte: endUtc } : {}),
          }
        : undefined;

    const items = await Promise.all(
      staffUsers.map(async (staff) => {
        const [bookingsCreated, cancellationsProcessed] = await Promise.all([
          this.prisma.booking.count({
            where: {
              createdById: staff.id,
              ...(dateFilter ? { createdAt: dateFilter } : {}),
            },
          }),
          this.prisma.booking.count({
            where: {
              cancelledById: staff.id,
              status: BookingStatus.CANCELLED,
              ...(dateFilter ? { cancelledAt: dateFilter } : {}),
            },
          }),
        ]);

        return {
          userId: staff.id,
          name: staff.name,
          username: staff.username,
          role: staff.role,
          bookingsCreated,
          cancellationsProcessed,
        };
      }),
    );

    return { items };
  }

  toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) {
      return '\uFEFF';
    }
    const headers = Object.keys(rows[0]);
    const escapeCell = (val: unknown) => {
      let str = '';
      if (val !== null && val !== undefined) {
        str =
          typeof val === 'object' ? JSON.stringify(val) : String(val as string | number | boolean);
      }
      return `"${str.replace(/"/g, '""')}"`;
    };
    const lines = [
      headers.map(escapeCell).join(','),
      ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(',')),
    ];
    return `\uFEFF${lines.join('\r\n')}`;
  }

  async toPdf(
    title: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text(title, { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Generated at: ${new Date().toISOString()}`);
      doc.moveDown();

      if (rows.length === 0) {
        doc.fontSize(11).text('No records found.');
      } else {
        for (const row of rows) {
          doc.fontSize(10).text(JSON.stringify(row));
          doc.moveDown(0.3);
        }
      }

      doc.end();
    });
  }

  private resolveRange(query: QueryReportDto): {
    startUtc?: Date;
    endUtc?: Date;
  } {
    const startUtc = query.from
      ? damascusDateAndTimeToUtc(query.from, '00:00')
      : undefined;
    const endUtc = query.to
      ? new Date(damascusDateAndTimeToUtc(query.to, '00:00').getTime() + 86_400_000 - 1)
      : undefined;
    return { startUtc, endUtc };
  }
}
