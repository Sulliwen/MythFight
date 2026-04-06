# Warcraft III Damage Model

## Ordre du calcul
`base damage -> attack type multiplier -> armor formula`

## Regles retenues
- Le serveur applique la table Warcraft III actuelle.
- `piercing -> heavy` utilise `0.90`.
- Les degats restent en flottants dans la simulation.
- Les chateaux utilisent un profil fixe: `armorType = fortified`, `armor = 5`.

## Points d'integration
- Unite -> unite: la resolution lit `attackType`, `armorType` et `armor` dans les stats creature.
- Unite -> chateau: la resolution reutilise le meme calcul avec le profil de defense fixe du chateau.
