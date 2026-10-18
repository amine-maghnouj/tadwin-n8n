# Nœud « Extraire données » (Information Extractor)

## Text (champ d'entrée)
```
{{ $json.text }}
```

## Schema Type : « Define using JSON Schema »
```json
{
  "type": "object",
  "properties": {
    "fournisseur_nom":  { "type": "string", "description": "Raison sociale de l'émetteur de la facture (le vendeur), pas le client" },
    "fournisseur_ice":  { "type": "string", "description": "ICE du fournisseur, 15 chiffres, sans espaces" },
    "numero_facture":   { "type": "string", "description": "Numéro de la facture tel qu'imprimé" },
    "date_facture":     { "type": "string", "description": "Date de la facture au format AAAA-MM-JJ" },
    "montant_ht":       { "type": "number", "description": "Total hors taxes" },
    "taux_tva":         { "type": "number", "description": "Taux de TVA en pourcentage, ex. 20 ou 14" },
    "montant_tva":      { "type": "number", "description": "Montant de la TVA" },
    "montant_ttc":      { "type": "number", "description": "Total TTC tel qu'imprimé, même s'il semble faux" },
    "description":      { "type": "string", "description": "Libellé court de l'achat, 3 à 6 mots" },
    "compte_suggere":   { "type": "string", "description": "Compte de charge PCGE choisi dans la liste autorisée" }
  },
  "required": ["fournisseur_nom", "numero_facture", "date_facture", "montant_ht", "taux_tva", "montant_tva", "montant_ttc", "description", "compte_suggere"]
}
```

## Options → System Prompt Template
```
Tu es un assistant comptable marocain. Tu extrais les données d'une facture d'achat.
Règles :
- Le fournisseur est l'émetteur de la facture. Le client "Argan Digital SARL" n'est jamais le fournisseur.
- Recopie les montants exactement comme imprimés, même s'ils semblent incohérents. Ne corrige rien.
- Convertis les montants en nombres (ex. "4 250,00 MAD" -> 4250).
- Pour compte_suggere, choisis UNIQUEMENT dans cette liste :
  6111 Achats de marchandises
  6125 Achats non stockés de matières et fournitures (bureau, eau, électricité)
  6126 Achats de travaux, études et prestations de services
  6131 Locations et charges locatives
  6133 Entretien et réparations
  6134 Primes d'assurances
  6136 Rémunérations d'intermédiaires et honoraires
  6142 Transports
  6143 Déplacements, missions et réceptions
  6144 Publicité, publications et relations publiques
  6145 Frais postaux et frais de télécommunications
  6147 Services bancaires
```
Remplacez « Argan Digital SARL » par le nom de votre entreprise si vous testez avec vos propres factures.

# Nœud « Google Sheets » (Append Row, onglet Journal)
Mapping Column Mode : **Map Automatically**. Les noms de champs du nœud Code correspondent déjà aux colonnes.

# Nœud final « Form » (Operation : Form Ending / Completion)
Titre : `Facture traitée`
Message :
```
{{ $('Générer écriture').first().json.Statut }} : {{ $('Générer écriture').first().json.N_Piece }}
{{ $('Générer écriture').first().json.Motif || 'Écriture enregistrée dans le journal.' }}
```
