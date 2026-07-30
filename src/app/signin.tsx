import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import { isOtpValid, isPhoneValid, prettyPhone } from '@/lib/phone';
import { colors, font } from '@/theme';

/**
 * Sign in with a phone number.
 *
 * Two screens in one, because it is one thought: type your number, type the code
 * you were just texted. The second half only exists once a code is out.
 *
 * A phone number rather than an email because that is already the app's idea of
 * a person — invites go by text, contacts are picked by number — and because
 * nobody standing on a first tee wants to check their email.
 */
export default function SignInScreen() {
  const { authStage, authBusy, authError, pendingPhone, sendCode, verifyCode, cancelCode } = useRound();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const sent = authStage === 'codeSent';
  const canSend = isPhoneValid(phone) && !authBusy;
  const canVerify = isOtpValid(code) && !authBusy;

  const doSend = async () => {
    if (!canSend) return;
    setProblem(await sendCode(phone));
  };

  const doVerify = async () => {
    if (!canVerify) return;
    const err = await verifyCode(code);
    setProblem(err);
    // Signing in proves whose phone this is and nothing else. Which player you
    // are in a given round is a separate, deliberate step.
    if (!err) router.replace('/');
  };

  const startOver = () => {
    setCode('');
    setProblem(null);
    cancelCode();
  };

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <Wordmark width={220} />

        {!sent ? (
          <>
            <Text style={styles.lede}>
              Your number is how the group knows it’s you, and how an invite finds you. We text you a code — there’s no
              password to forget.
            </Text>

            <Text style={styles.fieldLabel}>Your mobile number</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              placeholderTextColor={colors.ghost}
              style={styles.input}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              autoFocus
              onSubmitEditing={doSend}
            />
            {phone.trim() !== '' && !isPhoneValid(phone) && (
              <Text style={styles.errorText}>That doesn’t look like a phone number yet.</Text>
            )}

            <Pressable onPress={doSend} disabled={!canSend} style={[styles.primaryBtn, !canSend && styles.btnOff]}>
              <Text style={styles.primaryLabel}>{authBusy ? 'SENDING…' : 'TEXT ME A CODE'}</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </Pressable>

            <Text style={styles.note}>
              Standard message rates apply. Your number is used to sign you in and to match you to rounds you’ve been
              invited to — nothing else, and it is never shown to anyone outside a round you’re in.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.lede}>
              We’ve texted a six-digit code to {pendingPhone ? prettyPhone(pendingPhone) : 'your phone'}. It expires in a
              few minutes.
            </Text>

            <Text style={styles.fieldLabel}>The code</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.ghost}
              style={[styles.input, styles.codeInput]}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              onSubmitEditing={doVerify}
            />

            <Pressable onPress={doVerify} disabled={!canVerify} style={[styles.primaryBtn, !canVerify && styles.btnOff]}>
              <Text style={styles.primaryLabel}>{authBusy ? 'CHECKING…' : 'SIGN IN'}</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </Pressable>

            <Pressable onPress={startOver} style={styles.secondaryBtn}>
              <Text style={styles.secondaryLabel}>WRONG NUMBER? START AGAIN</Text>
              <Text style={styles.secondaryArrow}>›</Text>
            </Pressable>
          </>
        )}

        {(problem || authError) && <Text style={styles.errorText}>{problem ?? authError}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingTop: 72, paddingHorizontal: 20, paddingBottom: 40 },
  lede: { fontFamily: font.body, fontSize: 13.5, lineHeight: 21, color: colors.muted, marginTop: 18 },
  fieldLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 26,
  },
  input: {
    fontFamily: font.heading,
    fontSize: 22,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 9,
    marginTop: 8,
  },
  codeInput: { fontSize: 30, letterSpacing: 8 },
  errorText: { fontFamily: font.body, fontSize: 11.5, color: colors.accent, marginTop: 10 },
  primaryBtn: {
    marginTop: 30,
    height: 78,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  btnOff: { opacity: 0.35 },
  primaryLabel: { fontFamily: font.heading, fontSize: 17, letterSpacing: 0.3, color: '#fff' },
  primaryArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, marginTop: 14 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 18,
    marginTop: 14,
  },
  secondaryLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.text },
  secondaryArrow: { fontFamily: font.heading, fontSize: 16, color: colors.ghost },
});
