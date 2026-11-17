# مسار — تطبيق المسافر لحجز تذاكر البولمان (React Native + Expo)

تطبيق الهاتف المخصص للمسافرين في شركة النقل (**مسار**)، مبني باستخدام **Expo SDK 58** و**React Native** و**Expo Router** و**TypeScript** (بنمط `strict` ودون `any`)، مع واجهة عربية كاملة (**RTL**)، أرقام غربية (`0-9`)، توقيت دمشق (`Asia/Damascus` 24 ساعة)، وتكامل كامل مع واجهة البرمجة `/api/v1` في `bus-system-backend`.

---

## البنية المعمارية للمشروع

```text
bus-system-project/
├── src/
│   ├── app/                              # مسارات Expo Router فقط (Layouts, Screens, Loading, Error, +not-found)
│   │   ├── _layout.tsx                   # تحميل خطوط Cairo + SafeAreaProvider + ErrorBoundary
│   │   ├── +not-found.tsx                # شاشة 404 الجذرية
│   │   └── features/
│   │       ├── (auth)/                   # الدخول برقم الهاتف السوري + التحقق بـ 6 أرقام OTP
│   │       ├── (tabs)/                   # التبويبات الـ 4: بحث، حجوزاتي، الإشعارات، حسابي (+ تغيير الهاتف، الدعم، الخصوصية)
│   │       ├── trips/                    # نتائج الرحلات والتصفية + خريطة المقاعد التفاعلية + نموذج بيانات الركاب
│   │       └── tickets/[bookingCode]/    # التذكرة الرقمية (QR) + الحفظ/المشاركة + تعديل الراكب + الإلغاء الكامل أو الجزئي
│   └── shared/                           # الطبقات المشتركة خارج جذر التوجيه
│       ├── api/                          # clientCore (تحديث 401 + إعادة GET حتى 3 مرات)، servicesCore، secureStore، fcm
│       ├── components/                   # ScreenContainer, AppHeader, AppButton/PrimaryButton, SeatMapGrid, LoadingSkeleton, ...
│       ├── constants/                    # helpers (السعر، الوقت، الهواتف، تجميع المقاعد)، rtl
│       ├── hooks/                        # useNetwork، useCountdown / useExpiresAtCountdown، useSeatPolling
│       ├── i18n/ar.ts                    # النصوص العربية المركزية وترجمة أكواد أخطاء الخادم
│       ├── theme/                        # colors.ts، typography.ts، spacing.ts
│       └── types/api.types.ts            # تعريفات DTO المطابقة لـ bus-system-backend
├── tests/                                # اختبارات Vitest (الوحدة، الخطافات، المكوّنات الـ 6، التكامل، وسير العمل الكامل E2E)
├── .env.example                          # نموذج متغيرات البيئة (EXPO_PUBLIC_API_URL)
└── README.md
```

---

## العقود المتوافقة مع `bus-system-backend` (`/api/v1`)

| المجال | نقاط النهاية المستخدمة |
| --- | --- |
| المصادقة والأجهزة | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`, `POST /devices`, `DELETE /devices/:fcmToken` |
| الحساب والمدن والفئات | `GET /me`, `PATCH /me`, `POST /me/phone/request-otp`, `POST /me/phone/verify`, `GET /cities`, `GET /bus-types` |
| الرحلات وخريطة المقاعد | `GET /trips`, `GET /trips/:id`, `GET /trips/:id/seats` (`x-guest-session`) |
| التثبيت المؤقت والحجز | `POST /trips/:id/holds`, `DELETE /holds/:id`, `POST /bookings` (`Idempotency-Key`), `GET /me/bookings`, `GET /bookings/:code` |
| التذكرة والتعديل والإلغاء | `GET /bookings/:code/ticket`, `PATCH /bookings/:code/passengers`, `POST /bookings/:code/cancel`, `POST /bookings/:code/seats/:seatNumber/cancel` |
| الإشعارات والتفضيلات | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `GET /notifications/preferences`, `PATCH /notifications/preferences` |

---

## الإعداد والتشغيل (Android / iOS / Expo)

1. **إعداد ملف البيئة**:
   ```bash
   cp .env.example .env
   ```
   اضبط `EXPO_PUBLIC_API_URL` داخل `.env`:
   - محاكي **Android**: `http://10.0.2.2:3000/api/v1`
   - محاكي **iOS** أو المتصفح المحلي: `http://localhost:3000/api/v1`
   - جهاز حقيقي على نفس الشبكة: `http://<YOUR_LAN_IP>:3000/api/v1`

2. **تثبيت الاعتماديات**:
   ```bash
   npm install
   ```

3. **تشغيل التطبيق**:
   - القائمة التفاعلية لـ Expo:
     ```bash
     npm start
     ```
   - التشغيل المباشر على Android / iOS / Web:
     ```bash
     npm run android
     npm run ios
     npm run web
     ```

---

## الفحص والاختبارات وبناء الحزمة

- **فحص الأنواع (TypeScript Strict)**:
  ```bash
  npx tsc --noEmit
  ```
- **فحص جودة الكود (Expo ESLint)**:
  ```bash
  npm run lint
  ```
- **تشغيل جميع الاختبارات (Unit, Hooks, Component UI, Integration & E2E Workflow)**:
  ```bash
  npm test
  ```
- **التحقق من تصدير حزمة الإنتاج (Expo/Metro Bundle)**:
  ```bash
  npx expo export
  ```
