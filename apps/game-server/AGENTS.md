# AGENTS - Game Server

## Mission
Maintenir un serveur de jeu temps reel autoritaire, deterministe, testable et robuste.

## Regles non negociables
- Toute logique gameplay est cote serveur (spawn, deplacement, combat, degats, victoire).
- Le client envoie des intentions, jamais un etat de verite.
- La simulation tourne en tick fixe.
- Les payloads reseau sont valides strictement.
- Aucune action destructive basee sur des donnees non valides.

## Determinisme
- Garder un ordre de traitement stable a chaque tick.
- Eviter les sources de non-determinisme implicite.
- Isoler toute logique aleatoire et la rendre reproductible.

## Reseau
- Protocole explicite: `join`, `spawn`, `snapshot`, `ping`, `pong`, `error`.
- Toujours renvoyer des erreurs explicites en cas de payload invalide.
- Ne pas faire fuiter des details inutiles dans les messages d'erreur.
- Conserver la compatibilite descendante ou versionner le protocole.

## Performance et boucle serveur
- Ne pas faire de travail lourd dans les handlers WS.
- Utiliser des structures de donnees simples et previsibles.
- Eviter les allocations inutiles dans le hot path du tick.
- Envisager de ne pas simuler quand aucun client n'est connecte.

## Logging et observabilite
- Logger: connexion, join valide/invalide, spawn, deconnexion, erreurs protocole.
- Garder des logs courts et exploitables.

## Definition of done (server)
- `pnpm --filter @mythfight/game-server build` passe.
- Le smoke test WS couvre `join + spawn + snapshot + ping/pong`.
- Pas de regression visible sur la convergence d'etat multi-clients.
- Les changements reseau/gameplay sont documentes si impact protocole.
