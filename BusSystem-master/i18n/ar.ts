export const ArWeb = {
  brand: {
    name: 'BusWay',
    subtitle: 'مركز إدارة العمليات وحجز الرحلات',
    currency: 'ل.س',
  },
  nav: {
    dashboard: 'لوحة المؤشرات',
    trips: 'إدارة الرحلات',
    scheduledTrips: 'الرحلات المجدولة',
    fleet: 'الأسطول والمخططات',
    bookings: 'سجل الحجوزات',
    reports: 'التقارير والتحليلات',
    staff: 'الموظفون',
    cities: 'المدن والمحطات',
    settings: 'الإعدادات والسياسات',
    audit: 'سجل العمليات',
    profile: 'حسابي',
    logout: 'تسجيل الخروج',
  },
  roles: {
    ADMIN: 'المدير العام',
    RECEPTIONIST: 'موظف استقبال',
    CUSTOMER: 'زبون',
  },
  tripStatus: {
    SCHEDULED: 'مجدولة',
    OPEN: 'متاحة للحجز',
    FULL: 'مكتملة',
    CLOSED: 'مغلقة للحجز',
    DEPARTED: 'منطلقة',
    COMPLETED: 'منتهية',
    CANCELLED: 'ملغاة',
  },
  bookingStatus: {
    CONFIRMED: 'مؤكد',
    CANCELLED: 'ملغي',
    PARTIAL_CANCELLED: 'ملغي جزئياً',
  },
  seats: {
    available: 'متاح',
    booked: 'محجوز',
    held: 'قيد الحجز',
    selected: 'محدد ✓',
    extraBadge: 'إضافي وسط الممر',
    front: 'مقدمة الحافلة (السائق)',
    back: 'مؤخرة الحافلة',
  },
  common: {
    loading: 'جارٍ التحميل...',
    save: 'حفظ',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    retry: 'إعادة المحاولة',
    back: 'رجوع',
    print: 'طباعة',
    search: 'بحث',
    noData: 'لا توجد بيانات متاحة حالياً',
  },
} as const;

export const API_ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'تعذر الاتصال بالخادم الخلفي. تأكد من تشغيل الخادم وحاول مجدداً.',
  TIMEOUT_ERROR: 'انتهت مهلة الاتصال بالخادم. يرجى المحاولة مرة أخرى.',
  UNAUTHORIZED: 'انتهت صلاحية الجلسة أو تم تعطيل الحساب. يرجى تسجيل الدخول مجدداً.',
  FORBIDDEN: 'ليس لديك صلاحية تنفيذ هذه العملية.',
  NOT_FOUND: 'العنصر المطلوب غير موجود.',
  VALIDATION_ERROR: 'يرجى التحقق من صحة الحقول المدخلة.',
  INVALID_CREDENTIALS: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  ACCOUNT_DISABLED: 'تم تعطيل هذا الحساب. يرجى مراجعة المدير.',
  ACCOUNT_LOCKED: 'تم قفل الحساب مؤقتاً بسبب تكرار المحاولات الفاشلة.',
  PASSWORD_CHANGE_REQUIRED: 'يجب تغيير كلمة المرور المؤقتة قبل متابعة استخدام النظام.',
  INVALID_CURRENT_PASSWORD: 'كلمة المرور الحالية غير صحيحة.',
  DUPLICATE_ENTRY: 'القيمة مدخلة مسبقاً في النظام.',
  DUPLICATE_PLATE_NUMBER: 'رقم اللوحة مسجّل مسبقاً لباص آخر.',
  RESOURCE_IN_USE: 'لا يمكن حذف عنصر مرتبط برحلات أو حجوزات، يمكنك تعطيله بدلاً من ذلك.',
  INVALID_TRIP_ROUTE: 'مدينة الانطلاق يجب أن تختلف عن مدينة الوجهة.',
  TRIP_DATE_IN_PAST: 'موعد الرحلة يجب أن يكون في المستقبل.',
  DUPLICATE_TRIP_CONFIRMATION_REQUIRED: 'يوجد رحلة مماثلة في نفس الخط والنوع والموعد. يرجى التأكيد لإنشاء الرحلة.',
  TRIP_BUS_TYPE_LOCKED: 'يُمنع تغيير نوع الباص لوجود حجوزات نشطة على الرحلة.',
  TRIP_BOOKING_CLOSED: 'انتهى وقت الحجز المتاح لهذه الرحلة.',
  TRIP_NOT_BOOKABLE: 'هذه الرحلة غير متاحة للحجز حالياً.',
  SEAT_ALREADY_BOOKED: 'هذا المقعد تم حجزه، اختر مقعداً آخر.',
  SEAT_HELD_BY_ANOTHER: 'المقعد قيد الحجز حالياً من مستخدم آخر.',
  MAX_SEATS_EXCEEDED: 'تم تجاوز الحد الأقصى للمقاعد المسموح بها في الحجز الواحد.',
  HOLD_EXPIRED: 'انتهت مهلة التثبيت المؤقت للمقاعد. يرجى إعادة الاختيار.',
  HOLD_NOT_FOUND: 'القفل المؤقت غير موجود أو انتهت صلاحيته.',
  CANCELLATION_DEADLINE_PASSED: 'تجاوز الحجز المهلة المسموحة للإلغاء من قبل موظف الاستقبال.',
  BOOKING_ALREADY_CANCELLED: 'هذا الحجز ملغي مسبقاً.',
  IDEMPOTENCY_CONFLICT: 'مفتاح منع التكرار مستخدم لرحلة مختلفة.',
  INTERNAL_ERROR: 'حدث خطأ غير متوقع في الخادم.',
};

export function translateWebApiError(code?: string, fallback?: string): string {
  if (code && API_ERROR_MESSAGES[code]) {
    return API_ERROR_MESSAGES[code];
  }
  if (fallback && fallback.trim().length > 0) {
    return fallback;
  }
  return API_ERROR_MESSAGES.INTERNAL_ERROR;
}
