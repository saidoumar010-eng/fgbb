import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { Ellipse } from 'react-native-svg';

import { ChipSelect, type Option } from '@/components/chip-select';
import {
  COURT,
  Court,
  courtHeight,
  dotRadii,
  isBeyondArc,
  strokeUnits,
  suggestedPoints,
  toNorm,
} from '@/components/court';
import { Button, Card, Empty, Header, Row, Screen } from '@/components/ui';
import { getMatch, getTeamPlayers } from '@/lib/db';
import { addShot, deleteShot, listShots } from '@/lib/db-shots';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Player, Shot } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

// Saisie de la carte des tirs d'un match. Chaque toucher du terrain enregistre
// immédiatement un tir : pendant un match on n'a pas le temps de valider un
// formulaire. L'insertion est optimiste (le point apparaît tout de suite) et
// annulée si Supabase refuse.

/** Type de tir : « auto » laisse la géométrie décider entre 2 et 3 points. */
type ShotMode = 'auto' | '2' | '3' | 'ft';

const QUARTERS = [1, 2, 3, 4, 5];

async function loadEntry(id: string) {
  const m = await getMatch(id);
  const [home, away, shots] = await Promise.all([
    getTeamPlayers(m.home_team_id),
    getTeamPlayers(m.away_team_id),
    listShots(id),
  ]);
  return { m, home, away, shots };
}

const isPending = (s: Shot) => s.id.startsWith('temp-');

