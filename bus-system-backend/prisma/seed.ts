import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';
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

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/bus_system?schema=public';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await runSeed(prisma);
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
