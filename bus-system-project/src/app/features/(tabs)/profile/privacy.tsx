import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader, ScreenContainer } from '@/shared/components';
import { ArStrings } from '@/shared/i18n/ar';
import { Colors, FontFamilies, FontSizes, Radii, Spacing } from '@/shared/theme';

const PRIVACY_SECTIONS = [
  {
    icon: 'person-circle-outline' as const,
    title: 'البيانات التي نجمعها',
    body: 'نجمع فقط البيانات الضرورية لإتمام حجزك وإصدار التذكرة الرقمية: الاسم الكامل، رقم الهاتف المحمول السوري، وأرقام المقاعد المختارة.',
  },
  {
    icon: 'lock-closed-outline' as const,
    title: 'حماية الجلسة ورموز الدخول',
    body: 'يتم حفظ رموز الدخول الآمنة (JWT) ومفاتيح الجلسة محلياً داخل SecureStore / Keychain المشفّر على جهازك، كما تُنقل جميع الاتصالات عبر بروتوكول مشفّر.',
  },
  {
    icon: 'notifications-outline' as const,
    title: 'الإشعارات ورسائل التحقق OTP',
    body: 'يُستخدم رقم هاتفك لإرسال رموز التحقق SMS وتنبيهات الرحلات الضرورية (كتأكيد الحجز أو تغيير الموعد). يمكنك إيقاف التنبيهات التذكيرية غير الحرجة من شاشة الإشعارات.',
  },
  {
    icon: 'document-text-outline' as const,
    title: 'الاحتفاظ بالسجلات وسياسة الإلغاء',
    body: 'يُحتفظ بسجل الحجز لأغراض التشغيل ومراجعة كشوفات الصعود، ويُسجّل أي إلغاء أو تعديل على بيانات الراكب وفق القوانين المعتمدة دون حذف السجل التشغيلي.',
  },
] as const;

export default function PrivacyPolicyScreen() {
  return (
    <ScreenContainer header={<AppHeader title={ArStrings.profile.privacyTitle} />}>
      <View style={styles.introCard}>
        <Ionicons name="shield-checkmark" size={30} color={Colors.primary} />
        <Text style={styles.introTitle}>التزام BusWay بخصوصية المسافرين</Text>
        <Text style={styles.introSub}>
          نلتزم بحماية بياناتك الشخصية وفق مبادئ تقليل البيانات وحصر الاستخدام بخدمات النقل والسفر.
        </Text>
      </View>

      <View style={styles.list}>
        {PRIVACY_SECTIONS.map((sec) => (
          <View key={sec.title} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name={sec.icon} size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>{sec.title}</Text>
            </View>
            <Text style={styles.sectionBody}>{sec.body}</Text>
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  introCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: '#C7D7F6',
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.xxs,
  },
  introTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.base,
    color: Colors.primaryDark,
    textAlign: 'center',
  },
  introSub: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    gap: Spacing.sm,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
    textAlign: 'right',
  },
  sectionBody: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    lineHeight: 21,
  },
});
