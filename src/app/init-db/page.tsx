'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { initializeDatabase } from '@/lib/actions/maintenance-actions';
import { UploadCard } from './upload-card';


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

  const fileUploads = [
    { tableName: 'matrice', title: 'Matrice des équipements', description: 'Le fichier principal contenant la liste de tous vos équipements.' },
    { tableName: 'consolide', title: 'Consolidé des consommations', description: 'L\'historique des consommations de lubrifiants.' },
    { tableName: 'suivi_curatif', title: 'Suivi Curatif', description: 'L\'historique des pannes et interventions curatives.' },
    { tableName: 'vidange', title: 'Vidanges', description: 'Ancien historique des vidanges.' },
    { tableName: 'Param', title: 'Paramètres de maintenance', description: 'Intervalles et niveaux pour la maintenance préventive.' },
  ];


  return (
     <div className="flex flex-col gap-8">
        <header>
            <h1 className="text-3xl font-bold tracking-tight">Initialisation & Données</h1>
            <p className="text-muted-foreground">Gérez la structure et les données de base de votre application.</p>
        </header>

        <main className="space-y-8">
             <Card>
                <CardHeader>
                <CardTitle>Initialisation de la Structure</CardTitle>
                 <CardDescription>
                    Cliquez ici pour vérifier la structure de la base de données (tables, index). Cette opération est non-destructive : elle ne crée que les éléments manquants et ne modifie jamais vos données existantes.
                </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-wrap gap-4'>
                    <Button onClick={handleInitDb} disabled={isPending}>
                    {isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Database className="mr-2 h-4 w-4" />
                    )}
                    Vérifier et Initialiser
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Mise à jour des données via CSV</CardTitle>
                    <CardDescription>
                        Chargez un nouveau fichier CSV pour une table spécifique. <span className="font-bold text-destructive">Attention :</span> cette action remplacera entièrement les données de la table correspondante.
                    </CardDescription>
                </CardHeader>
                <CardContent className='grid md:grid-cols-2 lg:grid-cols-3 gap-6'>
                    {fileUploads.map(upload => (
                        <UploadCard
                            key={upload.tableName}
                            tableName={upload.tableName}
                            title={upload.title}
                            description={upload.description}
                        />
                    ))}
                </CardContent>
            </Card>
        </main>
    </div>
  );
}
