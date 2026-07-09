import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';

import { Button, Field, Logo, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { C, R, S } from '@/lib/theme';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    const res =
      mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password, fullName.trim());
    setLoading(false);
    if (res.error) setError(res.error);
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/compte');
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Row style={{ paddingHorizontal: S.lg, paddingVertical: S.md }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
            <Ionicons name="close" size={24} color={C.muted} />
          </Pressable>
        </Row>

        <View style={{ alignItems: 'center', paddingTop: S.md, gap: 12 }}>
          <Logo size={84} />
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>
            Fédération Guinéenne{'\n'}de Basketball
          </Text>
          <Text style={{ color: C.dim, fontSize: 12 }}>Scores · stats · vidéos · en direct</Text>
        </View>

        <Row style={{ marginHorizontal: S.lg, marginTop: S.xl, gap: 6 }}>
          {(['in', 'up'] as const).map((m) => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 9,
                  borderRadius: R.md,
                  backgroundColor: on ? C.surface2 : C.surface,
                  borderWidth: 1,
                  borderColor: on ? 'rgba(232,178,58,0.5)' : 'transparent',
                }}>
                <Text style={{ color: on ? C.text : C.muted, fontSize: 13, fontWeight: '500' }}>
                  {m === 'in' ? 'Connexion' : 'Inscription'}
                </Text>
              </Pressable>
            );
          })}
        </Row>

        <View style={{ paddingHorizontal: S.lg }}>
          {mode === 'up' && (
            <Field label="Nom complet" placeholder="Votre nom" value={fullName} onChangeText={setFullName} />
          )}
          <Field
            label="Adresse e-mail"
            placeholder="vous@exemple.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label="Mot de passe"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{error}</Text> : null}

          <Button
            title={mode === 'in' ? 'Se connecter' : 'Créer mon compte'}
            onPress={submit}
            loading={loading}
            disabled={!email || !password}
          />
          <Text style={{ color: C.dim, fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 17 }}>
            L'accès à l'espace fédération nécessite un compte administrateur validé.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
