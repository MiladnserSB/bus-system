import React, { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ApiError,
  authApi,
  FcmService,
  profileApi,
  SecureStorage,
} from '@/shared/api';
import {
  AppButton,
  AppHeader,
  AppInput,
  CardListSkeleton,
  ConfirmModal,
  ScreenContainer,
  Toast,
} from '@/shared/components';
import { ArStrings } from '@/shared/i18n/ar';
import {
  Colors,
  FontFamilies,
  FontSizes,
  Radii,
  Spacing,
  TouchTargets,
} from '@/shared/theme';
import { AuthUser } from '@/shared/types/api.types';

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [toast, setToast] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      const token = await SecureStorage.getAccessToken();
      if (!token) {
        setUser(null);
        return;
      }
      const cached = await SecureStorage.getUser();
      if (cached) setUser(cached);
      const fresh = await profileApi.getMe();
      setUser(fresh);
    } catch {
      const cached = await SecureStorage.getUser();
      setUser(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const handleSaveName = async () => {
    const trimmed = draftName.trim();
    if (trimmed.length < 2) {
      setToast('يرجى إدخال اسم من حرفين على الأقل.');
      return;
    }
    setSavingName(true);
    try {
      const updated = await profileApi.updateName(trimmed);
      setUser(updated);
      setEditNameOpen(false);
      setToast('تم تحديث الاسم بنجاح');
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'تعذر تحديث الاسم حالياً.');
    } finally {
      setSavingName(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await FcmService.unregisterDevice();
      await authApi.logout();
      setUser(null);
      setLogoutModalOpen(false);
      router.replace('/features/(auth)' as Href);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScreenContainer header={<AppHeader title={ArStrings.profile.title} showBack={false} />}>
      {loading ? (
        <CardListSkeleton count={2} />
      ) : user ? (
        <View style={styles.stack}>
          {/* Identity Card */}
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={Colors.primary} />
            </View>
            <View style={styles.identityInfo}>
              <Text style={styles.name}>{user.name || 'عميل مسار'}</Text>
              <Text style={styles.phone}>{user.phone ?? ''}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setDraftName(user.name ?? '');
                setEditNameOpen(true);
              }}
              style={styles.editBtn}
              accessibilityRole="button"
              accessibilityLabel={ArStrings.profile.editNameTitle}
            >
              <Ionicons name="create-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Menu Items */}
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/features/(tabs)/profile/change-phone' as Href)}
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              <Text style={styles.menuText}>{ArStrings.profile.changePhoneRow}</Text>
              <Ionicons name="call-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/features/(tabs)/profile/help' as Href)}
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              <Text style={styles.menuText}>{ArStrings.profile.helpRow}</Text>
              <Ionicons name="help-circle-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/features/(tabs)/profile/privacy' as Href)}
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              <Text style={styles.menuText}>{ArStrings.profile.privacyRow}</Text>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => setLogoutModalOpen(true)}
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={18} color={Colors.danger} />
              <Text style={[styles.menuText, { color: Colors.danger }]}>
                {ArStrings.profile.logoutRow}
              </Text>
              <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          <View style={styles.guestBanner}>
            <Ionicons name="person-circle-outline" size={48} color={Colors.primary} />
            <Text style={styles.guestTitle}>{ArStrings.profile.guestTitle}</Text>
            <Text style={styles.guestSub}>{ArStrings.profile.guestSub}</Text>
            <AppButton
              title={ArStrings.profile.loginCta}
              onPress={() => router.push('/features/(auth)' as Href)}
              variant="primary"
              style={styles.fullWidth}
            />
          </View>

          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/features/(tabs)/profile/help' as Href)}
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              <Text style={styles.menuText}>{ArStrings.profile.helpRow}</Text>
              <Ionicons name="help-circle-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/features/(tabs)/profile/privacy' as Href)}
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              <Text style={styles.menuText}>{ArStrings.profile.privacyRow}</Text>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Edit Name Modal */}
      <Modal
        visible={editNameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditNameOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{ArStrings.profile.editNameTitle}</Text>
            <AppInput
              label={ArStrings.passengers.fullNameLabel}
              value={draftName}
              onChangeText={setDraftName}
              maxLength={100}
            />
            <View style={styles.modalActions}>
              <AppButton
                title={ArStrings.app.cancel}
                onPress={() => setEditNameOpen(false)}
                variant="outline"
                style={styles.modalBtn}
              />
              <AppButton
                title={ArStrings.app.save}
                onPress={handleSaveName}
                loading={savingName}
                variant="primary"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={logoutModalOpen}
        title={ArStrings.profile.logoutConfirmTitle}
        message={ArStrings.profile.logoutConfirmBody}
        confirmTitle={ArStrings.profile.logoutRow}
        cancelTitle={ArStrings.app.cancel}
        isDestructive
        loading={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => setLogoutModalOpen(false)}
      />

      <Toast message={toast} visible={Boolean(toast)} onDismiss={() => setToast('')} type="info" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: Radii.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityInfo: {
    flex: 1,
  },
  name: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
    textAlign: 'right',
  },
  phone: {
    fontFamily: FontFamilies.semiBold,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'ltr',
    alignSelf: 'flex-end',
    fontVariant: ['tabular-nums'],
  },
  editBtn: {
    minWidth: TouchTargets.minSize,
    minHeight: TouchTargets.minSize,
    borderRadius: Radii.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  menuRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  menuText: {
    flex: 1,
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
    color: Colors.textMain,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  guestBanner: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  guestTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
  },
  guestSub: {
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  modalTitle: {
    fontFamily: FontFamilies.extraBold,
    fontSize: FontSizes.lg,
    color: Colors.textMain,
    textAlign: 'right',
    marginBottom: Spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalBtn: {
    flex: 1,
  },
});
