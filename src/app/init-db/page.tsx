'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, Loader2, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const REQUIRED_FILES = ['matrice.csv', 'Param.csv', 'vidange.csv', 'suivi_curatif.csv', 'consolide.csv'];

export default function InitDbPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!REQUIRED_FILES.includes(file.name)) {
          toast({
            variant: 'destructive',
            title: 'Fichier invalide',
            description: `${file.name} n'est pas un fichier CSV autorisé.`,
          });
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload-csv', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (result.success) {
          setUploadedFiles(prev => new Set([...prev, file.name]));
          toast({
            title: 'Succès',
            description: `${file.name} uploadé avec succès`,
          });
        } else {
          toast({
            variant: 'destructive',
            title: 'Erreur',
            description: result.message,
          });
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleInitDb = async () => {
    if (uploadedFiles.size === 0) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Veuillez d\'abord uploader les fichiers CSV.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/init-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

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
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: error.message || 'Erreur lors de l\'initialisation',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Initialisation de la base de données</h1>
        <p className="text-muted-foreground">Importez les données initiales depuis les fichiers CSV.</p>
      </header>

      <main className="space-y-6">
        {/* Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle>Étape 1: Upload des fichiers CSV</CardTitle>
            <CardDescription>
              Uploadez les fichiers CSV suivants (cliquez pour sélectionner plusieurs fichiers):
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2">
              {REQUIRED_FILES.map(fileName => (
                <div key={fileName} className="flex items-center justify-between p-2 border rounded">
                  <span className="text-sm">{fileName}</span>
                  {uploadedFiles.has(fileName) ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-gray-300" />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400">
                <div className="flex flex-col items-center justify-center">
                  <Upload className="h-8 w-8 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-600">
                    Cliquez pour sélectionner les fichiers CSV
                  </p>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Initialize Card */}
        <Card>
          <CardHeader>
            <CardTitle>Étape 2: Initialiser la base de données</CardTitle>
            <CardDescription>
              Une fois tous les fichiers uploadés, cliquez sur le bouton pour créer la base de données et importer les données.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button onClick={handleInitDb} disabled={isLoading || uploadedFiles.size === 0}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Initialisation...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Initialiser
                </>
              )}
            </Button>
            <p className="text-sm text-gray-500">
              {uploadedFiles.size === 0 ? '⚠️ Uploadez les fichiers d\'abord' : `✅ ${uploadedFiles.size}/${REQUIRED_FILES.length} fichiers prêts`}
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

