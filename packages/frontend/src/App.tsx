import { AlertTriangle } from 'lucide-react';

import { Approvals } from '@/atlas/pages/Approvals';
import { Audit } from '@/atlas/pages/Audit';
import { Bulk } from '@/atlas/pages/Bulk';
import { EquipmentPage } from '@/atlas/pages/Equipment';
import { EquipmentIQ } from '@/atlas/pages/EquipmentIQ';
import { NewEquipment } from '@/atlas/pages/NewEquipment';
import { Overview } from '@/atlas/pages/Overview';
import { Quality } from '@/atlas/pages/Quality';
import { Requests } from '@/atlas/pages/Requests';
import { SapSync } from '@/atlas/pages/SapSync';
import { Shell, useRoute, type Route } from '@/atlas/Shell';
import { AtlasProvider, useAtlas } from '@/atlas/store';
import { Button, Card } from '@/atlas/ui';

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'equipment':
      return <EquipmentPage key={route.equipmentNumber ?? `list-${route.q ?? ''}`} equipmentNumber={route.equipmentNumber} q={route.q} />;
    case 'approvals':
      return <Approvals requestCode={route.requestCode} unit={route.unit} />;
    case 'requests':
      return <Requests requestCode={route.requestCode} />;
    case 'new':
      return <NewEquipment />;
    case 'iq':
      return <EquipmentIQ />;
    case 'bulk':
      return <Bulk />;
    case 'quality':
      return <Quality />;
    case 'sap':
      return <SapSync />;
    case 'audit':
      return <Audit />;
    default:
      return <Overview />;
  }
}

function Content() {
  const route = useRoute();
  const { state, reloadAll } = useAtlas();

  return (
    <Shell route={route}>
      {state.kind === 'loading' ? (
        <div className="grid min-h-[50vh] place-items-center" role="status">
          <div className="text-center">
            <div aria-hidden className="mx-auto mb-400 h-[6px] w-[160px] overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            </div>
            <p className="text-300 text-muted-foreground">{state.step}</p>
          </div>
        </div>
      ) : state.kind === 'error' ? (
        <Card className="mx-auto max-w-[640px] p-600">
          <div className="flex gap-400">
            <AlertTriangle aria-hidden className="icon-size-400 shrink-0 text-destructive" />
            <div>
              <h2 className="font-heading text-600 font-semibold">
                {state.where === 'lakehouse' ? 'Couldn’t read the ATLAS Lakehouse' : 'Couldn’t load app data'}
              </h2>
              <p className="mt-200 text-300 text-muted-foreground">
                {state.where === 'lakehouse'
                  ? 'Check that the notebook has written gold_equipment_master and gold_equipment_alias, the SQL endpoint has refreshed, and the atlaslakehouse connector is deployed.'
                  : 'The app database did not respond as expected. Redeploy with `npx rayfin up`, then retry.'}
              </p>
              <p className="mt-300 rounded-lg bg-muted p-300 font-monospace text-200">{state.message}</p>
              <div className="mt-400">
                <Button onClick={() => void reloadAll()}>Try again</Button>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Page route={route} />
      )}
    </Shell>
  );
}

function App() {
  return (
    <AtlasProvider>
      <Content />
    </AtlasProvider>
  );
}

export default App;
