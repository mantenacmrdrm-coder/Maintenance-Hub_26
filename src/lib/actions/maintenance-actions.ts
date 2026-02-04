






'use server';

import { 
  initializeDatabase as initDb, 
  generateHistoryMatrix, 
  generatePlanning as runPlanning,
  getPlanningPage,
  getFollowUpPage,
  getPlanningMatrixForExport,
  getFollowUpMatrixForExport,
  getHistoryMatrixFromCache,
  getParams as dataGetParams,
  updateParam as dataUpdateParam,
  getAllPlanningForYear,
  getFollowUpStatistics,
  getAllEquipment, 
  getAllOperations,
  getDistinctCategories as dataGetDistinctCategories,
  getCategoryEntretiens as dataGetCategoryEntretiens,
  updateCategoryEntretiens as dataUpdateCategoryEntretiens,
  addCurativeOperationToDb,
  generateAndSaveWeeklyReport as generateAndSaveWeeklyReportData,
  getWeeklyReports as getWeeklyReportsData,
  getWeeklyReport as getWeeklyReportData,
  getMonthlyCurativeCounts,
  getMonthlyPreventativeStats,
  deleteWeeklyReport as deleteWeeklyReportFromDb,
  getOperationById,
  saveDeclaration as saveDeclarationToDb,
  getDeclarationById,
  getDeclarationsList as getDeclarationsListData,
  deleteDeclarationFromDb as deleteDeclaration,
  updateDeclarationInDb as updateDeclaration,
} from '../data';
import type { Alert, DeclarationPanne } from '../types';
import { revalidatePath } from 'next/cache';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { z } from 'zod';
import { redirect } from 'next/navigation';


dayjs.extend(isSameOrBefore);


export async function getPreventativeAlerts(alertWindowDays: number): Promise<Alert[]> {
  try {
    const currentYear = new Date().getFullYear();
    const plannedOperations = await getAllPlanningForYear(currentYear);
    
    const today = dayjs().startOf('day');
    const alerts: Alert[] = [];
    const endOfWindow = today.add(alertWindowDays, 'day');

    for (const op of plannedOperations) {
        const dueDate = dayjs(op.date_programmee, 'DD/MM/YYYY');
        if (!dueDate.isValid() || dueDate.isAfter(endOfWindow)) {
            continue;
        }

        const urgency = dueDate.isBefore(today) ? 'urgent' : 'near';

        alerts.push({
            equipmentId: op.matricule,
            equipmentDesignation: op.designation,
            operation: op.operation,
            dueDate: op.date_programmee,
            urgency: urgency,
            niveau: op.niveau,
        });
    }
    
    const sortedAlerts = alerts.sort((a, b) => {
        const dateA = dayjs(a.dueDate, 'DD/MM/YYYY').unix();
        const dateB = dayjs(b.dueDate, 'DD/MM/YYYY').unix();
        return dateA - dateB;
    });

    return sortedAlerts;

  } catch (error: any) {
    console.error('Error generating preventative alerts:', error);
    throw new Error(error.message || 'Failed to generate alerts.');
  }
}

export async function initializeDatabase() {
    try {
        return await initDb();
    } catch(e:any) {
        console.error("Erreur lors de l'initialisation de la base de données", e);
        return { success: false, message: e.message };
    }
}

export async function runHistoryGeneration() {
    console.log("Démarrage de la génération d'historique...");
    try {
        const result = await generateHistoryMatrix();
        return result;
    } catch(e: any) {
        console.error("Erreur lors de l'exécution de runHistoryGeneration", e);
        throw new Error("Impossible de générer l'historique : " + e.message);
    }
}

export async function getHistory() {
    try {
        const result = await getHistoryMatrixFromCache();
        return result;
    } catch (e: any) {
        console.error("Erreur lors de la récupération de l'historique depuis le cache", e);
        return { headers: [], rows: [], counts: {} };
    }
}

export async function generatePlanning(year: number) {
  const result = await runPlanning(year);
  revalidatePath('/planning');
  revalidatePath('/suivi');
  return result;
}

export async function getAllPlanningForExport(year: number) {
    return await getPlanningMatrixForExport(year);
}

export async function getAllFollowUpForExport(year: number) {
    return await getFollowUpMatrixForExport(year);
}

export async function getParams() {
    return dataGetParams();
}

export async function updateParam(id: number, column: string, value: string | null) {
    const result = await dataUpdateParam(id, column, value);
    revalidatePath('/parameters');
    revalidatePath('/planning'); // Also revalidate planning as data might have changed
    return result;
}

