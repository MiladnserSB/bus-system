-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPTIONIST', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "BusCategory" AS ENUM ('STANDARD', 'FIRST_CLASS', 'BUSINESS');

-- CreateEnum
CREATE TYPE "BusSize" AS ENUM ('LARGE', 'MEDIUM');

-- CreateEnum
CREATE TYPE "SeatSide" AS ENUM ('LEFT', 'RIGHT', 'MIDDLE');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('SCHEDULED', 'OPEN', 'FULL', 'CLOSED', 'DEPARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingChannel" AS ENUM ('ADMIN_WEB', 'MOBILE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH_OFFICE', 'CASH_ON_BOARDING');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMED', 'TRIP_REMINDER_24H', 'TRIP_REMINDER_3H', 'TRIP_CANCELLED', 'TRIP_TIME_CHANGED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "username" VARCHAR(60),
    "email" VARCHAR(160),
    "phone" VARCHAR(20) NOT NULL,
    "password_hash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "consent_accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "fcm_token" VARCHAR(512) NOT NULL,
    "platform" "DevicePlatform" NOT NULL DEFAULT 'ANDROID',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "name_ar" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_types" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120),
    "category" "BusCategory" NOT NULL,
    "size" "BusSize" NOT NULL,
    "layout" VARCHAR(10) NOT NULL,
    "rows_count" INTEGER NOT NULL,
    "has_extra_back_seat" BOOLEAN NOT NULL DEFAULT false,
    "total_seats" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bus_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_templates" (
    "id" SERIAL NOT NULL,
    "bus_type_id" INTEGER NOT NULL,
    "seat_number" VARCHAR(10) NOT NULL,
    "row_number" INTEGER NOT NULL,
    "col_letter" VARCHAR(4) NOT NULL,
    "side" "SeatSide" NOT NULL,
    "col_index" INTEGER NOT NULL,
    "is_extra" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "seat_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buses" (
    "id" SERIAL NOT NULL,
    "plate_number" VARCHAR(40) NOT NULL,
    "bus_type_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_templates" (
    "id" SERIAL NOT NULL,
    "origin_id" INTEGER NOT NULL,
    "destination_id" INTEGER NOT NULL,
    "bus_type_id" INTEGER NOT NULL,
    "bus_id" INTEGER,
    "price" DECIMAL(12,2) NOT NULL,
    "departure_time" VARCHAR(5) NOT NULL,
    "recurrence" "RecurrenceType" NOT NULL,
    "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "day_of_month" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "generate_ahead_days" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_exclusions" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "excluded_date" DATE NOT NULL,
    "reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER,
    "origin_id" INTEGER NOT NULL,
    "destination_id" INTEGER NOT NULL,
    "bus_type_id" INTEGER NOT NULL,
    "bus_id" INTEGER,
    "depart_at" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'OPEN',
    "cancel_reason" VARCHAR(500),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" INTEGER,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "created_by_id" INTEGER,
    "channel" "BookingChannel" NOT NULL,
    "contact_name" VARCHAR(120),
    "contact_phone" VARCHAR(20),
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH_ON_BOARDING',
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "idempotency_key" VARCHAR(128),
    "cancelled_by_id" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_seats" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "seat_number" VARCHAR(10) NOT NULL,
    "passenger_name" VARCHAR(120) NOT NULL,
    "passenger_phone" VARCHAR(20) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "cancelled_by_id" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "booking_id" INTEGER,
    "trip_id" INTEGER,
    "target_phone" VARCHAR(20),
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "dedupe_key" VARCHAR(160),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" INTEGER NOT NULL,
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "non_critical_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "description" VARCHAR(255),
    "updated_by_id" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "scheduler_job_logs" (
    "id" SERIAL NOT NULL,
    "job_name" VARCHAR(80) NOT NULL,
    "run_key" VARCHAR(120) NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "summary" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "scheduler_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_fcm_token_key" ON "user_devices"("fcm_token");

-- CreateIndex
CREATE INDEX "user_devices_user_id_is_active_idx" ON "user_devices"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_ar_key" ON "cities"("name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_en_key" ON "cities"("name_en");

-- CreateIndex
CREATE UNIQUE INDEX "bus_types_code_key" ON "bus_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bus_types_name_ar_key" ON "bus_types"("name_ar");

-- CreateIndex
CREATE INDEX "seat_templates_bus_type_id_row_number_col_index_idx" ON "seat_templates"("bus_type_id", "row_number", "col_index");

-- CreateIndex
CREATE UNIQUE INDEX "seat_templates_bus_type_id_seat_number_key" ON "seat_templates"("bus_type_id", "seat_number");

-- CreateIndex
CREATE UNIQUE INDEX "buses_plate_number_key" ON "buses"("plate_number");

-- CreateIndex
CREATE UNIQUE INDEX "template_exclusions_template_id_excluded_date_key" ON "template_exclusions"("template_id", "excluded_date");

-- CreateIndex
CREATE INDEX "trips_depart_at_origin_id_destination_id_idx" ON "trips"("depart_at", "origin_id", "destination_id");

-- CreateIndex
CREATE INDEX "trips_status_depart_at_idx" ON "trips"("status", "depart_at");

-- CreateIndex
CREATE UNIQUE INDEX "trips_template_id_depart_at_key" ON "trips"("template_id", "depart_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_idempotency_key_key" ON "bookings"("idempotency_key");

-- CreateIndex
CREATE INDEX "bookings_trip_id_status_idx" ON "bookings"("trip_id", "status");

-- CreateIndex
CREATE INDEX "bookings_user_id_created_at_idx" ON "bookings"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_contact_phone_idx" ON "bookings"("contact_phone");

-- CreateIndex
CREATE INDEX "booking_seats_passenger_phone_idx" ON "booking_seats"("passenger_phone");

-- CreateIndex
CREATE INDEX "booking_seats_trip_id_is_active_idx" ON "booking_seats"("trip_id", "is_active");

-- CreateIndex
CREATE INDEX "booking_seats_booking_id_idx" ON "booking_seats"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_trip_id_type_idx" ON "notifications"("trip_id", "type");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduler_job_logs_run_key_key" ON "scheduler_job_logs"("run_key");

-- CreateIndex
CREATE INDEX "scheduler_job_logs_job_name_started_at_idx" ON "scheduler_job_logs"("job_name", "started_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_templates" ADD CONSTRAINT "seat_templates_bus_type_id_fkey" FOREIGN KEY ("bus_type_id") REFERENCES "bus_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_bus_type_id_fkey" FOREIGN KEY ("bus_type_id") REFERENCES "bus_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_templates" ADD CONSTRAINT "trip_templates_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_templates" ADD CONSTRAINT "trip_templates_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_templates" ADD CONSTRAINT "trip_templates_bus_type_id_fkey" FOREIGN KEY ("bus_type_id") REFERENCES "bus_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_templates" ADD CONSTRAINT "trip_templates_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_templates" ADD CONSTRAINT "trip_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_exclusions" ADD CONSTRAINT "template_exclusions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "trip_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "trip_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_bus_type_id_fkey" FOREIGN KEY ("bus_type_id") REFERENCES "bus_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Critical SRS partial unique index: prevent double booking of active seats (REQ-BOOK-06, Section 6.1)
CREATE UNIQUE INDEX "booking_seats_trip_id_seat_number_active_key" ON "booking_seats"("trip_id", "seat_number") WHERE "is_active" = true;

-- Critical SRS integrity constraints (REQ-TRIP-02)
ALTER TABLE "trips" ADD CONSTRAINT "trips_origin_destination_diff_check" CHECK ("origin_id" <> "destination_id");
ALTER TABLE "trips" ADD CONSTRAINT "trips_price_positive_check" CHECK ("price" > 0);
ALTER TABLE "trip_templates" ADD CONSTRAINT "trip_templates_origin_destination_diff_check" CHECK ("origin_id" <> "destination_id");
ALTER TABLE "trip_templates" ADD CONSTRAINT "trip_templates_price_positive_check" CHECK ("price" > 0);