export default function ShotEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const { data, loading } = useFetch(() => loadEntry(id), [id]);

  const [shots, setShots] = useState<Shot[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [made, setMade] = useState(true);
  const [mode, setMode] = useState<ShotMode>('auto');
  const [quarter, setQuarter] = useState(1);
  const [width, setWidth] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);
  const tempSeq = useRef(0);

  // Une seule initialisation : un rechargement ne doit pas écraser les tirs
  // saisis depuis (l'écran tient sa propre liste pour rester instantané).
  useEffect(() => {
    if (data && !seeded.current) {
      setShots(data.shots);
      setTeamId(data.m.home_team_id);
      // `current_quarter` vaut 0 avant l'entre-deux : on retombe sur le 1er QT.
      const q = data.m.current_quarter ?? 0;
      setQuarter(q >= 1 && q <= 5 ? q : 1);
      seeded.current = true;
    }
  }, [data]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
  };

  if (!data) {
    return (
      <Screen>
        <Head title={t('Carte des tirs')} />
        <Empty
          icon="basketball-outline"
          title={loading ? t('Chargement…') : t('Match introuvable')}
        />
      </Screen>
    );
  }

  const roster: Player[] = teamId === data.m.away_team_id ? data.away : data.home;
  const player = roster.find((p) => p.id === playerId) ?? null;
  const noPlayers = data.home.length === 0 && data.away.length === 0;

  /**
   * Cœur de l'écran : le point touché est exprimé dans le repère de la vue
   * tactile, qui a exactement la taille du SVG (width × courtHeight(width)).
   * `toNorm` fait la seule conversion autorisée vers le repère 0–100.
   */
  async function onCourtTouch(px: number, py: number) {
    if (!playerId || !teamId) {
      setError(t('Choisis d’abord une équipe et un joueur.'));
      return;
    }
    // Le terrain n'est rendu qu'une fois mesuré : sans cette garde, une largeur
    // nulle produirait des coordonnées NaN enregistrées telles quelles.
    if (width <= 0) return;
    const { x, y } = toNorm(px, py, width);
    // En « auto », la marge de 40 cm autour de la ligne laisse `suggestedPoints`
    // sans avis : on tranche alors par le côté de la ligne.
    const points: 1 | 2 | 3 =
      mode === 'ft' ? 1 : mode === '2' ? 2 : mode === '3' ? 3 : (suggestedPoints(x, y) ?? (isBeyondArc(x, y) ? 3 : 2));

    const temp: Shot = {
      // Compteur plutôt qu'horodatage : deux tirs rapprochés ne doivent jamais
      // partager la même clé le temps de l'aller-retour serveur.
      id: `temp-${(tempSeq.current += 1)}`,
      match_id: id,
      player_id: playerId,
      team_id: teamId,
      x,
      y,
      points,
      made,
      quarter,
      created_at: new Date().toISOString(),
      player: player ?? undefined,
    };

    setError(null);
    setShots((prev) => [temp, ...prev]);
    try {
      const saved = await addShot({
        match_id: id,
        player_id: playerId,
        team_id: teamId,
        x,
        y,
        points,
        made,
        quarter,
      });
      setShots((prev) => prev.map((s) => (s.id === temp.id ? saved : s)));
    } catch (e) {
      setShots((prev) => prev.filter((s) => s.id !== temp.id));
      setError(e instanceof Error ? e.message : t('Le tir n’a pas pu être enregistré.'));
    }
  }

  async function remove(shotId: string) {
    setBusyId(shotId);
    setError(null);
    try {
      await deleteShot(shotId);
      setShots((prev) => prev.filter((s) => s.id !== shotId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Le tir n’a pas pu être supprimé.'));
    } finally {
      setBusyId(null);
    }
  }

  // Un tir encore en cours d'insertion n'a pas d'id réel : rien à supprimer.
  const lastSaved = shots.find((s) => !isPending(s)) ?? null;

  const teamOptions: Option[] = [
    { id: data.m.home_team_id, label: data.m.home_team?.name ?? t('Domicile') },
    { id: data.m.away_team_id, label: data.m.away_team?.name ?? t('Extérieur') },
  ];
  const playerOptions: Option[] = roster.map((p) => ({
    id: p.id,
    label: `${p.number != null ? `#${p.number} ` : ''}${p.full_name}`,
  }));
  const modeOptions: Option[] = [
    { id: 'auto', label: t('Auto') },
    { id: '2', label: t('2 pts') },
    { id: '3', label: t('3 pts') },
    { id: 'ft', label: t('Lancer franc') },
  ];
  const quarterOptions: Option[] = QUARTERS.map((q) => ({
    id: String(q),
    label: q === 5 ? t('Prol.') : `Q${q}`,
  }));

  const visible = showAll ? shots : shots.slice(0, 10);

  return (
    <Screen>
      <Head title={t('Carte des tirs')} />

      {noPlayers ? (
        <View style={{ padding: S.lg }}>
          <Card>
            <Text style={{ color: C.dim, fontSize: 13, lineHeight: 19 }}>
              {t('Aucun joueur dans les effectifs de ces équipes. Ajoute d’abord des joueurs (Gestion → Joueurs).')}
            </Text>
          </Card>
        </View>
      ) : (
        <View style={{ padding: S.lg, gap: 14 }}>
          <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>
            {`${data.m.home_team?.name ?? '—'} — ${data.m.away_team?.name ?? '—'}`}
          </Text>

          <Group label={t('Équipe')}>
            <ChipSelect
              options={teamOptions}
              value={teamId}
              onChange={(v) => {
                setTeamId(v);
                // Le joueur sélectionné appartient à l'autre effectif.
                setPlayerId(null);
              }}
            />
          </Group>

          <Group label={t('Joueur')}>
            {playerOptions.length === 0 ? (
              <Text style={{ color: C.dim, fontSize: 12.5 }}>
                {t('Aucun joueur dans cet effectif.')}
              </Text>
            ) : (
              <ChipSelect options={playerOptions} value={playerId} onChange={setPlayerId} wrap />
            )}
          </Group>

          <Group label={t('Résultat')}>
            <Row style={{ gap: 10 }}>
              <ResultButton
                label={t('Réussi')}
                color={C.accent}
                active={made}
                onPress={() => setMade(true)}
              />
              <ResultButton
                label={t('Manqué')}
                color={C.red}
                active={!made}
                onPress={() => setMade(false)}
              />
            </Row>
          </Group>

          <Group label={t('Type de tir')}>
            <ChipSelect options={modeOptions} value={mode} onChange={(v) => setMode(v as ShotMode)} />
            {mode === 'auto' ? (
              <Text style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>
                {t('2 ou 3 points sont déduits de la zone touchée. Force la valeur si l’action en décide autrement.')}
              </Text>
            ) : null}
          </Group>

          <Group label={t('Quart-temps')}>
            <ChipSelect
              options={quarterOptions}
              value={String(quarter)}
              onChange={(v) => setQuarter(Number(v))}
            />
          </Group>

          <Card style={{ paddingVertical: 10 }}>
            <Text style={{ color: C.dim, fontSize: 11.5, marginBottom: 3 }}>{t('Prochain tir')}</Text>
            <Text style={{ color: player ? C.text : C.dim, fontSize: 13.5, fontWeight: '600' }}>
              {player
                ? `${player.number != null ? `#${player.number} ` : ''}${player.full_name} · ${
                    made ? t('Réussi') : t('Manqué')
                  } · ${modeOptions.find((o) => o.id === mode)?.label} · ${
                    quarter === 5 ? t('Prol.') : `Q${quarter}`
                  }`
                : t('Choisis un joueur pour commencer.')}
            </Text>
          </Card>

          <View>
            <Text style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
              {t('Touche le terrain à l’endroit exact du tir.')}
            </Text>
            <View onLayout={onLayout}>
              {width > 0 ? (
                <View
                  // La vue tactile et le SVG partagent la même boîte : c'est ce
                  // qui garantit que le point tombe là où l'admin a touché.
                  style={{ width, height: courtHeight(width) }}
                  onStartShouldSetResponder={() => true}
                  onResponderRelease={(e) =>
                    onCourtTouch(e.nativeEvent.locationX, e.nativeEvent.locationY)
                  }>
                  {/* Sans pointerEvents="none", le SVG deviendrait la cible du
                      toucher et locationX/locationY changeraient de repère. */}
                  <View pointerEvents="none">
                    <Court width={width}>
                      {shots.map((s) => (
                        <Dot key={s.id} shot={s} width={width} />
                      ))}
                    </Court>
                  </View>
                </View>
              ) : (
                <View style={{ width: '100%', aspectRatio: 1 / COURT.ratio }} />
              )}
            </View>
          </View>

          {error ? <Text style={{ color: C.red, fontSize: 13 }}>{error}</Text> : null}

          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: C.dim, fontSize: 12 }}>
              {t('{n} tir(s) saisi(s)', { n: shots.length })}
            </Text>
          </Row>

          <Button
            title={t('Annuler le dernier tir')}
            tone="alt"
            icon="arrow-undo-outline"
            disabled={!lastSaved || busyId !== null}
            onPress={() => lastSaved && remove(lastSaved.id)}
          />

          <Counters shots={shots} rosterHome={data.home} rosterAway={data.away} />

          {shots.length > 0 ? (
            <View>
              <Text style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
                {t('Tirs saisis (du plus récent au plus ancien)')}
              </Text>
              <View style={{ gap: 6 }}>
                {visible.map((s) => (
                  <ShotRow
                    key={s.id}
                    shot={s}
                    busy={busyId === s.id}
                    onDelete={() => remove(s.id)}
                  />
                ))}
              </View>
              {shots.length > 10 ? (
                <Pressable onPress={() => setShowAll((v) => !v)} style={{ paddingVertical: 10 }}>
                  <Text style={{ color: C.accent, fontSize: 12.5, fontWeight: '600' }}>
                    {showAll ? t('Réduire la liste') : t('Afficher les {n} tirs', { n: shots.length })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function Head({ title }: { title: string }) {
  return (
    <Header
      title={title}
      left={
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={C.muted} />
        </Pressable>
      }
    />
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>{label}</Text>
      {children}
    </View>
  );
}

function ResultButton({
  label,
  color,
  active,
  onPress,
}: {
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: R.md,
        borderWidth: 1,
        borderColor: active ? color : C.border,
        backgroundColor: active ? color : 'transparent',
      }}>
      <Text style={{ color: active ? C.accentText : C.muted, fontSize: 14, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Tir sur le terrain, dans le repère 0–100 : vert plein réussi, rouge creux manqué. */
function Dot({ shot, width }: { shot: Shot; width: number }) {
  const { rx, ry } = dotRadii(4.6, width);
  const opacity = isPending(shot) ? 0.45 : 1;
  if (shot.made) {
    return <Ellipse cx={shot.x} cy={shot.y} rx={rx} ry={ry} fill={C.accent} opacity={opacity} />;
  }
  return (
    <Ellipse
      cx={shot.x}
      cy={shot.y}
      rx={rx}
      ry={ry}
      fill="none"
      stroke={C.red}
      strokeWidth={strokeUnits(1.8, width)}
      opacity={opacity}
    />
  );
}

function ShotRow({ shot, busy, onDelete }: { shot: Shot; busy: boolean; onDelete: () => void }) {
  const { t } = useT();
  const n = shot.player?.number;
  const label = `${n != null ? `#${n} ` : ''}${shot.player?.full_name ?? t('Joueur inconnu')}`;
  const kind = shot.points === 1 ? t('LF') : shot.points === 3 ? t('3 pts') : t('2 pts');
  const when = shot.quarter === 5 ? t('Prol.') : shot.quarter ? `Q${shot.quarter}` : '';

  return (
    <Card style={{ paddingVertical: 8, paddingHorizontal: 11 }}>
      <Row style={{ gap: 8 }}>
        <View
          style={{
            width: 9,
            height: 9,
            borderRadius: 4.5,
            backgroundColor: shot.made ? C.accent : 'transparent',
            borderWidth: shot.made ? 0 : 1.5,
            borderColor: C.red,
          }}
        />
        <Text style={{ color: C.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ color: C.dim, fontSize: 11.5 }}>
          {[kind, shot.made ? t('Réussi') : t('Manqué'), when].filter(Boolean).join(' · ')}
        </Text>
        {isPending(shot) ? (
          <ActivityIndicator size="small" color={C.dim} />
        ) : (
          <Pressable onPress={onDelete} disabled={busy} hitSlop={8}>
            {busy ? (
              <ActivityIndicator size="small" color={C.dim} />
            ) : (
              <Ionicons name="trash-outline" size={16} color={C.red} />
            )}
          </Pressable>
        )}
      </Row>
    </Card>
  );
}

/** Réussis / tentés par joueur, pour vérifier la saisie d'un coup d'œil. */
function Counters({
  shots,
  rosterHome,
  rosterAway,
}: {
  shots: Shot[];
  rosterHome: Player[];
  rosterAway: Player[];
}) {
  const { t } = useT();
  const acc = new Map<string, { made: number; att: number }>();
  shots.forEach((s) => {
    if (!s.player_id) return;
    const cur = acc.get(s.player_id) ?? { made: 0, att: 0 };
    cur.att += 1;
    if (s.made) cur.made += 1;
    acc.set(s.player_id, cur);
  });
  if (acc.size === 0) return null;

  const rows = [...rosterHome, ...rosterAway]
    .filter((p) => acc.has(p.id))
    .map((p) => ({ p, ...acc.get(p.id)! }))
    .sort((a, b) => b.att - a.att);

  return (
    <View>
      <Text style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>{t('Compteur par joueur')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        {rows.map((r, i) => (
          <Row
            key={r.p.id}
            style={{
              paddingVertical: 7,
              gap: 8,
              borderBottomWidth: i < rows.length - 1 ? 1 : 0,
              borderBottomColor: C.border,
            }}>
            <Text style={{ color: C.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
              {`${r.p.number != null ? `#${r.p.number} ` : ''}${r.p.full_name}`}
            </Text>
            <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{`${r.made}/${r.att}`}</Text>
            <Text style={{ color: C.dim, fontSize: 11.5, width: 42, textAlign: 'right' }}>
              {`${Math.round((r.made / r.att) * 100)}%`}
            </Text>
          </Row>
        ))}
      </Card>
    </View>
  );
}