export async function getDashboardData(year?: number) {
    const targetYear = year || new Date().getFullYear();
    const isCurrentYear = targetYear === new Date().getFullYear();
    try {
        const [
            equipmentCount,
            operations,
            followUpStats,
            monthlyCounts,
            preventativeStats
        ] = await Promise.all([
            getAllEquipment().then(e => e.length),
            getAllOperations(),
            getFollowUpStatistics(targetYear),
            getMonthlyCurativeCounts(targetYear),
            getMonthlyPreventativeStats(targetYear)
        ]);
        
        const breakdownsThisMonth = isCurrentYear 
            ? (monthlyCounts.find(m => m.month === dayjs().format('MMM'))?.count || 0)
            : null;

        return {
            equipmentCount: equipmentCount || 0,
            operationCount: operations.length || 0,
            followUpStats: followUpStats,
            monthlyCounts: monthlyCounts,
            preventativeStats: preventativeStats,
            recentOperations: operations.slice(0, 5),
            error: null,
            breakdownsThisMonth,
            year: targetYear,
        };
    } catch (error: any) {
        console.error("Error fetching dashboard data:", error);
        return {
            equipmentCount: 0,
            operationCount: 0,
            followUpStats: null,
            monthlyCounts: [],
            preventativeStats: { monthlyData: [], totalOil: 0, oilByType: {} },
            recentOperations: [],
            error: "Impossible de charger les données du tableau de bord.",
            breakdownsThisMonth: null,
            year: targetYear,
        };
    }
}

export async function getDistinctCategories() {
    return dataGetDistinctCategories();
}

export async function getCategoryEntretiens() {
    return dataGetCategoryEntretiens();
}

export async function updateCategoryEntretiens(category: string, entretien: string, isActive: boolean) {
    const result = await dataUpdateCategoryEntretiens(category, entretien, isActive);
    revalidatePath('/parameters');
    revalidatePath('/planning');
    return result;
}


const curativeOperationSchema = z.object({
  matricule: z.string().min(1),
  dateEntree: z.date(),
  panneDeclaree: z.string().min(1),
  sitActuelle: z.enum(['En Cours', 'Réparée', 'Dépanné']),
  pieces: z.string().optional(),
  dateSortie: z.date().optional(),
  intervenant: z.string().optional(),
  affectation: z.string().optional(),
});

// Helper function for working days
function calculateWorkingDays(startDate: dayjs.Dayjs, endDate: dayjs.Dayjs): number {
    let count = 0;
    let currentDate = startDate.clone();
    while (currentDate.isBefore(endDate, 'day') || currentDate.isSame(endDate, 'day')) {
        const dayOfWeek = currentDate.day(); // Sunday = 0, ..., Saturday = 6
        if (dayOfWeek !== 5 && dayOfWeek !== 6) { // Not Friday or Saturday
            count++;
        }
        currentDate = currentDate.add(1, 'day');
    }
    return count;
}

// Helper for panne type
function determinePanneType(panneDeclaree: string, pieces: string): 'mécanique' | 'électrique' | 'autres' {
    const combinedText = (panneDeclaree + ' ' + pieces).toLowerCase();
    const electricKeywords = ['électrique', 'marir,r', 'batterie', 'alternateur', 'demarreur', 'faisceau'];
    
    if (electricKeywords.some(kw => combinedText.includes(kw))) {
        return 'électrique';
    }
    if (combinedText.includes('pneu')) {
        return 'autres';
    }
    return 'mécanique';
}


