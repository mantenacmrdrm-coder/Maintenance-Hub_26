

export type Equipment = {
  id: number;
  matricule: string;
  marque: string;
  categorie: string;
  designation: string;
  date_achat: string;
  km_heures_actuel: number;
  statut: 'actif' | 'inactif';
  [key: string]: any; // To allow for dynamic properties like 'Niveau'
};

export type Operation = {
  id: number;
  matricule: string;
  operation: string;
  date_programmee: string;
  date_realisation: string | null;
  intervalle_jours?: number | null;
  nature: string;
  niveau: string;
  // Fields for export
  date_entree?: string;
  panne_declaree?: string;
  sitactuelle?: string;
  pieces?: string;
  date_sortie?: string;
  intervenant?: string;
  affectation?: string;
  type_de_panne?: string;
  designation?: string;
};

export type ScheduledOperation = {
  nature: string;
  date_programmee: string;
  [key: string]: any;
};

export type EquipmentStats = {
  matricule: string;
  total_operations: number;
  operations_realisees: number;
  operations_en_retard: number;
  taux_reussite: number;
  derniere_maj: string;
};

export type GlobalStats = {
  total_operations: number;
  realisees: number;
  programmees: number;
  en_retard: number;
  hors_planning: number;
  taux_reussite: number;
};

export type Alert = {
  equipmentId: string;
  equipmentDesignation?: string;
  operation: string;
  dueDate: string;
  urgency: string;
  niveau: string;
};

export type PlanningEntry = {
  matricule: string;
  entretien: string;
  date_programmee: string;
  nature: string;
  niveau: string;
  [key: string]: any;
};

export type PlanningMatrixRow = {
  [entretien: string]: {
    date: string;
    status: 'Programmé' | 'Réalisé' | 'En retard';
  } | undefined;
};

export type PlanningMatrix = {
  headers: readonly string[];
  rows: {
    [matricule: string]: PlanningMatrixRow;
  };
};

export type PreventativeMaintenanceEntry = {
  id: string;
  operation: string;
  date: string;
  details: string[];
};

export type CurativeMaintenanceEntry = {
  id: number;
  panneDeclaree: string;
  typePanne: 'mécanique' | 'électrique' | 'autres' | 'non spécifié';
  dateEntree: string;
  dateSortie: string;
  dureeIntervention: number | null;
  piecesRemplacees: string[];
  details: Record<string, any>;
  tags: readonly string[];
};

export type FollowUpStats = {
  totalPlanifie: number;
  totalRealise: number;
  planifieByNiveau: { [key: string]: number };
  realiseByNiveau: { [key: string]: number };
  realiseByEntretien: { [key: string]: number };
  planifieByEntretien: { [key: string]: number };
};

export type WeeklyReportItem = {
  obs: string;
  numero: number;
  designation: string;
  matricule: string;
  date_panne: string;
  nature_panne: string;
  reparations: string[];
  date_sortie: string;
  intervenant: string;
};

export type WeeklyReport = {
  id: number;
  start_date: string;
  end_date: string;
  generated_at: string;
  pannes: WeeklyReportItem[];
};

export type MonthlyCount = {
  month: string;
  count: number;
};

export type MonthlyPreventativeStats = {
  monthlyData: {
    month: string;
    vidange: number;
    graissage: number;
    transmission: number;
    hydraulique: number;
    autres: number;
  }[];
  totalOil: number;
  oilByType: Record<string, number>;
};

export type DashboardData = {
  equipmentCount: number;
  operationCount: number;
  followUpStats: FollowUpStats | null;
  monthlyCounts: MonthlyCount[];
  recentOperations: Operation[];
  error: string | null;
  breakdownsThisMonth: number | null;
  year: number;
  preventativeStats: MonthlyPreventativeStats;
};

export type DeclarationPannePiece = {
  designation: string;
  reference: string;
  quantite: number;
  montant: number;
};

export type DeclarationPanneIntervenant = {
  type: string;
  description: string;
};

export type DeclarationPanne = {
  id: number;
  operation_id: number;
  generated_at: string;
  
  operation: Operation;
  equipment: Equipment;

  chauffeur_conducteur: string;
  diagnostique_intervenant: string;
  causes: string;
  pieces: DeclarationPannePiece[];
  intervenants: DeclarationPanneIntervenant[];
  montant_main_oeuvre: number;
  obs_reserves: string;
};
