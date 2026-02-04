

export const HEADER_ORDER = [
    'MATRICULE', 'Niveau d\'huile du carter', 'Etanchéité de tous les circuits', 'Courroie',
    'Filtre à huile', 'Vidanger le carter moteur', 'Filtre à air', 'Filtre carburant', 'chaine',
    'Frein', 'soupape', 'pneu', 'moyeu de roue', 'boite de vitesse', 'cardan', 'Graissage général',
    'embrayage', 'circuit hydraulique', 'pompe hydraulique', 'Filtre hydraulique', 'Réservoir hydraulique',
    'alternateur', 'batterie', 'Faisceaux électriques', 'relevé compteur'
] as const;

export const OFFICIAL_ENTRETIENS = HEADER_ORDER.slice(1, -1);


export const planningOperationNameMapping = {
    'NIVEAU HUILE': 'Niveau d\'huile du carter',
    'VIDANGE,M': 'Vidanger le carter moteur',
    'TRANSMISSION': 'boite de vitesse',
    'GR': 'Graissage général',
    'HYDRAULIQUE': 'circuit hydraulique',
} as const;
