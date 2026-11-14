# PIT Crypto V2.3 — canari Rust interne Netcup

## Portée et identité

- Autorisation : `GO PIT V2 INTERNAL CANARY 876b89f118b68737697081c4ee10cbbc3e475a16940a7992f7585f887a9c99f8`.
- Application Coolify Raw : `pit-backend-v2-internal-canary`, UUID `b8ohynbyx8dwsl5n46qdgjop`, environnement `internal-canary-v2` (`kbspc2ywm934i28eezgeynle`).
- Job Coolify unique : `gauyvi93y4iaifghdsthwbg3`, état `finished`, commit déployé `0427bbb39445f45a8f058e72be8c53d5173cc890`.
- Image : `ghcr.io/coriom/pit-rust-backend@sha256:af396343aabd7e4988d1fd9bdb4308848c79702a0a47baaab73ab043325b9e3d`.
- Compose source SHA-256 : `d197fd9f4c76f1995d54b8901a5bc2f368f64af58b3f3864c19228f49613e6d2` ; Compose généré sur le VPS SHA-256 : `fd1e0501136d60d20b158f621dbc34b457d39a6eb5f091197a9668b679a2f466`.
- Déploiement sans domaine, route Traefik ou port hôte. Cloudflare, paiements, signature et transactions externes inchangés.

## Sécurité et ressources observées

Le contrôle Docker post-démarrage a confirmé : réseau de gestion `b8ohynbyx8dwsl5n46qdgjop` avec `coolify-proxy` seul ; réseau `pit-crypto-v2-canary_pit-v2-data` avec API, worker et PostgreSQL V2 ; réseau `pit-crypto-v2-canary_pit-v2-rpc` avec API et worker seulement. Le proxy est absent des deux réseaux applicatifs. Aucun service V2 ne publie de port ni ne porte de route Traefik. Les deux anciens volumes PostgreSQL V1 sont préservés ; le volume V2 est distinct.

| Service V2 | Limite CPU effective cgroup | Limite RAM effective cgroup | RAM Docker au relevé final | État final |
|---|---:|---:|---:|---|
| API | 0,25 vCPU | 256 Mio | 1,859 Mio | running, healthy, 0 redémarrage, 0 OOM |
| Worker | 0,50 vCPU | 512 Mio | 1,789 Mio | running, healthy, 0 redémarrage, 0 OOM |
| PostgreSQL | 0,50 vCPU | 512 Mio | 30,38 Mio | running, healthy, 0 redémarrage, 0 OOM |

Les relevés Docker sont des instantanés, pas des mesures de capacité soutenue. Après les tests, le VPS avait 6 017 Mio de RAM disponibles, une pression CPU `full avg10=0`, et environ 142 Gio libres. Les mesures Docker simultanées de V1 étaient : API 42,39 Mio, worker 52,76 Mio, PostgreSQL 27,88 Mio. La différence ne démontre aucun gain de performance général : charges, caches et méthodes de comptage diffèrent. Les temps V2 des jobs hébergés étaient d'environ 2,02 s chacun, avec un sondage de statut toutes les 2 s ; ils ne constituent pas un benchmark comparatif V1/V2.

## Tests hébergés

- Refus d'une requête directe non signée, d'un HMAC invalide et d'un corps modifié ; nonce rejoué refusé ; capacité d'un autre job refusée ; idempotence et quota de 10 jobs/minute vérifiés.
- Fetch NFT hébergé refusé avec `NFT_FETCH_DISABLED`.
- Worker V2 arrêté volontairement, job d'événements persisté `QUEUED`, puis même worker redémarré : deux événements Base Sepolia au bloc 51698212, couverture `COMPLETE`, exports JSON/CSV et suppression vérifiés ; délai observé 2,02 s après reprise.
- Sauvegarde `pg_dump` privée de la seule base V2, restauration dans une base V2 jetable, lecture du job et du schéma, puis suppression de la base de restauration : PASS. Ce contrôle ne crée pas de planification de sauvegarde.
- Permissions : job `COMPLETED`, faits et couverture présents, export JSON ; export CSV vide pour cette fenêtre sans historique (HTTP 200). Distribution : job `COMPLETED`, deux destinataires vérifiés, total observé exact `30000000000000000000`, export CSV de 310 octets. Moniteur : création, pause, reprise, consultation des alertes et suppression PASS ; aucune livraison email externe ni nouvelle alerte hébergée n'a été testée.
- Les invitations de test brutes ont été supprimées du VPS après succès. Aucune donnée client n'a été chargée.

Le premier script de smoke a reçu HTTP 403 du RPC public pour son `User-Agent` Python. Le même appel `eth_blockNumber` a répondu 200 avec l'identifiant utilisé par le test V1. Le garde a arrêté uniquement V2 et a préservé ses volumes. Les mêmes conteneurs ont été redémarrés après contrôle des empreintes, réseaux, voisins et état du VPS, sans second job Coolify ni changement d'image, Compose ou manifeste. Le contrôle d'isolation a de nouveau passé, puis le smoke restant a réussi.

## Santé des voisins et état Coolify

V1 API/worker/PostgreSQL, DeOpt, HBI Hub, Toolio et Traefik étaient `running` et `healthy` avant et après. Aucun redémarrage V1 ou voisin supplémentaire n'a été observé. HTTPS strict : `/health` et `/hbi/api/health` répondent 200 ; `/pit/api/v1/health` répond 503, sans route PIT publique. Le certificat Let's Encrypt production servi sur l'IPv4 expire le 19 novembre 2026 à 14:57:18 UTC.

**Écart restant :** Coolify 4.7.5 affiche pour V2 `degraded:unhealthy` malgré les trois conteneurs V2 `healthy` et un job `finished`. V1 affiche `running:healthy`. La cause précise dans l'agrégation d'état Coolify n'est pas démontrée ; aucune métadonnée Coolify, configuration partagée ou application voisine n'a été modifiée pour changer cet affichage. La qualification du canari est donc **PARTIAL** côté contrôle opérationnel, avec runtime et isolation PASS. Une vérification ciblée du calcul d'état Coolify est requise avant d'envisager le remplacement de V1.

Le canari reste interne, sans utilisateurs réels. Les protections réseau sortant indépendantes du fetch NFT, une sauvegarde planifiée et testée, une livraison email externe et une route privée avec authentification sont des prérequis distincts pour une phase hébergée ultérieure.
