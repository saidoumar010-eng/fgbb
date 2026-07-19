import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { ImageField } from '@/components/image-field';
import { Button, Card, Crest, Empty, Field, Header, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listCompetitions } from '@/lib/db';
import { getCurrentSeason, listMyRegistrations, submitRegistration } from '@/lib/db-federation';
import { categoryLabel, fullDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';
import type { Category, RegistrationStatus } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

const CATEGORIES: Category[] = ['messieurs', 'dames', 'u18', 'autre'];

// `categoryLabel` renvoie la clé brute pour « autre » : on complète l'affichage.
function catLabel(c: Category, t: (fr: string) => string) {
  return c === 'autre' ? t('Autre') : t(categoryLabel(c));
}

// Demande d'inscription d'un club à une compétition, déposée par son dirigeant.
// La fédération l'examine ensuite depuis l'espace d'administration.
export default function InscriptionClub() {
  const { t } = useT();
  const { session, profile } = useAuth();

  return (
    <Screen>
      <Header
        title={t('Inscrire mon club')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />
      {session ? (
        <RegistrationForm email={session.user.email ?? ''} fullName={profile?.full_name ?? ''} />
      ) : (
        <View style={{ padding: S.lg }}>
          <Empty
            icon="lock-closed-outline"
            title={t('Connexion requise')}
            subtitle={t('Connecte-toi avec le compte du club pour déposer une demande d’inscription et suivre son avancement.')}
          />
          <Button title={t('Se connecter')} icon="log-in-outline" onPress={() => router.push('/login' as never)} />
        </View>
      )}
    </Screen>
  );
}

function RegistrationForm({ email, fullName }: { email: string; fullName: string }) {
  const { t } = useT();
  const competitions = useFetch(() => listCompetitions());
  const season = useFetch(() => getCurrentSeason());
  const mine = useFetch(() => listMyRegistrations());

  const [clubName, setClubName] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState<Category>('messieurs');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [competitionId, setCompetitionId] = useState<string | undefined>();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Les coordonnées du compte connecté servent de point de départ ; le dirigeant
  // reste libre de désigner un autre référent pour le club.
  useEffect(() => {
    setContactName((v) => v || fullName);
    setContactEmail((v) => v || email);
  }, [fullName, email]);

  async function send() {
    if (!clubName.trim()) {
      setError(t('Le nom du club est obligatoire.'));
      return;
    }
    if (!contactPhone.trim() && !contactEmail.trim()) {
      setError(t('Indique au moins un moyen de contact : téléphone ou e-mail.'));
      return;
    }
    setSending(true);
    setError(null);
    setFlash(null);
    try {
      await submitRegistration({
        club_name: clubName.trim(),
        city: city.trim() || null,
        category,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        competition_id: competitionId ?? null,
        season_id: season.data?.id ?? null,
        logo_url: logoUrl,
        note: note.trim() || null,
      });
      setFlash(t('Demande envoyée. La fédération te répondra prochainement.'));
      setClubName('');
      setCity('');
      setCompetitionId(undefined);
      setLogoUrl(null);
      setNote('');
      await mine.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSending(false);
    }
  }

  const requests = mine.data ?? [];

  return (
    <View style={{ padding: S.lg }}>
      {flash ? (
        <Card style={{ borderColor: 'rgba(43,196,138,0.4)', marginBottom: S.md }}>
          <Text style={{ color: C.green, fontSize: 13 }}>{flash}</Text>
        </Card>
      ) : null}

      <Text style={{ color: C.dim, fontSize: 12.5, lineHeight: 18 }}>
        {t('Renseigne les informations de ton club. La fédération valide la demande, crée l’équipe et l’inscrit à la compétition choisie.')}
      </Text>

      <View style={{ marginTop: S.lg }}>
        <ImageField label={t('Logo du club')} value={logoUrl} onChange={setLogoUrl} folder="clubs" shape="square" />
      </View>

      <Field label={t('Nom du club')} placeholder={t('Ex. Étoile de Conakry')} value={clubName} onChangeText={setClubName} />
      <Field label={t('Ville')} placeholder={t('Conakry')} value={city} onChangeText={setCity} />

      <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, marginBottom: 6 }}>{t('Catégorie')}</Text>
      <ChipSelect
        options={CATEGORIES.map((c) => ({ id: c, label: catLabel(c, t) }))}
        value={category}
        onChange={(v) => setCategory(v as Category)}
        wrap
      />

      <Text style={{ color: C.muted, fontSize: 12, marginTop: 12, marginBottom: 6 }}>{t('Compétition visée')}</Text>
      {(competitions.data ?? []).length === 0 ? (
        <Text style={{ color: C.dim, fontSize: 12 }}>{t('Aucune compétition ouverte pour le moment.')}</Text>
      ) : (
        <ChipSelect
          options={(competitions.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
          value={competitionId}
          onChange={setCompetitionId}
          wrap
        />
      )}
      {season.data ? (
        <Text style={{ color: C.dim, fontSize: 11.5, marginTop: 6 }}>
          {t('Saison {name}', { name: season.data.name })}
        </Text>
      ) : null}

      <SectionTitle title={t('Personne à contacter')} />
      <Field label={t('Nom du responsable')} placeholder={t('Prénom et nom')} value={contactName} onChangeText={setContactName} />
      <Field
        label={t('Téléphone')}
        placeholder="+224 6XX XX XX XX"
        keyboardType="phone-pad"
        value={contactPhone}
        onChangeText={setContactPhone}
      />
      <Field
        label={t('E-mail')}
        placeholder="club@exemple.gn"
        keyboardType="email-address"
        autoCapitalize="none"
        value={contactEmail}
        onChangeText={setContactEmail}
      />
      <Field
        label={t('Message')}
        placeholder={t('Précisions utiles à la fédération')}
        value={note}
        onChangeText={setNote}
        multiline
        style={{ minHeight: 80, paddingTop: 11 }}
      />

      {error ? <Text style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{error}</Text> : null}
      <Button title={t('Envoyer la demande')} icon="send-outline" onPress={send} loading={sending} />

      <SectionTitle title={t('Mes demandes')} />
      {requests.length === 0 ? (
        <Text style={{ color: C.dim, fontSize: 12.5, marginTop: 4 }}>
          {mine.loading ? t('Chargement…') : t('Tu n’as pas encore déposé de demande.')}
        </Text>
      ) : (
        <View style={{ gap: 10, marginTop: 4 }}>
          {requests.map((r) => (
            <MyRequest
              key={r.id}
              clubName={r.club_name}
              city={r.city}
              category={r.category}
              competition={r.competition?.name ?? null}
              logoUrl={r.logo_url}
              status={r.status}
              createdAt={r.created_at}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function MyRequest({
  clubName,
  city,
  category,
  competition,
  logoUrl,
  status,
  createdAt,
}: {
  clubName: string;
  city: string | null;
  category: Category;
  competition: string | null;
  logoUrl: string | null;
  status: RegistrationStatus;
  createdAt: string;
}) {
  const { t } = useT();
  const label: Record<RegistrationStatus, string> = {
    pending: t('En attente'),
    approved: t('Approuvée'),
    rejected: t('Rejetée'),
  };
  const tone = status === 'approved' ? 'green' : status === 'rejected' ? 'red' : 'accent';

  return (
    <Card>
      <Row style={{ gap: 12 }}>
        <Crest label={clubName.slice(0, 2).toUpperCase()} color={C.surface2} size={34} image={logoUrl} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{clubName}</Text>
          <Text style={{ color: C.dim, fontSize: 12 }}>
            {[city, catLabel(category, t), competition].filter(Boolean).join(' · ')}
          </Text>
          <Row style={{ gap: 8, marginTop: 2 }}>
            <Pill label={label[status]} tone={tone} dot />
            <Text style={{ color: C.dim, fontSize: 11.5 }}>{fullDate(createdAt)}</Text>
          </Row>
        </View>
      </Row>
    </Card>
  );
}
