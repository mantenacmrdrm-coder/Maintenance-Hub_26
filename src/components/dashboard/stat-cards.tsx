import {
  Wrench,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { DashboardData } from '@/lib/types';
import dayjs from 'dayjs';

type StatCardProps = {
  title: string;
  value: string;
  icon: React.ElementType;
  iconContainerClass: string;
  description?: string;
};

function StatCard({ title, value, icon: Icon, iconContainerClass, description }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{title}</p>
          <p className="stat-value">{value}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className={`icon-container ${iconContainerClass}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

export function StatCards({ data }: { data: DashboardData }) {
    
  const completionRate = data.followUpStats && data.followUpStats.totalPlanifie > 0
    ? Math.round((data.followUpStats.totalRealise / data.followUpStats.totalPlanifie) * 100)
    : 0;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Équipements"
        value={data.equipmentCount.toLocaleString('fr-FR')}
        icon={Wrench}
        iconContainerClass="icon-container-primary"
        description='Total dans la flotte'
      />
      <StatCard
        title="Opérations Curatives"
        value={data.operationCount.toLocaleString('fr-FR')}
        icon={ClipboardList}
        iconContainerClass="icon-container-accent"
        description='Total enregistrées'
      />
      <StatCard
        title="Taux de Réalisation"
        value={`${completionRate}%`}
        icon={CheckCircle2}
        iconContainerClass="icon-container-success"
        description={`Préventif pour ${data.year}`}
      />
       <StatCard
        title="Pannes ce Mois-ci"
        value={data.breakdownsThisMonth !== null ? data.breakdownsThisMonth.toLocaleString('fr-FR') : '-'}
        icon={AlertTriangle}
        iconContainerClass="icon-container-destructive"
        description={data.breakdownsThisMonth !== null ? `En ${dayjs().format('MMM')}`: 'Année passée'}
      />
    </div>
  );
}
