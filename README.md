# BusWay — نظام إدارة رحلات وحجز مقاعد شركة النقل

مستودع موحّد يضم المشاريع الثلاثة لمنظومة **BusWay** للنقل البري بين المحافظات:

- [`bus-system-backend`](./bus-system-backend): خادم NestJS + TypeScript + PostgreSQL (Prisma) + Redis (`/api/v1` وSwagger `/api/docs`).
- [`BusSystem-master`](./BusSystem-master): لوحة تحكم المدير العام وموظف الاستقبال باستخدام Next.js 15 + TypeScript + Tailwind CSS v4.
- [`bus-system-project`](./bus-system-project): تطبيق المسافرين باستخدام React Native / Expo Router + TypeScript.

## التشغيل السريع الموحد (`npm run dev`)

1. **الباك إند (المنفذ `3000`):**
   ```bash
   cd bus-system-backend
   npm install
   npm run dev
   ```
   *(يتولى السكربت تلقائياً تشغيل PostgreSQL المدمج وRedis عند عدم توفرهما خارجياً، وتطبيق الهجرات والبذر الأولي والتجريبي الواقعي.)*

2. **لوحة التحكم الويب (المنفذ `3001`):**
   ```bash
   cd BusSystem-master
   npm install
   npm run dev
   ```
   افتح المتصفح على: http://localhost:3001

3. **تطبيق الموبايل عبر Expo Go (على الهاتف):**
   ```bash
   cd bus-system-project
   npm install
   npm run dev
   ```
   امسح رمز QR بتطبيق **Expo Go** على نفس شبكة Wi-Fi (يكتشف التطبيق عنوان IP الحاسوب تلقائياً للوصول إلى `http://<PC-IP>:3000/api/v1`).

## الحسابات الافتراضية والتجريبية
- **المدير العام (`ADMIN`):** `admin` / `Admin@123456`
- **موظفو الاستقبال (`RECEPTIONIST`):** `khaled.rec` أو `reem.rec` / `Reception@123`
- **المسافرون (`CUSTOMER` عبر رقم الهاتف مباشرة في وضع الديمو):** `0932111222` أو `0944333444` (تم إيقاف خطوة `OTP` مؤقتاً لتسهيل العرض والاختبار).