export async function addCurativeOperation(values: unknown) {
  const parsed = curativeOperationSchema.safeParse(values);
  if (!parsed.success) {
    return { success: false, message: 'Données du formulaire invalides.' };
  }
  const data = parsed.data;

  try {
    const dateEntree = dayjs(data.dateEntree);
    let dateSortie;
    let dateSortieString: string;

    if (data.sitActuelle === 'Réparée' && data.dateSortie) {
        dateSortie = dayjs(data.dateSortie);
        dateSortieString = dateSortie.format('DD/MM/YYYY');
    } else {
        dateSortie = dayjs(); // for calculation if 'En Cours'
        dateSortieString = 'En Cours';
    }
    
    // NBR INDISPONIBILITE
    const nbrIndisponibilite = dateSortie.diff(dateEntree, 'day');

    // JOUR OUVRABLE and RATIOs
    const monthStartDate = dateEntree.startOf('month');
    const monthEndDate = dateEntree.endOf('month');
    const totalWorkingDaysInMonth = calculateWorkingDays(monthStartDate, monthEndDate);
    const jourOuvrable = totalWorkingDaysInMonth > 0 ? totalWorkingDaysInMonth : 22; // fallback

    const ratio = nbrIndisponibilite / jourOuvrable;
    const jourDisponibilite = jourOuvrable - nbrIndisponibilite;
    const ratio2 = jourDisponibilite / jourOuvrable;
    
    // TYPE DE PANNE
    const typeDePanne = determinePanneType(data.panneDeclaree, data.pieces || '');

    const operationData = {
        matricule: data.matricule,
        date_entree: dateEntree.format('DD/MM/YYYY'),
        panne_declaree: data.panneDeclaree,
        sitactuelle: data.sitActuelle,
        pieces: data.pieces || null,
        date_sortie: dateSortieString,
        intervenant: data.intervenant || null,
        affectation: data.affectation || null,
        type_de_panne: typeDePanne,
        nbr_indisponibilite: nbrIndisponibilite,
        jour_ouvrable: jourOuvrable,
        ratio: isFinite(ratio) ? ratio : 0,
        jour_disponibilite: jourDisponibilite,
        ratio2: isFinite(ratio2) ? ratio2 : 0,
    };

    const result = await addCurativeOperationToDb(operationData);

    revalidatePath('/operations');
    revalidatePath(`/equipment/${data.matricule}`);
    revalidatePath('/declarations/select-operation');
    revalidatePath('/');
    
    return { success: true, message: 'Opération ajoutée.', data: result };

  } catch (error: any) {
    console.error('Failed to add curative operation:', error);
    return { success: false, message: error.message || 'Une erreur serveur est survenue.' };
  }
}

export async function generateWeeklyReportAction(targetDate: Date): Promise<{ success: boolean; reportId?: number; message?: string; }> {
  if (!targetDate) {
    return { success: false, message: 'La date cible est requise.' };
  }
  try {
    const reportId = await generateAndSaveWeeklyReportData(targetDate);
    revalidatePath('/reports');
    return { success: true, reportId: reportId };
  } catch (error: any) {
    console.error("Failed to generate weekly report:", error);
    return { success: false, message: error.message || 'La génération du rapport a échoué.' };
  }
}

export async function getWeeklyReports() {
    return await getWeeklyReportsData();
}

export async function getWeeklyReport(id: number) {
    return await getWeeklyReportData(id);
}

export async function deleteWeeklyReportAction(id: number) {
    try {
        await deleteWeeklyReportFromDb(id);
        revalidatePath('/reports');
        return { success: true };
    } catch (error: any) {
        console.error(`Failed to delete report action for id ${id}`, error);
        return { success: false, message: error.message || 'Impossible de supprimer le rapport.' };
    }
}


export async function getOperationForDeclaration(operationId: number) {
    const operation = await getOperationById(operationId);
    if (!operation) return null;
    return operation;
}

export async function saveDeclarationAction(operationId: number, data: any) {
    try {
        const declarationId = await saveDeclarationToDb(operationId, JSON.stringify(data));
        revalidatePath('/declarations');
        revalidatePath('/declarations/select-operation');
        return { success: true, declarationId };
    } catch (error: any) {
        console.error("Failed to save declaration:", error);
        return { success: false, message: error.message };
    }
}

export async function getDeclaration(declarationId: number): Promise<DeclarationPanne | null> {
    const declaration = await getDeclarationById(declarationId);
    return declaration;
}

export async function getDeclarationsListAction() {
    return getDeclarationsListData();
}

export async function deleteDeclarationAction(id: number) {
    try {
        await deleteDeclaration(id);
        revalidatePath('/declarations');
        revalidatePath('/declarations/select-operation');
        return { success: true };
    } catch (error: any) {
        console.error(`Failed to delete declaration with id ${id}`, error);
        return { success: false, message: error.message || 'Impossible de supprimer la déclaration.' };
    }
}

export async function updateDeclarationAction(declarationId: number, data: any) {
    try {
        await updateDeclaration(declarationId, JSON.stringify(data));
        revalidatePath('/declarations');
        revalidatePath(`/declarations/view/${declarationId}`);
        return { success: true, declarationId };
    } catch (error: any) {
        console.error("Failed to update declaration:", error);
        return { success: false, message: error.message };
    }
}


export { getPlanningPage, getFollowUpPage, getFollowUpStatistics };
