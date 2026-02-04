import { getAllEquipment } from '@/lib/data';
import { EquipmentDataTable } from './data-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

export default async function EquipmentPage() {
  const equipments = await getAllEquipment();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Équipements</h1>
        <p className="text-muted-foreground">
          Gérez et consultez la liste de vos équipements.
        </p>
      </header>
       <main>
        {equipments.length > 0 ? (
          <EquipmentDataTable data={equipments} />
        ) : (
          <Alert variant="default" className="bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 !text-amber-600" />
            <AlertTitle className="text-amber-800 font-semibold">Aucune donnée trouvée</AlertTitle>
            <AlertDescription className="text-amber-700">
              La base de données n'a pas encore été initialisée ou la table `matrice` est vide.
              Allez au <a href="/" className="font-bold underline">Tableau de bord</a> pour initialiser la base de données.
            </AlertDescription>
          </Alert>
        )}
      </main>
    </div>
  );
}
