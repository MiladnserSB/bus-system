import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader, ScreenContainer } from '@/shared/components';
import { ArStrings } from '@/shared/i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing, TouchTargets } from '@/shared/theme';

const FAQ_ITEMS = [
  {
    q: 'ما هي سياسة إلغاء الحجز؟',
    a: 'يمكنك إلغاء الحجز مجاناً بالكامل قبل 3 ساعات على الأقل من موعد انطلاق الرحلة بتوقيت دمشق من خلال شاشة التذكرة. بعد هذه المهلة يُرجى مراجعة المكتب.',
  },
  {
    q: 'كيف أدفع ثمن التذكرة؟',
    a: 'تتم عملية الدفع نقداً بالليرة السورية عند الصعود للحافلة أو في المكتب المعتمد قبل موعد الرحلة بـ 30 دقيقة.',
  },
  {
    q: 'كم تبقى المقاعد محجوزة مؤقتاً لي؟',
    a: 'عند اختيار المقاعد، يتم تثبيتها مؤقتاً باسم جلستك لمدة 5 دقائق لإكمال إدخال بيانات الركاب وتأكيد الحجز.',
  },
  {
    q: 'كيف يتم التعامل مع بياناتي الشخصية؟',
    a: 'يُستخدم رقم الهاتف واسم المسافر فقط لإصدار التذكرة الرقمية وإرسال التنبيهات المتعلقة برحلتك وفقاً لسياسة الخصوصية.',
  },
] as const;

export default function HelpScreen() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <ScreenContainer header={<AppHeader title={ArStrings.profile.helpTitle} />}>
      <View style={styles.supportCard}>
        <Ionicons name="headset-outline" size={28} color={Colors.primary} />
        <Text style={styles.supportTitle}>مركز خدمة المسافرين</Text>
        <Text style={styles.supportMeta}>دمشق — كراج البولمان · خدمة العملاء: 011-2233445</Text>
      </View>

      <Text style={styles.sectionHeading}>الأسئلة الشائعة وسياسات السفر</Text>

      <View style={styles.faqList}>
        {FAQ_ITEMS.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <View key={item.q} style={styles.faqCard}>
              <TouchableOpacity
                onPress={() => setOpenIndex(isOpen ? null : idx)}
                style={styles.faqHeader}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
              >
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.primary}
                />
                <Text style={styles.faqQuestion}>{item.q}</Text>
              </TouchableOpacity>
              {isOpen ? <Text style={styles.faqAnswer}>{item.a}</Text> : null}
            </View>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  supportCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: '#C7D7F6',
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: 4,
  },
  supportTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.primaryDark,
  },
  supportMeta: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  sectionHeading: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: Spacing.sm,
  },
  faqList: {
    gap: Spacing.sm,
  },
  faqCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  faqHeader: {
    minHeight: TouchTargets.minSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  faqQuestion: {
    flex: 1,
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
    textAlign: 'right',
  },
  faqAnswer: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 22,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
