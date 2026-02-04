'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { initializeDatabase } from '@/lib/actions/maintenance-actions';


export default function InitDbPage() {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleInitDb = () => {
    startTransition(async () => {
      const result = await initializeDatabase();
      if (result.success) {
        toast({
          title: 'Succès',
          description: result.message,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Erreur',
          description: result.message,
        });
      }
    });
  };


  return (
     <div className="flex flex-col gap-8">
        <header>
            <h1 className="text-3xl font-bold tracking-tight">Initialisation de la base de données</h1>
            <p className="text-muted-foreground">Importez les données initiales depuis les fichiers CSV.</p>
        </header>

        <main>
             <Card>
                <CardHeader>
                <CardTitle>Démarrage</CardTitle>
                 <CardDescription>
                    Cliquez sur le bouton ci-dessous pour créer la base de données SQLite et y importer les données depuis les fichiers CSV situés dans le dossier `/public/import`.
                    <br />
                    Cette opération ne doit être exécutée qu'une seule fois.
                </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-wrap gap-4'>
                    <Button onClick={handleInitDb} disabled={isPending}>
                    {isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Database className="mr-2 h-4 w-4" />
                    )}
                    Lancer l'Initialisation
                    </Button>
                </CardContent>
            </Card>
        </main>
    </div>
  );
}
