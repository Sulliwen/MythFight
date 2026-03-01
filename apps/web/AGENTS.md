# AGENTS - Web Client

## Mission
Fournir un client web fluide et lisible qui affiche l'etat serveur sans devenir source de verite gameplay.

## Regles non negociables
- Le client ne decide jamais du resultat gameplay.
- Le client envoie des intentions et rend les snapshots serveur.
- La fluidite vient de l'interpolation/extrapolation bornee, pas d'une simulation locale autoritaire.

## Reseau et resilence
- Utiliser `VITE_WS_URL` avec fallback local pour dev.
- Gerer proprement `open`, `message`, `error`, `close`.
- Maintenir heartbeat et mesure RTT (`ping/pong`).
- Nettoyer les timers et ressources a la fermeture/unmount.

## Rendu et UX
- Affichage lisible avant esthetique avancee.
- Conserver un HUD technique minimal: status, tick, FPS, RTT, HP, units.
- Eviter les regressions de fluidite lors des changements d'UI.
- Le debug ne doit pas surcharger le thread principal.

## Qualite code
- Composants petits, responsabilites claires.
- Extraire la logique reseau dans des hooks.
- Types stricts sur les messages reseau.
- Eviter les effets React inutiles et les patterns interdits par lint.

## Definition of done (web)
- `pnpm --filter @mythfight/web lint` passe.
- `pnpm --filter @mythfight/web build` passe.
- Test manuel OK en local sur 2 clients (`player1` et `player2`).
- Test lag simule (`0` vs `200+ ms`) sans freeze ni desync durable observe.
