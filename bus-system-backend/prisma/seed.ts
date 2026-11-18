import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  BookingChannel,
  BookingStatus,
  DeliveryStatus,
  NotificationChannel,
  NotificationType,
  PaymentMethod,
  PrismaClient,
  RecurrenceType,
  Role,
  TripStatus,
} from '../src/generated/prisma/client.js';
import {
  addDaysToDateString,
  damascusDateAndTimeToUtc,
  dateOnlyToUtcMidnight,
  formatDamascusDate,
} from '../src/common/helpers/damascus-time.helper.js';
import {
  generateSeatTemplates,
  PRESET_BUS_TYPES,
} from '../src/common/helpers/seat-layout.helper.js';

const envPath = resolve(import.meta.dirname, '..', '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export const DEFAULT_SETTINGS: ReadonlyArray<{
  key: string;
  value: string;
  description: string;
}> = [
  {
    key: 'cancellation_deadline_hours',
    value: '3',
    description: 'مهلة إلغاء الحجز قبل الانطلاق بالساعات (REQ-SET-01)',
  },
  {
    key: 'booking_cutoff_minutes',
    value: '60',
    description: 'إغلاق الحجز قبل الانطلاق بالدقائق (REQ-SET-02)',
  },
  {
    key: 'max_seats_per_booking',
    value: '6',
    description: 'الحد الأقصى للمقاعد في الحجز الواحد (REQ-SET-03)',
  },
  {
    key: 'seat_hold_ttl_minutes',
    value: '5',
    description: 'مدة القفل المؤقت للمقعد بالدقائق (REQ-SET-04)',
  },
  {
    key: 'template_generate_ahead_days',
    value: '30',
    description: 'مدة التوليد المسبق للرحلات المجدولة بالأيام (REQ-SET-05)',
  },
  {
    key: 'trip_auto_complete_hours',
    value: '12',
    description: 'المدة بعد الانطلاق لتحويل الرحلة إلى منتهية تلقائياً (TBD-12)',
  },
  {
    key: 'reminder_hours_before',
    value: '24,3',
    description: 'مدد التذكير قبل الرحلة بالساعات مفصولة بفاصلة (REQ-NOTF-02)',
  },
];

export const INITIAL_CITIES: ReadonlyArray<{
  nameAr: string;
  nameEn: string;
}> = [
  { nameAr: 'دمشق', nameEn: 'Damascus' },
  { nameAr: 'حلب', nameEn: 'Aleppo' },
  { nameAr: 'حمص', nameEn: 'Homs' },
  { nameAr: 'حماة', nameEn: 'Hama' },
  { nameAr: 'اللاذقية', nameEn: 'Latakia' },
  { nameAr: 'طرطوس', nameEn: 'Tartus' },
  { nameAr: 'درعا', nameEn: 'Daraa' },
  { nameAr: 'السويداء', nameEn: 'As-Suwayda' },
];

