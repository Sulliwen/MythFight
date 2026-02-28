# Setup Codex pour MythFight

## Objectif
Utiliser Codex de facon fiable sur ce projet de documentation/design.

## Prerequis
- Codex CLI installe.
- Compte OpenAI connecte dans le terminal.
- Dossier projet: `/home/sulli/MythFight`.

## Initialisation minimale
1. Ouvrir un terminal dans le projet.
2. Lancer `codex`.
3. Verifier que `AGENTS.md` est pris en compte (instructions du repo).
4. Commencer par une tache concrete (ex: "remplir one-pager v1").

## Commandes utiles
- Session interactive: `codex`
- Tache one-shot: `codex exec "mets a jour docs/00_vision/one-pager.md"`
- Reprendre la derniere session: `codex resume --last`
- Fork d'une session precedente: `codex fork --last`
- Activer recherche web en live si besoin: `codex --search`

## Bonnes pratiques (officielles adaptees au projet)
- Demander des taches precises avec resultat attendu et fichier cible.
- Ecrire les demandes longues en Markdown (plus lisible pour Codex).
- Faire des changements petits et verifiables.
- Exiger un resume des fichiers modifies en fin de tache.
- Pour les infos "latest", utiliser `--search` et citer les sources.

## Workflow recommande pour MythFight
1. Fixer la vision dans `docs/00_vision/one-pager.md`.
2. Deriver les regles dans `docs/01_game-design/gdd.md`.
3. Formaliser factions et units balance.
4. Cadrer economie, technique et roadmap.
5. Implementer par increments dans `game/src` et `game/data`.
6. Tenir une boucle de revision: clarte -> coherence -> testabilite.
7. Garder docs et code synchronises a chaque changement important.

## Prompt template (copier/coller)
```md
Contexte:
- Projet: MythFight (Castle Fight mythologique)
- Fichier cible: <path>
- Contrainte: rester coherent avec AGENTS.md

Objectif:
- <resultat attendu concret>

Definition de done:
- <liste courte des criteres de validation>
```
