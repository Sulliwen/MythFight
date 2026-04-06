# Units Balance

## Systeme Warcraft III

### Table de multiplicateurs
| Attack type | Light | Medium | Heavy | Fortified | Hero | Unarmored |
|---|---:|---:|---:|---:|---:|---:|
| Normal | 1.00 | 1.50 | 1.00 | 0.70 | 1.00 | 1.00 |
| Piercing | 2.00 | 0.75 | 0.90 | 0.35 | 0.50 | 1.50 |
| Siege | 1.00 | 0.50 | 1.00 | 1.50 | 0.50 | 1.50 |
| Magic | 1.25 | 0.75 | 2.00 | 0.35 | 0.50 | 1.00 |
| Chaos | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Spells | 1.00 | 1.00 | 1.00 | 1.00 | 0.70 | 1.00 |
| Hero | 1.00 | 1.00 | 1.00 | 0.50 | 1.00 | 1.00 |

### Formule d'armure
- Armure positive: `reduction = (0.06 * armor) / (1 + 0.06 * armor)`
- Multiplicateur final si armure positive: `1 - reduction`
- Armure negative: `multiplier = 2 - 0.94^(-armor)`

### Profils actuels MythFight
| Entite | Attack type | Armor type | Armor | Degats de base |
|---|---|---|---:|---:|
| Golem | Siege | Heavy | 0 | 50 |
| Chateau | - | Fortified | 5 | - |

## Colonnes recommandees
- Faction
- Unite
- Tier
- Role
- Cout or
- HP
- Degats
- Vitesse attaque
- Portee
- Vitesse de deplacement
- Capacite
- Contres

## Tableau (exemple)
| Faction | Unite | Tier | Role | Cout or | HP | Degats | Atk spd | Portee | Move spd | Capacite | Contres |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
|   |   |   |   |   |   |   |   |   |   |   |   |
