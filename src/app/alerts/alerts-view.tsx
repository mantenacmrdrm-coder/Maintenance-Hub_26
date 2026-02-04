'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getPreventativeAlerts } from '@/lib/actions/maintenance-actions';
import type { Alert } from '@/lib/types';
import { Loader2, AlertTriangle, CheckCircle, Info, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function AlertCard({ alert }: { alert: Alert }) {
  const urgencyConfig = {
    urgent: {
      variant: 'destructive',
      icon: <AlertTriangle className="h-4 w-4" />,
      label: 'Urgent',
    },
    near: {
      variant: 'default',
      icon: <Info className="h-4 w-4" />,
      label: 'Proche',
      className: 'bg-amber-500 text-white',
    },
    planned: {
      variant: 'secondary',
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Planifié',
    },
  }[alert.urgency] || {
    variant: 'outline',
    icon: <Info className="h-4 w-4" />,
    label: alert.urgency,
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{alert.operation}</CardTitle>
        <Badge variant={urgencyConfig.variant as any} className={urgencyConfig.className}>
          {urgencyConfig.icon}
          <span className='ml-2'>{urgencyConfig.label}</span>
        </Badge>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div>
          <p className='font-semibold'>{alert.equipmentDesignation || alert.equipmentId}</p>
          <p className="text-muted-foreground">Échéance: {alert.dueDate}</p>
        </div>
        <Badge variant="secondary">Niveau: {alert.niveau}</Badge>
      </CardContent>
    </Card>
  );
}

export function AlertsView() {
  const [alertWindowDays, setAlertWindowDays] = useState(30);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleGenerateAlerts = () => {
    startTransition(async () => {
      try {
        const result = await getPreventativeAlerts(alertWindowDays);
        setAlerts(result);
        if (result.length > 0) {
          toast({
            title: 'Succès',
            description: `${result.length} alerte(s) générée(s).`,
          });
        }
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Erreur',
          description: error.message || 'Impossible de générer les alertes.',
        });
        setAlerts(null);
      }
    });
  };

  const handleExport = () => {
    if (!alerts || alerts.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Aucune donnée',
        description: 'Il n\'y a aucune alerte à exporter.',
      });
      return;
    }

    const headers = ['Matricule', 'Désignation', 'Opération', 'Échéance', 'Urgence', 'Niveau'];
    const csvContent = [
      headers.join(';'),
      ...alerts.map(alert => [
        `"${alert.equipmentId}"`,
        `"${alert.equipmentDesignation || ''}"`,
        `"${alert.operation}"`,
        `"${alert.dueDate}"`,
        `"${alert.urgency}"`,
        `"${alert.niveau}"`,
      ].join(';'))
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `alertes_maintenance_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Exportation réussie',
      description: `${alerts.length} alertes ont été exportées.`,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-center">
            <label className="min-w-fit">Fenêtre d'alerte : <span className='font-bold text-primary'>{alertWindowDays} jours</span></label>
            <Slider
              value={[alertWindowDays]}
              onValueChange={(value) => setAlertWindowDays(value[0])}
              min={7}
              max={180}
              step={1}
              disabled={isPending}
            />
          </div>
          <Button onClick={handleGenerateAlerts} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Générer les Alertes
          </Button>
        </CardContent>
      </Card>

      {isPending && (
         <div className="flex min-h-[30vh] w-full items-center justify-center rounded-lg bg-muted/50">
            <div className='text-center space-y-2'>
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className='font-medium'>Analyse des données...</p>
                <p className='text-sm text-muted-foreground'>Cela peut prendre quelques instants.</p>
            </div>
        </div>
      )}

      {!isPending && alerts !== null && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Résultats</CardTitle>
              {alerts.length > 0 && (
                <Button onClick={handleExport} variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Exporter la liste
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {alerts.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {alerts.map((alert, index) => (
                  <AlertCard key={index} alert={alert} />
                ))}
              </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center bg-muted/50 rounded-lg">
                    <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                    <p className="text-lg font-medium">Tout est en ordre !</p>
                    <p className="text-muted-foreground">Aucune alerte de maintenance préventive générée pour la période sélectionnée.</p>
                </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
