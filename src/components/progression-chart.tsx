import { useState } from 'react';
import { Text, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { ChipSelect } from '@/components/chip-select';
import { Card } from '@/components/ui';
import { getPlayerProgression } from '@/lib/db-shots';
import { useT } from '@/lib/i18n';
import { C } from '@/lib/theme';
import type { ProgressionPoint } from '@/lib/types';
import { useFetch } from '@/lib/useFetch';

type Metric = 'points' | 'rebounds' | 'assists';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'points', label: 'Points' },
  { id: 'rebounds', label: 'Rebonds' },
  { id: 'assists', label: 'Passes' },
];

/** Évolution d'un joueur match par match, avec sa moyenne en pointillés. */
export function ProgressionChart({ playerId, limit = 10 }: { playerId: string; limit?: number }) {
  const { t } = useT();
  const [metric, setMetric] = useState<Metric>('points');
  const { data, loading, error } = useFetch(() => getPlayerProgression(playerId, limit), [playerId, limit]);

  // Le RPC renvoie du plus récent au plus ancien : on remet dans l'ordre
  // chronologique pour que la courbe se lise de gauche à droite.
  const rows = [...(data ?? [])].reverse();
  const points = rows.map((r: ProgressionPoint) => ({
    label: r.opponent ?? '—',
    value: r[metric] ?? 0,
  }));
  const average =
    points.length > 0 ? points.reduce((sum, p) => sum + p.value, 0) / points.length : undefined;

  return (
    <Card>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '600', marginBottom: 10 }}>
        {t('Progression')}
      </Text>

      <ChipSelect
        options={METRICS.map((m) => ({ id: m.id, label: t(m.label) }))}
        value={metric}
        onChange={(id) => setMetric(id as Metric)}
      />

      <View style={{ marginTop: 10 }}>
        {error ? (
          <Text style={{ color: C.dim, fontSize: 12.5 }}>{t('Progression indisponible pour le moment.')}</Text>
        ) : loading && points.length === 0 ? (
          <Text style={{ color: C.dim, fontSize: 12.5 }}>{t('Chargement…')}</Text>
        ) : points.length === 0 ? (
          <Text style={{ color: C.dim, fontSize: 12.5 }}>
            {t('Aucun match joué pour l’instant.')}
          </Text>
        ) : (
          <>
            <LineChart data={points} average={average} />
            <Text style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>
              {t('Moyenne sur {n} match(s) : {v}', {
                n: points.length,
                v: (average ?? 0).toFixed(1),
              })}
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}
