import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Card, Header, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { C, S } from '@/lib/theme';

const QUICK: { icon: keyof typeof Ionicons.glyphMap; label: string; href: string; color: string }[] = [
  { icon: 'create-outline', label: 'Saisir un score', href: '/admin/matches', color: C.accent },
  { icon: 'grid-outline', label: 'Générer le calendrier', href: '/admin/calendar-gen', color: C.accent },
  { icon: 'newspaper-outline', label: 'Actualité', href: '/admin/news-form', color: C.green },
];

interface Entry {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  href: string;
}

const SPORT: Entry[] = [
  { icon: 'people-outline', title: 'Joueurs', sub: 'Ajouter, modifier, supprimer', href: '/admin/players' },
  { icon: 'shirt-outline', title: 'Équipes & clubs', sub: 'Effectifs, logos, divisions', href: '/admin/teams' },
  { icon: 'trophy-outline', title: 'Compétitions', sub: 'Championnats, coupes, formats', href: '/admin/competitions' },
  { icon: 'calendar-number-outline', title: 'Saisons', sub: 'Créer une saison, définir la saison en cours', href: '/admin/seasons' },
  { icon: 'clipboard-outline', title: 'Matchs & statistiques', sub: 'Scores, box score, vidéos, tirs', href: '/admin/matches' },
  { icon: 'grid-outline', title: 'Générateur de calendrier', sub: 'Créer toutes les journées d’une poule', href: '/admin/calendar-gen' },
];

const ADMINISTRATIF: Entry[] = [
  { icon: 'card-outline', title: 'Licences', sub: 'Valider, suspendre, suivre les échéances', href: '/admin/licenses' },
  { icon: 'swap-horizontal-outline', title: 'Transferts', sub: 'Mutations entre clubs', href: '/admin/transfers' },
  { icon: 'business-outline', title: 'Inscriptions des clubs', sub: 'Demandes d’engagement en compétition', href: '/admin/registrations' },
  { icon: 'people-circle-outline', title: 'Arbitres', sub: 'Annuaire et coordonnées', href: '/admin/referees' },
  { icon: 'warning-outline', title: 'Discipline', sub: 'Avertissements, suspensions, amendes', href: '/admin/sanctions' },
];

const CONTENUS: Entry[] = [
  { icon: 'newspaper-outline', title: 'Actualités', sub: 'Publier, modifier, supprimer', href: '/admin/news' },
  { icon: 'images-outline', title: 'Photos', sub: 'Galeries par match ou par album', href: '/admin/photos' },
  { icon: 'calendar-outline', title: 'Agenda', sub: 'Assemblées, stages, cérémonies', href: '/admin/events' },
  { icon: 'mic-outline', title: 'Médiathèque', sub: 'Interviews, podcasts, reportages', href: '/admin/media' },
];

const COMMUNAUTE: Entry[] = [
  { icon: 'megaphone-outline', title: 'Sondages', sub: 'Fan zone : créer, clore, supprimer', href: '/admin/polls' },
  { icon: 'help-circle-outline', title: 'Quiz', sub: 'Questions, bonnes réponses, activation', href: '/admin/quizzes' },
  { icon: 'shield-checkmark-outline', title: 'Modération', sub: 'Signalements, bannissements, mots interdits', href: '/admin/moderation' },
];

const INSTITUTION: Entry[] = [
  { icon: 'ribbon-outline', title: 'Partenaires', sub: 'Sponsors affichés dans l’application', href: '/admin/sponsors' },
  { icon: 'information-circle-outline', title: 'Infos fédération', sub: 'À propos, contacts, réseaux sociaux', href: '/admin/federation-settings' },
];

const SECTIONS: { title: string; items: Entry[] }[] = [
  { title: 'Compétition', items: SPORT },
  { title: 'Administratif', items: ADMINISTRATIF },
  { title: 'Contenus', items: CONTENUS },
  { title: 'Communauté', items: COMMUNAUTE },
  { title: 'Institution', items: INSTITUTION },
];

export default function AdminDashboard() {
  const { t } = useT();

  return (
    <Screen>
      <Header
        title={t('Fédération')}
        left={
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
        right={<Pill label="Admin" tone="accent" />}
      />

      <View style={{ flexDirection: 'row', gap: 9, padding: S.lg }}>
        {QUICK.map((q) => (
          <Pressable key={q.label} style={{ flex: 1 }} onPress={() => router.push(q.href as never)}>
            <Card style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Ionicons name={q.icon} size={22} color={q.color} />
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 7, textAlign: 'center' }}>
                {t(q.label)}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>

      {SECTIONS.map((section) => (
        <View key={section.title}>
          <SectionTitle title={t(section.title)} />
          <View style={{ paddingHorizontal: S.lg }}>
            <Card style={{ paddingVertical: 4 }}>
              {section.items.map((m, i) => (
                <Pressable key={m.title} onPress={() => router.push(m.href as never)}>
                  <Row
                    style={{
                      paddingVertical: 13,
                      gap: 13,
                      borderBottomWidth: i < section.items.length - 1 ? 1 : 0,
                      borderBottomColor: C.border,
                    }}>
                    <Ionicons name={m.icon} size={20} color={C.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 14 }}>{t(m.title)}</Text>
                      <Text style={{ color: C.dim, fontSize: 12 }}>{t(m.sub)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.dim} />
                  </Row>
                </Pressable>
              ))}
            </Card>
          </View>
        </View>
      ))}
    </Screen>
  );
}
