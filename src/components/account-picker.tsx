import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Crest, Field, Row } from '@/components/ui';
import { type AccountSearchResult, searchAccounts } from '@/lib/db-accounts';
import { errorMessage } from '@/lib/db-fan';
import { useT } from '@/lib/i18n';
import { C, R } from '@/lib/theme';

/**
 * Sélecteur de compte pour la fédération : on tape un nom ou un e-mail, on pique
 * le compte dans la liste. Remplace la saisie d'un UUID copié du dashboard.
 *
 * La recherche (débounce 300 ms, ≥ 2 caractères) passe par `searchAccounts`, qui
 * n'aboutit que pour un admin (garde en base). Une fois un compte choisi, on
 * affiche une fiche avec un bouton pour revenir à la recherche.
 */
function initials(a: AccountSearchResult): string {
  const base = a.full_name?.trim() || a.email?.trim() || '—';
  return base.slice(0, 2).toUpperCase();
}

export function AccountPicker({
  selected,
  onPick,
  excludeIds,
  placeholder,
}: {
  selected: AccountSearchResult | null;
  onPick: (a: AccountSearchResult | null) => void;
  excludeIds?: string[];
  placeholder?: string;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AccountSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const excludeKey = (excludeIds ?? []).join(',');

  useEffect(() => {
    if (selected) return; // un compte est déjà choisi : pas de recherche
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setErr(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const rows = await searchAccounts(q);
        if (cancelled) return;
        const exclude = excludeKey ? excludeKey.split(',') : [];
        setResults(rows.filter((r) => !exclude.includes(r.id)));
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(errorMessage(e, t('Recherche impossible.')));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, selected, excludeKey, t]);

  function clear() {
    onPick(null);
    setQuery('');
    setResults([]);
    setErr(null);
  }

  if (selected) {
    return (
      <View
        style={{
          backgroundColor: C.surface2,
          borderRadius: R.sm,
          borderColor: C.green,
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 10,
          marginTop: 6,
        }}>
        <Row style={{ gap: 12 }}>
          <Crest label={initials(selected)} color={C.surface} size={34} round />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '500' }}>
              {selected.full_name ?? t('Compte sans nom')}
            </Text>
            <Text style={{ color: C.dim, fontSize: 12 }} numberOfLines={1}>
              {selected.email ?? selected.id}
            </Text>
          </View>
          <Pressable onPress={clear} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={C.muted} />
          </Pressable>
        </Row>
      </View>
    );
  }

  const q = query.trim();
  return (
    <View>
      <Field
        label={t('Rechercher un compte (nom ou e-mail)')}
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder ?? t('Nom ou e-mail…')}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <Row style={{ gap: 8, marginTop: 8 }}>
          <ActivityIndicator color={C.muted} />
          <Text style={{ color: C.dim, fontSize: 12 }}>{t('Recherche…')}</Text>
        </Row>
      ) : null}
      {err ? <Text style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{err}</Text> : null}

      {results.length > 0 ? (
        <View
          style={{
            marginTop: 8,
            backgroundColor: C.surface2,
            borderRadius: R.sm,
            overflow: 'hidden',
          }}>
          {results.map((a, i) => (
            <Pressable
              key={a.id}
              onPress={() => onPick(a)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: i < results.length - 1 ? 1 : 0,
                borderBottomColor: C.border,
              }}>
              <Row style={{ gap: 12 }}>
                <Crest label={initials(a)} color={C.surface} size={32} round />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14 }}>
                    {a.full_name ?? t('Compte sans nom')}
                  </Text>
                  <Text style={{ color: C.dim, fontSize: 12 }} numberOfLines={1}>
                    {a.email ?? a.id}
                  </Text>
                </View>
                {a.role !== 'fan' ? (
                  <Text style={{ color: C.muted, fontSize: 11 }}>
                    {a.role === 'admin' ? t('Admin') : t('Table technique')}
                  </Text>
                ) : null}
              </Row>
            </Pressable>
          ))}
        </View>
      ) : null}

      {q.length >= 2 && !loading && !err && results.length === 0 ? (
        <Text style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>
          {t('Aucun compte trouvé.')}
        </Text>
      ) : null}
    </View>
  );
}
