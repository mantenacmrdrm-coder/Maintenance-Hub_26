'use client';

import { Droplet } from 'lucide-react';
import type { MonthlyPreventativeStats } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

type Props = {
    data: MonthlyPreventativeStats;
};

export function OilConsumptionStats({ data }: Props) {
    const { totalOil, oilByType } = data;
    
    const sortedOil = Object.entries(oilByType).sort(([, a], [, b]) => b - a);
    
    return (
        <div className="h-full flex flex-col">
            <div className="flex items-start gap-4 mb-4">
                <div className="icon-container icon-container-primary">
                    <Droplet className="h-6 w-6" />
                </div>
                <div>
                    <p className="stat-label">Total Consommé</p>
                    <p className="stat-value">{totalOil.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L</p>
                </div>
            </div>

            <p className="text-sm font-medium mb-2 text-muted-foreground">Consommation par type :</p>
            <ScrollArea className="flex-1 pr-4 h-48">
                <div className="space-y-2">
                    {sortedOil.map(([type, quantity]) => (
                         <div key={type} className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground capitalize">{type.replace(/_/g, ' ').replace('v', 'V')}</span>
                            <span className="font-bold">{quantity.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} L</span>
                        </div>
                    ))}
                    {sortedOil.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center pt-8">Aucune consommation d'huile enregistrée pour cette période.</p>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