export async function runSeed(prisma: PrismaClient): Promise<void> {
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
      },
    });
  }

  for (const city of INITIAL_CITIES) {
    await prisma.city.upsert({
      where: { nameAr: city.nameAr },
      update: {},
      create: {
        nameAr: city.nameAr,
        nameEn: city.nameEn,
        isActive: true,
      },
    });
  }

  for (const preset of PRESET_BUS_TYPES) {
    const seats = generateSeatTemplates({
      category: preset.category,
      layout: preset.layout,
      rowsCount: preset.rowsCount,
      hasExtraBackSeat: preset.hasExtraBackSeat,
      expectedTotalSeats: preset.totalSeats,
    });

    const busType = await prisma.busType.upsert({
      where: { code: preset.code },
      update: {},
      create: {
        code: preset.code,
        nameAr: preset.nameAr,
        nameEn: preset.nameEn,
        category: preset.category,
        size: preset.size,
        layout: preset.layout,
        rowsCount: preset.rowsCount,
        hasExtraBackSeat: preset.hasExtraBackSeat,
        totalSeats: preset.totalSeats,
        isActive: true,
      },
    });

    const existingCount = await prisma.seatTemplate.count({
      where: { busTypeId: busType.id },
    });

    if (existingCount === 0) {
      await prisma.seatTemplate.createMany({
        data: seats.map((s) => ({
          busTypeId: busType.id,
          seatNumber: s.seatNumber,
          rowNumber: s.rowNumber,
          colLetter: s.colLetter,
          side: s.side,
          colIndex: s.colIndex,
          isExtra: s.isExtra,
        })),
      });
    }
  }

  const adminUsername = process.env.ADMIN_SEED_USERNAME ?? 'admin';
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@masar-bus.sy';
  const adminPhone = process.env.ADMIN_SEED_PHONE ?? '+963900000001';
  const adminName = process.env.ADMIN_SEED_NAME ?? 'المدير العام';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'Admin@123456';

  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { username: adminUsername },
        { email: adminEmail },
        { phone: adminPhone },
      ],
    },
  });

  if (!existingAdmin) {
    const passwordHash = await argon2.hash(adminPassword);
    await prisma.user.create({
      data: {
        name: adminName,
        username: adminUsername,
        email: adminEmail,
        phone: adminPhone,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        mustChangePassword: false,
      },
    });
  }
}

/**
 * Populates realistic Syrian Arabic operational data (receptionists, customers,
 * buses, recurring templates, upcoming & completed trips, bookings with passengers,
 * notifications, and audit logs) idempotently for live Web & Mobile exploration.
 */
