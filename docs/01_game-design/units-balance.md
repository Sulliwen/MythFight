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
| Golem | Siege | Heavy | 50 | 50 |
| Soldat | Normal | Medium | 4 | 18 |
| Griffon | Magic | Medium | 2 | 34 |
| Chateau | - | Fortified | 5 | - |

### Profils de recrutement actuels
| Unite | Producteur | HP unite | Vitesse | Portee | Vitesse atk | Vision | HP batiment | Cadence spawn |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Golem | Atelier du golem | 100 | 1.0 | 5 | 100 ticks | 100 | 200 | 100 ticks |
| Soldat | Caserne | 55 | 1.8 | 10 | 28 ticks | 110 | 140 | 60 ticks |
| Griffon | Perchoir | 125 | 1.4 | 18 | 40 ticks | 150 | 180 | 140 ticks |

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
