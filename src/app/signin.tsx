import { useState } from 'react';
import { router } from 'expo-router';
import { Platform, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import { PRIVACY_URL, SMS_CONSENT, TERMS_URL } from '@/lib/legal';
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

  // Every screen needs a door out, and this one had none: you arrived by tapping
  // a link, and the only exit was a code that cannot arrive until the carrier
  // registration clears. That is a trap, not a sign-in screen.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <Pressable onPress={leave} style={styles.backBtn} hitSlop={10}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>BACK</Text>
        </Pressable>

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

            {/* The consent itself. Carriers require this to be on the screen
                that collects the number, not buried in a policy — and they ask
                for a screenshot of it during registration. */}
            <Text style={styles.consent}>{SMS_CONSENT}</Text>
            {PRIVACY_URL && (
              <Pressable onPress={() => Linking.openURL(PRIVACY_URL as string)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryLabel}>PRIVACY POLICY</Text>
                <Text style={styles.secondaryArrow}>›</Text>
              </Pressable>
            )}
            {TERMS_URL && (
              <Pressable onPress={() => Linking.openURL(TERMS_URL as string)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryLabel}>TERMS OF SERVICE</Text>
                <Text style={styles.secondaryArrow}>›</Text>
              </Pressable>
            )}
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
              // iOS gets `textContentType` and nothing else. `autoComplete` is
              // Android's prop; React Native also maps it on iOS, and whatever
              // it mapped to was enough to make a field asking for a texted code
              // offer the phone's own number out of Contacts instead. Setting
              // one and leaving the other undefined is the only combination that
              // gets the six digits into the suggestion strip.
              autoComplete={Platform.OS === 'android' ? 'sms-otp' : undefined}
              textContentType="oneTimeCode"
              // Belt and braces: iOS will not offer a code to a field it thinks
              // is a password or a phone number, and a secure field never gets
              // the suggestion at all.
              secureTextEntry={false}
              importantForAutofill="yes"
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

        <Pressable onPress={leave} style={styles.secondaryBtn}>
          <Text style={styles.secondaryLabel}>SKIP FOR NOW — PICK A NAME INSTEAD</Text>
          <Text style={styles.secondaryArrow}>›</Text>
        </Pressable>
        <Text style={styles.consent}>
          Signing in is optional while the round is just you and your regular group. It becomes the way in once
          invites go out to people who aren’t on this phone.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 },
  backArrow: { fontFamily: font.heading, fontSize: 20, color: colors.accent, lineHeight: 22 },
  backLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.accent },
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
  consent: { fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 16 },
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
