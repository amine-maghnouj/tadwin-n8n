// =====================================================================
// Nœud Code n8n : "Générer écriture"
// Mode : Run Once for All Items   |   Langage : JavaScript
//
// Les noms entre $('...') doivent correspondre EXACTEMENT au nom de vos nœuds :
//   - "Extraire données"   -> nœud Information Extractor
//   - "Lire Fournisseurs"  -> Google Sheets, Get Row(s), onglet Fournisseurs
//   - "Lire Journal"       -> Google Sheets, Get Row(s), onglet Journal
//     (activez "Always Output Data" dans Settings de ces deux nœuds Sheets,
//      sinon le workflow s'arrête quand le Journal est vide)
//
// Sortie : 3 lignes (charge, TVA, fournisseur) à ajouter dans l'onglet Journal.
// =====================================================================

const f = $('Extraire données').first().json.output;
const fournisseurs = $('Lire Fournisseurs').all().map(i => i.json).filter(r => r.Nom);
const journal = $('Lire Journal').all().map(i => i.json).filter(r => r.N_Facture);

// ---------- Utilitaires ----------
// Convertit "4 250,00", "4,250.00" ou 4250 en nombre
function num(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return NaN;
  let s = String(v).replace(/[^\d,.\-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  return parseFloat(s);
}
const r2 = x => Math.round(x * 100) / 100;
// Nom normalisé : minuscules, sans accents, sans forme juridique ni ponctuation
const norm = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\b(sarl au|sarl|s\.a\.r\.l|sa|sas|ste|societe)\b/g, '')
  .replace(/[^a-z0-9]/g, '');
const digits = s => String(s || '').replace(/\D/g, '');

// ---------- Données extraites ----------
const ht = num(f.montant_ht);
const tva = num(f.montant_tva);
const ttc = num(f.montant_ttc);
const taux = num(f.taux_tva);
const numFacture = String(f.numero_facture || '').trim();
const date = f.date_facture || '';

// ---------- Recherche du fournisseur (ICE d'abord, puis nom) ----------
const connu = fournisseurs.find(r => digits(r.ICE) && digits(r.ICE) === digits(f.fournisseur_ice))
           || fournisseurs.find(r => norm(r.Nom) === norm(f.fournisseur_nom));

const nomFournisseur = connu ? connu.Nom : f.fournisseur_nom;
const compteCharge = connu ? String(connu.Compte) : String(f.compte_suggere || '');

// ---------- Contrôles ----------
const anomalies = [];

if ([ht, tva, ttc].some(isNaN)) anomalies.push('Montants illisibles');
if (!numFacture) anomalies.push('Numéro de facture manquant');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) anomalies.push('Date invalide');

if (!isNaN(ht) && !isNaN(tva) && !isNaN(ttc) && Math.abs(r2(ht + tva) - ttc) > 0.05) {
  anomalies.push(`HT + TVA = ${r2(ht + tva)} mais TTC facture = ${ttc}`);
}
if (!isNaN(ht) && !isNaN(tva) && !isNaN(taux) && Math.abs(r2(ht * taux / 100) - tva) > 0.05) {
  anomalies.push(`TVA ${taux}% de ${ht} = ${r2(ht * taux / 100)} mais TVA facture = ${tva}`);
}
// Taux de TVA en vigueur selon l'année (réforme 2024-2026 : le 14 % disparaît,
// le transport passe à 10 %, l'électricité à 20 %). À vérifier sur tax.gov.ma.
const TAUX_PAR_ANNEE = {
  2024: [0, 7, 8, 10, 13, 14, 16, 20],
  2025: [0, 7, 9, 10, 12, 14, 18, 20],
  2026: [0, 7, 10, 20],
};
const annee = parseInt(String(date).slice(0, 4), 10);
const tauxValides = TAUX_PAR_ANNEE[annee] || TAUX_PAR_ANNEE[2026];
if (!isNaN(taux) && !tauxValides.includes(taux)) {
  anomalies.push(`Taux de TVA ${taux}% non applicable en ${annee || 'cette année'}`);
}

const doublon = journal.some(r =>
  String(r.N_Facture).trim().toLowerCase() === numFacture.toLowerCase() &&
  norm(r.Fournisseur) === norm(nomFournisseur));
if (doublon) anomalies.push('Doublon : facture déjà enregistrée');

if (!connu) anomalies.push(`Nouveau fournisseur : compte ${compteCharge || '?'} proposé par l'IA`);
if (!/^6\d{3,}$/.test(compteCharge)) anomalies.push('Compte de charge invalide');

// ---------- Écriture d'achat ----------
// On passe les montants lus sur la facture. Le crédit fournisseur = TTC facturé ;
// si la facture est fausse, l'écriture est déséquilibrée et marquée "À vérifier".
const lignes = [
  { Compte: compteCharge, Libelle: f.description || 'Achat', Debit: r2(ht), Credit: '' },
  { Compte: '34552', Libelle: `TVA récupérable ${taux}%`, Debit: r2(tva), Credit: '' },
  { Compte: '4411', Libelle: `Fournisseur ${nomFournisseur}`, Debit: '', Credit: r2(ttc) },
];

const totalDebit = r2(lignes.reduce((s, l) => s + (num(l.Debit) || 0), 0));
const totalCredit = r2(lignes.reduce((s, l) => s + (num(l.Credit) || 0), 0));
if (Math.abs(totalDebit - totalCredit) > 0.05) {
  anomalies.push(`Écriture déséquilibrée : débit ${totalDebit} / crédit ${totalCredit}`);
}

const statut = anomalies.length ? 'À vérifier' : 'Validé';
const motif = anomalies.join(' | ');

return lignes.map(l => ({
  json: {
    Date: date,
    Journal: 'ACH',
    N_Piece: `ACH-${numFacture}`,
    Fournisseur: nomFournisseur,
    N_Facture: numFacture,
    Compte: l.Compte,
    Libelle: l.Libelle,
    Debit: l.Debit,
    Credit: l.Credit,
    Statut: statut,
    Motif: motif,
  }
}));