export async function runDemoSeed(prisma: PrismaClient): Promise<void> {
  const adminUser = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
    orderBy: { id: 'asc' },
  });

  // 1. Staff Receptionists + Customer Accounts
  const staffDemoPasswordHash = await argon2.hash('Reception@123');
  const receptionistDefs = [
    {
      name: 'خالد الحمصي',
      username: 'khaled.rec',
      email: 'khaled@masar-bus.sy',
      phone: '+963933101101',
    },
    {
      name: 'ريم العلي',
      username: 'reem.rec',
      email: 'reem@masar-bus.sy',
      phone: '+963944202202',
    },
  ];

  const receptionists: Array<{ id: number; name: string }> = [];
  for (const rec of receptionistDefs) {
    let existing = await prisma.user.findFirst({
      where: { OR: [{ username: rec.username }, { phone: rec.phone }] },
    });
    if (!existing) {
      existing = await prisma.user.create({
        data: {
          name: rec.name,
          username: rec.username,
          email: rec.email,
          phone: rec.phone,
          passwordHash: staffDemoPasswordHash,
          role: Role.RECEPTIONIST,
          isActive: true,
          mustChangePassword: false,
        },
      });
    }
    receptionists.push({ id: existing.id, name: existing.name });
  }

  const customerDefs = [
    { name: 'رامي الدمشقي', phone: '+963932111222' },
    { name: 'نور الهدى الشامي', phone: '+963944333444' },
    { name: 'طارق السالم', phone: '+963955666777' },
    { name: 'ليان خوري', phone: '+963966888999' },
  ];

  const customerByPhone = new Map<string, { id: number; name: string; phone: string }>();
  for (const cust of customerDefs) {
    let existing = await prisma.user.findUnique({ where: { phone: cust.phone } });
    if (!existing) {
      existing = await prisma.user.create({
        data: {
          name: cust.name,
          phone: cust.phone,
          role: Role.CUSTOMER,
          isActive: true,
          mustChangePassword: false,
          consentAcceptedAt: new Date(),
        },
      });
    }
    customerByPhone.set(cust.phone, {
      id: existing.id,
      name: existing.name,
      phone: existing.phone,
    });
  }

  // 2. Lookup Seeded Cities & Bus Types
  const cities = await prisma.city.findMany();
  const cityByName = new Map(cities.map((c) => [c.nameAr, c]));

  const busTypes = await prisma.busType.findMany();
  const busTypeByCode = new Map(busTypes.map((bt) => [bt.code, bt]));

  const damascus = cityByName.get('دمشق');
  const aleppo = cityByName.get('حلب');
  const homs = cityByName.get('حمص');
  const hama = cityByName.get('حماة');
  const latakia = cityByName.get('اللاذقية');
  const tartus = cityByName.get('طرطوس');
  const daraa = cityByName.get('درعا');
  const suwayda = cityByName.get('السويداء');

  const stdLarge = busTypeByCode.get('STANDARD_LARGE');
  const stdMedium = busTypeByCode.get('STANDARD_MEDIUM');
  const firstLarge = busTypeByCode.get('FIRST_CLASS_LARGE');
  const firstMedium = busTypeByCode.get('FIRST_CLASS_MEDIUM');
  const vipLarge = busTypeByCode.get('BUSINESS_LARGE');
  const vipMedium = busTypeByCode.get('BUSINESS_MEDIUM');

  if (
    !damascus ||
    !aleppo ||
    !homs ||
    !hama ||
    !latakia ||
    !tartus ||
    !daraa ||
    !suwayda ||
    !stdLarge ||
    !stdMedium ||
    !firstLarge ||
    !firstMedium ||
    !vipLarge ||
    !vipMedium
  ) {
    return;
  }

  // 3. Seed Physical Fleet Buses
  const busDefs = [
    { plateNumber: 'دمشق 714205', busTypeId: stdLarge.id },
    { plateNumber: 'دمشق 638912', busTypeId: firstLarge.id },
    { plateNumber: 'دمشق 502418', busTypeId: vipLarge.id },
    { plateNumber: 'حلب 319840', busTypeId: stdMedium.id },
    { plateNumber: 'حمص 445120', busTypeId: firstMedium.id },
    { plateNumber: 'اللاذقية 228910', busTypeId: vipMedium.id },
  ];

  const busByPlate = new Map<string, { id: number; plateNumber: string; busTypeId: number }>();
  for (const b of busDefs) {
    const bus = await prisma.bus.upsert({
      where: { plateNumber: b.plateNumber },
      update: {},
      create: {
        plateNumber: b.plateNumber,
        busTypeId: b.busTypeId,
        isActive: true,
      },
    });
    busByPlate.set(bus.plateNumber, bus);
  }

  // 4. Seed Recurring Trip Templates
  const now = new Date();
  const todayStr = formatDamascusDate(now);
  const startDateUtc = dateOnlyToUtcMidnight(todayStr);

  const templateDefs = [
    {
      originId: damascus.id,
      destinationId: aleppo.id,
      busTypeId: firstLarge.id,
      busId: busByPlate.get('دمشق 638912')?.id ?? null,
      price: 85000,
      departureTime: '08:00',
      recurrence: RecurrenceType.DAILY,
      daysOfWeek: [] as number[],
    },
    {
      originId: damascus.id,
      destinationId: latakia.id,
      busTypeId: vipLarge.id,
      busId: busByPlate.get('دمشق 502418')?.id ?? null,
      price: 110000,
      departureTime: '10:30',
      recurrence: RecurrenceType.DAILY,
      daysOfWeek: [] as number[],
    },
    {
      originId: damascus.id,
      destinationId: homs.id,
      busTypeId: stdMedium.id,
      busId: busByPlate.get('حلب 319840')?.id ?? null,
      price: 45000,
      departureTime: '14:00',
      recurrence: RecurrenceType.DAILY,
      daysOfWeek: [] as number[],
    },
    {
      originId: aleppo.id,
      destinationId: latakia.id,
      busTypeId: stdLarge.id,
      busId: busByPlate.get('دمشق 714205')?.id ?? null,
      price: 70000,
      departureTime: '09:00',
      recurrence: RecurrenceType.WEEKLY,
      daysOfWeek: [0, 2, 4],
    },
  ];

  const createdTemplates: Array<{ id: number }> = [];
  for (const tplDef of templateDefs) {
    let tpl = await prisma.tripTemplate.findFirst({
      where: {
        originId: tplDef.originId,
        destinationId: tplDef.destinationId,
        busTypeId: tplDef.busTypeId,
        departureTime: tplDef.departureTime,
      },
    });
    if (!tpl) {
      tpl = await prisma.tripTemplate.create({
        data: {
          originId: tplDef.originId,
          destinationId: tplDef.destinationId,
          busTypeId: tplDef.busTypeId,
          busId: tplDef.busId,
          price: tplDef.price,
          departureTime: tplDef.departureTime,
          recurrence: tplDef.recurrence,
          daysOfWeek: tplDef.daysOfWeek,
          startDate: startDateUtc,
          generateAheadDays: 14,
          isActive: true,
          createdById: adminUser?.id ?? null,
        },
      });
    }
    createdTemplates.push({ id: tpl.id });
  }

  // Seed one holiday exclusion on first template
  if (createdTemplates[0]) {
    const holidayDate = dateOnlyToUtcMidnight(addDaysToDateString(todayStr, 10));
    await prisma.templateExclusion.upsert({
      where: {
        templateId_excludedDate: {
          templateId: createdTemplates[0].id,
          excludedDate: holidayDate,
        },
      },
      update: {},
      create: {
        templateId: createdTemplates[0].id,
        excludedDate: holidayDate,
        reason: 'صيانة دورية للحافلات',
      },
    });
  }

  // Helper to get/create a trip safely by unique signature
  async function ensureTrip(input: {
    templateId?: number | null;
    originId: number;
    destinationId: number;
    busTypeId: number;
    busId?: number | null;
    departAt: Date;
    price: number;
    status: TripStatus;
  }): Promise<{ id: number; departAt: Date; price: number }> {
    const existing = await prisma.trip.findFirst({
      where: {
        originId: input.originId,
        destinationId: input.destinationId,
        busTypeId: input.busTypeId,
        departAt: input.departAt,
      },
    });
    if (existing) {
      return {
        id: existing.id,
        departAt: existing.departAt,
        price: Number(existing.price),
      };
    }
    const created = await prisma.trip.create({
      data: {
        templateId: input.templateId ?? null,
        originId: input.originId,
        destinationId: input.destinationId,
        busTypeId: input.busTypeId,
        busId: input.busId ?? null,
        departAt: input.departAt,
        price: input.price,
        status: input.status,
        createdById: adminUser?.id ?? null,
      },
    });
    return {
      id: created.id,
      departAt: created.departAt,
      price: Number(created.price),
    };
  }

  // 5. Seed Historical Completed Trips (-2d, -1d) + Today Open Trips + Next 5 Days Open Trips
  const completedTrip1 = await ensureTrip({
    originId: damascus.id,
    destinationId: aleppo.id,
    busTypeId: stdLarge.id,
    busId: busByPlate.get('دمشق 714205')?.id,
    departAt: damascusDateAndTimeToUtc(addDaysToDateString(todayStr, -2), '09:00'),
    price: 60000,
    status: TripStatus.COMPLETED,
  });

  const completedTrip2 = await ensureTrip({
    originId: damascus.id,
    destinationId: latakia.id,
    busTypeId: vipLarge.id,
    busId: busByPlate.get('دمشق 502418')?.id,
    departAt: damascusDateAndTimeToUtc(addDaysToDateString(todayStr, -1), '11:00'),
    price: 110000,
    status: TripStatus.COMPLETED,
  });

  // Ensure today always has bookable open trips at least 3-5 hours ahead so cutoff never closes them immediately
  const todayEveningA = new Date(now.getTime() + 3 * 3_600_000);
  todayEveningA.setUTCMinutes(0, 0, 0);
  const todayEveningB = new Date(now.getTime() + 4 * 3_600_000);
  todayEveningB.setUTCMinutes(30, 0, 0);
  const todayEveningC = new Date(now.getTime() + 5 * 3_600_000);
  todayEveningC.setUTCMinutes(0, 0, 0);

  const featuredTodayAleppo = await ensureTrip({
    originId: damascus.id,
    destinationId: aleppo.id,
    busTypeId: firstLarge.id,
    busId: busByPlate.get('دمشق 638912')?.id,
    departAt: todayEveningA,
    price: 85000,
    status: TripStatus.OPEN,
  });

  const featuredTodayLatakia = await ensureTrip({
    originId: damascus.id,
    destinationId: latakia.id,
    busTypeId: vipLarge.id,
    busId: busByPlate.get('دمشق 502418')?.id,
    departAt: todayEveningB,
    price: 110000,
    status: TripStatus.OPEN,
  });

  const featuredTodayHoms = await ensureTrip({
    originId: damascus.id,
    destinationId: homs.id,
    busTypeId: stdMedium.id,
    busId: busByPlate.get('حلب 319840')?.id,
    departAt: todayEveningC,
    price: 45000,
    status: TripStatus.OPEN,
  });

  const tomorrowStr = addDaysToDateString(todayStr, 1);
  const tomorrowAleppoReturn = await ensureTrip({
    originId: aleppo.id,
    destinationId: damascus.id,
    busTypeId: vipLarge.id,
    busId: busByPlate.get('دمشق 502418')?.id,
    departAt: damascusDateAndTimeToUtc(tomorrowStr, '09:30'),
    price: 115000,
    status: TripStatus.OPEN,
  });

  const tomorrowTartus = await ensureTrip({
    originId: damascus.id,
    destinationId: tartus.id,
    busTypeId: vipMedium.id,
    busId: busByPlate.get('اللاذقية 228910')?.id,
    departAt: damascusDateAndTimeToUtc(tomorrowStr, '13:00'),
    price: 95000,
    status: TripStatus.OPEN,
  });

  // Populate next 6 days across all popular Syrian routes
  for (let offset = 1; offset <= 6; offset += 1) {
    const dStr = addDaysToDateString(todayStr, offset);

    await ensureTrip({
      templateId: createdTemplates[0]?.id,
      originId: damascus.id,
      destinationId: aleppo.id,
      busTypeId: firstLarge.id,
      busId: busByPlate.get('دمشق 638912')?.id,
      departAt: damascusDateAndTimeToUtc(dStr, '08:00'),
      price: 85000,
      status: TripStatus.OPEN,
    });

    await ensureTrip({
      originId: damascus.id,
      destinationId: aleppo.id,
      busTypeId: stdLarge.id,
      busId: busByPlate.get('دمشق 714205')?.id,
      departAt: damascusDateAndTimeToUtc(dStr, '16:30'),
      price: 60000,
      status: TripStatus.OPEN,
    });

    await ensureTrip({
      templateId: createdTemplates[1]?.id,
      originId: damascus.id,
      destinationId: latakia.id,
      busTypeId: vipLarge.id,
      busId: busByPlate.get('دمشق 502418')?.id,
      departAt: damascusDateAndTimeToUtc(dStr, '10:30'),
      price: 110000,
      status: TripStatus.OPEN,
    });

    await ensureTrip({
      templateId: createdTemplates[2]?.id,
      originId: damascus.id,
      destinationId: homs.id,
      busTypeId: stdMedium.id,
      busId: busByPlate.get('حلب 319840')?.id,
      departAt: damascusDateAndTimeToUtc(dStr, '14:00'),
      price: 45000,
      status: TripStatus.OPEN,
    });

    await ensureTrip({
      originId: damascus.id,
      destinationId: hama.id,
      busTypeId: firstMedium.id,
      busId: busByPlate.get('حمص 445120')?.id,
      departAt: damascusDateAndTimeToUtc(dStr, '12:00'),
      price: 55000,
      status: TripStatus.OPEN,
    });

    await ensureTrip({
      originId: latakia.id,
      destinationId: damascus.id,
      busTypeId: firstMedium.id,
      busId: busByPlate.get('حمص 445120')?.id,
      departAt: damascusDateAndTimeToUtc(dStr, '15:30'),
      price: 80000,
      status: TripStatus.OPEN,
    });

    if (offset <= 3) {
      await ensureTrip({
        originId: damascus.id,
        destinationId: daraa.id,
        busTypeId: stdMedium.id,
        busId: busByPlate.get('حلب 319840')?.id,
        departAt: damascusDateAndTimeToUtc(dStr, '11:00'),
        price: 35000,
        status: TripStatus.OPEN,
      });

      await ensureTrip({
        originId: damascus.id,
        destinationId: suwayda.id,
        busTypeId: firstMedium.id,
        busId: busByPlate.get('حمص 445120')?.id,
        departAt: damascusDateAndTimeToUtc(dStr, '13:30'),
        price: 40000,
        status: TripStatus.OPEN,
      });
    }
  }

  // 6. Seed Realistic Bookings & Passenger Seats
  const rami = customerByPhone.get('+963932111222');
  const nour = customerByPhone.get('+963944333444');
  const tarek = customerByPhone.get('+963955666777');
  const layan = customerByPhone.get('+963966888999');

  const bookingDefs = [
    {
      idempotencyKey: 'seed-demo-bk-01',
      code: 'BK-20261118-0001',
      trip: featuredTodayAleppo,
      userId: rami?.id ?? null,
      createdById: rami?.id ?? null,
      channel: BookingChannel.MOBILE,
      contactName: 'رامي الدمشقي',
      contactPhone: '+963932111222',
      paymentMethod: PaymentMethod.CASH_ON_BOARDING,
      createdAt: now,
      seats: [
        { seatNumber: '1A', passengerName: 'رامي الدمشقي', passengerPhone: '+963932111222' },
        { seatNumber: '1B', passengerName: 'يارا الدمشقي', passengerPhone: '+963932111223' },
      ],
    },
    {
      idempotencyKey: 'seed-demo-bk-02',
      code: 'BK-20261118-0002',
      trip: featuredTodayAleppo,
      userId: null,
      createdById: receptionists[0]?.id ?? adminUser?.id ?? null,
      channel: BookingChannel.ADMIN_WEB,
      contactName: 'سامر الحلبي',
      contactPhone: '+963945777888',
      paymentMethod: PaymentMethod.CASH_OFFICE,
      createdAt: now,
      seats: [
        { seatNumber: '2A', passengerName: 'سامر الحلبي', passengerPhone: '+963945777888' },
        { seatNumber: '2C', passengerName: 'سلمى الحلبي', passengerPhone: '+963945777889' },
      ],
    },
    {
      idempotencyKey: 'seed-demo-bk-03',
      code: 'BK-20261118-0003',
      trip: featuredTodayLatakia,
      userId: nour?.id ?? null,
      createdById: nour?.id ?? null,
      channel: BookingChannel.MOBILE,
      contactName: 'نور الهدى الشامي',
      contactPhone: '+963944333444',
      paymentMethod: PaymentMethod.CASH_ON_BOARDING,
      createdAt: now,
      seats: [
        { seatNumber: '1A', passengerName: 'نور الهدى الشامي', passengerPhone: '+963944333444' },
      ],
    },
    {
      idempotencyKey: 'seed-demo-bk-04',
      code: 'BK-20261118-0004',
      trip: featuredTodayHoms,
      userId: null,
      createdById: receptionists[1]?.id ?? adminUser?.id ?? null,
      channel: BookingChannel.ADMIN_WEB,
      contactName: 'مازن العبدالله',
      contactPhone: '+963938444555',
      paymentMethod: PaymentMethod.CASH_OFFICE,
      createdAt: now,
      seats: [
        { seatNumber: '1A', passengerName: 'مازن العبدالله', passengerPhone: '+963938444555' },
        { seatNumber: '1B', passengerName: 'هدى المصري', passengerPhone: '+963938444556' },
        { seatNumber: '2A', passengerName: 'وليد المصري', passengerPhone: '+963938444557' },
      ],
    },
    {
      idempotencyKey: 'seed-demo-bk-05',
      code: 'BK-20261118-0005',
      trip: tomorrowAleppoReturn,
      userId: tarek?.id ?? null,
      createdById: receptionists[0]?.id ?? adminUser?.id ?? null,
      channel: BookingChannel.ADMIN_WEB,
      contactName: 'طارق السالم',
      contactPhone: '+963955666777',
      paymentMethod: PaymentMethod.CASH_OFFICE,
      createdAt: now,
      seats: [
        { seatNumber: '2A', passengerName: 'طارق السالم', passengerPhone: '+963955666777' },
        { seatNumber: '2B', passengerName: 'غيث السالم', passengerPhone: '+963955666778' },
      ],
    },
    {
      idempotencyKey: 'seed-demo-bk-06',
      code: 'BK-20261118-0006',
      trip: tomorrowTartus,
      userId: layan?.id ?? null,
      createdById: layan?.id ?? null,
      channel: BookingChannel.MOBILE,
      contactName: 'ليان خوري',
      contactPhone: '+963966888999',
      paymentMethod: PaymentMethod.CASH_ON_BOARDING,
      createdAt: now,
      seats: [
        { seatNumber: '1A', passengerName: 'ليان خوري', passengerPhone: '+963966888999' },
      ],
    },
    {
      idempotencyKey: 'seed-demo-bk-07',
      code: 'BK-20261116-0001',
      trip: completedTrip1,
      userId: rami?.id ?? null,
      createdById: receptionists[0]?.id ?? adminUser?.id ?? null,
      channel: BookingChannel.ADMIN_WEB,
      contactName: 'فادي الزين',
      contactPhone: '+963931222333',
      paymentMethod: PaymentMethod.CASH_OFFICE,
      createdAt: new Date(now.getTime() - 2 * 86_400_000),
      seats: [
        { seatNumber: '4A', passengerName: 'فادي الزين', passengerPhone: '+963931222333' },
        { seatNumber: '4B', passengerName: 'دانا الزين', passengerPhone: '+963931222334' },
        { seatNumber: '4C', passengerName: 'كريم الزين', passengerPhone: '+963931222335' },
      ],
    },
    {
      idempotencyKey: 'seed-demo-bk-08',
      code: 'BK-20261117-0001',
      trip: completedTrip2,
      userId: nour?.id ?? null,
      createdById: nour?.id ?? null,
      channel: BookingChannel.MOBILE,
      contactName: 'نور الهدى الشامي',
      contactPhone: '+963944333444',
      paymentMethod: PaymentMethod.CASH_ON_BOARDING,
      createdAt: new Date(now.getTime() - 86_400_000),
      seats: [
        { seatNumber: '3A', passengerName: 'نور الهدى الشامي', passengerPhone: '+963944333444' },
        { seatNumber: '3B', passengerName: 'سارة الشامي', passengerPhone: '+963944333445' },
      ],
    },
  ];

  const createdBookingIds: Array<{ id: number; code: string; userId: number | null; tripId: number }> = [];
  for (const bk of bookingDefs) {
    const existing = await prisma.booking.findFirst({
      where: {
        OR: [{ idempotencyKey: bk.idempotencyKey }, { code: bk.code }],
      },
    });
    if (existing) continue;

    // Ensure no active seat conflicts on target trip
    const conflict = await prisma.bookingSeat.findFirst({
      where: {
        tripId: bk.trip.id,
        isActive: true,
        seatNumber: { in: bk.seats.map((s) => s.seatNumber) },
      },
    });
    if (conflict) continue;

    const unitPrice = bk.trip.price;
    const totalPrice = unitPrice * bk.seats.length;
    const created = await prisma.booking.create({
      data: {
        code: bk.code,
        tripId: bk.trip.id,
        userId: bk.userId,
        createdById: bk.createdById,
        channel: bk.channel,
        contactName: bk.contactName,
        contactPhone: bk.contactPhone,
        unitPrice,
        totalPrice,
        paymentMethod: bk.paymentMethod,
        status: BookingStatus.CONFIRMED,
        idempotencyKey: bk.idempotencyKey,
        createdAt: bk.createdAt,
        seats: {
          create: bk.seats.map((seat) => ({
            tripId: bk.trip.id,
            seatNumber: seat.seatNumber,
            passengerName: seat.passengerName,
            passengerPhone: seat.passengerPhone,
            unitPrice,
            status: BookingStatus.CONFIRMED,
            isActive: true,
          })),
        },
      },
    });
    createdBookingIds.push({
      id: created.id,
      code: created.code,
      userId: created.userId,
      tripId: created.tripId,
    });
  }

  // 7. Seed Realistic In-App Notifications for Customers
  if (rami) {
    await prisma.notification.upsert({
      where: { dedupeKey: 'seed-notif-rami-01' },
      update: {},
      create: {
        userId: rami.id,
        bookingId: createdBookingIds.find((b) => b.userId === rami.id)?.id ?? null,
        tripId: featuredTodayAleppo.id,
        targetPhone: rami.phone,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'تم تأكيد حجزك بنجاح',
        body: 'تم إصدار تذكرتك على رحلة دمشق ← حلب (المقاعد: 1A، 1B). نتمنى لك رحلة سعيدة.',
        channel: NotificationChannel.IN_APP,
        deliveryStatus: DeliveryStatus.SENT,
        dedupeKey: 'seed-notif-rami-01',
        isRead: false,
      },
    });
  }

  if (nour) {
    await prisma.notification.upsert({
      where: { dedupeKey: 'seed-notif-nour-01' },
      update: {},
      create: {
        userId: nour.id,
        tripId: featuredTodayLatakia.id,
        targetPhone: nour.phone,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'تأكيد حجز رحلة اللاذقية VIP',
        body: 'تم تأكيد المقعد 1A على رحلة دمشق ← اللاذقية، يرجى التواجد قبل 30 دقيقة من الانطلاق.',
        channel: NotificationChannel.IN_APP,
        deliveryStatus: DeliveryStatus.SENT,
        dedupeKey: 'seed-notif-nour-01',
        isRead: false,
      },
    });
  }

  // 8. Seed Initial Audit Log Entries if empty
  const existingAuditCount = await prisma.auditLog.count();
  if (existingAuditCount === 0 && adminUser) {
    await prisma.auditLog.createMany({
      data: [
        {
          userId: adminUser.id,
          action: 'SYSTEM_SEED_DEMO',
          entity: 'System',
          entityId: 'demo',
          details: {
            receptionists: receptionists.map((r) => r.name),
            busesCount: busDefs.length,
            bookingsCount: bookingDefs.length,
          },
        },
        {
          userId: receptionists[0]?.id ?? adminUser.id,
          action: 'BOOKING_CREATE',
          entity: 'Booking',
          entityId: 'BK-20261118-0002',
          details: {
            seats: ['2A', '2C'],
            paymentMethod: 'CASH_OFFICE',
            route: 'دمشق ← حلب',
          },
        },
      ],
    });
  }
}

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/bus_system?schema=public';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await runSeed(prisma);
    if (process.env.SEED_DEMO !== 'false') {
      await runDemoSeed(prisma);
    }
    console.log('Seed completed successfully.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

const isCliRun =
  process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');
if (isCliRun) {
  main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
