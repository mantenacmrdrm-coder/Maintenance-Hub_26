import { notFound } from 'next/navigation';
import {
  getEquipmentDetails,
  getHistoryForEquipment,
  getPreventativeHistoryForEquipment,
  getCurativeHistoryForEquipment,
  getEquipmentDynamicStatus,
} from '@/lib/data';
import { EquipmentDetailClientView } from './equipment-detail-client-view';
import type { Equipment, Operation, PreventativeMaintenanceEntry, CurativeMaintenanceEntry } from '@/lib/types';


type Props = {
  params: { matricule: string };
};

export default async function EquipmentDetailPage({ params }: Props) {
  const { matricule } = params;
  
  const [equipment, operations, preventativeHistory, curativeHistory, dynamicStatus] = await Promise.all([
    getEquipmentDetails(matricule),
    getHistoryForEquipment(matricule),
    getPreventativeHistoryForEquipment(matricule),
    getCurativeHistoryForEquipment(matricule),
    getEquipmentDynamicStatus(matricule)
  ]);

  if (!equipment) {
    notFound();
  }

  return (
    <EquipmentDetailClientView
      equipment={equipment as Equipment}
      operations={operations as Operation[]}
      preventativeHistory={preventativeHistory as Record<string, PreventativeMaintenanceEntry[]>}
      curativeHistory={curativeHistory as CurativeMaintenanceEntry[]}
      dynamicStatus={dynamicStatus as 'En Marche' | 'En Panne' | 'Actif'}
    />
  );
}
