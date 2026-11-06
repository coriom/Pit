# PIT Free — noms de domaine et route Cloudflare (4 novembre 2026)

**Archive du relevé du 4 novembre.** La décision de marque PIT Crypto et la recherche contradictoire du 6 novembre figurent dans [PIT-CRYPTO-BRAND-DOMAIN-PREFLIGHT.md](PIT-CRYPTO-BRAND-DOMAIN-PREFLIGHT.md). Ne pas utiliser les anciens résultats RDAP comme preuve actuelle de disponibilité.

**Aucun domaine réservé, acheté, ajouté à Cloudflare ou routé.** Ce relevé sert à choisir un nom ; le contrôle au panier et la recherche de droits antérieurs restent nécessaires avant l'achat.

## Cinq candidats `.fr`

Le RDAP officiel Afnic `https://rdap.nic.fr/domain/<nom>` a répondu **404** pour chacun des cinq noms ci-dessous le 4 novembre 2026. Le même service répondait **200** pour `google.fr`, `service-public.fr` et `pit.fr`, ce qui contrôle que le 404 ne provenait pas d'une panne générale. Cette preuve signifie « aucun enregistrement RDAP trouvé à l'instant du relevé », **pas** une garantie d'enregistrement immédiat : un nom peut être réservé, interdit, en cours de traitement ou pris avant l'achat. L'Afnic distingue elle-même le contrôle de disponibilité à l'enregistrement (`domain:check`) de la consultation du registre.

| Rang | Nom | Lecture RDAP | 1re année OVHcloud | Renouvellement OVHcloud | Appréciation |
| --- | --- | --- | ---: | ---: | --- |
| 1 | `pitweb3.fr` | 404, non enregistré | 5,99 € TTC | 9,35 € TTC/an | Court, explicite pour les outils Web3 ; le terme Web3 reste large. |
| 2 | `pit-outils.fr` | 404, non enregistré | 5,99 € TTC | 9,35 € TTC/an | Compréhensible en France et adapté à la couche gratuite ; le trait d'union et le terme français limitent la portée internationale. |
| 3 | `pit-onchain.fr` | 404, non enregistré | 5,99 € TTC | 9,35 € TTC/an | Distinctif et pertinent pour Explorer/Operations ; plus technique et moins adapté aux calculateurs hors chaîne. |
| 4 | `getpit.fr` | 404, non enregistré | 5,99 € TTC | 9,35 € TTC/an | Mémorisable mais peu descriptif ; `getpit.com` est déjà proposé à la vente, sans droit de marque inclus. |
| 5 | `pit-finance.fr` | 404, non enregistré | 5,99 € TTC | 9,35 € TTC/an | Décrit les calculateurs, mais un usage crypto « Pit Finance » est visible ; à écarter sans examen juridique. |

Tarifs observés sur [la page officielle OVHcloud `.fr`](https://www.ovhcloud.com/fr/domains/tld/fr/) : 4,99 € HT (5,99 € TTC) en création la première année et 7,79 € HT (9,35 € TTC) en renouvellement. Les tarifs sont par extension, pas une promesse de panier pour un nom donné ; vérifier le prix final, les taxes et le renouvellement avant de décider. À titre de comparaison, [IONOS affiche](https://www.ionos.fr/domaine/prix-des-domaines) une offre de bienvenue `.fr` à 1 € et un renouvellement à 11 € ; ses conditions promotionnelles et taxes doivent être contrôlées au panier. Aucun hébergement payant n'est requis par le projet statique.

## Conflits de nom et marque

Une ESN française utilise déjà **PIT** et le domaine [`pit.fr`](https://pit.fr/) pour des services logiciels. C'est un conflit de proximité commerciale **concret**, même si cela ne prouve pas à lui seul l'existence d'un droit de marque opposable à PIT Web3. `pittools.com` est aussi utilisé pour de l'outillage physique ; `Pit Finance` apparaît dans l'écosystème crypto. Les recherches web exactes des autres composés n'ont pas révélé d'homonyme manifeste, mais elles ne constituent ni une recherche de marques INPI/EUIPO/OMPI ni une analyse de similitude. Avant achat ou publication sous PIT, faire vérifier les droits antérieurs pertinents pour les logiciels, services financiers et outils Web3. [L'INPI décrit la vérification à l'identique puis la recherche de similarité](https://www.inpi.fr/disponibilite-dune-marque-dun-logo-dun-nom-de-societe-dun-nom-de-domaine).

## Configuration Cloudflare préparée, non activée

Le compte PIT `77dc4e907cd36ee29964c8aff47f7c38` avait toujours **zéro zone** au relevé GET du 4 novembre 2026 ; aucun des noms ci-dessus n'est possédé ou configuré dans ce compte. Seuls `pit-v2-private-staging` et `pit-premium-cb-sandbox` apparaissent dans l'inventaire des Workers. Le GET de l'abonnement renvoie 403 : le plan Free précédemment confirmé par l'opérateur ne peut pas être contrôlé par ce jeton. Le Worker public prévu est **distinct** : `pit-v2-free-public`. Le paquet local généré par `pnpm product:free:public-candidate` conserve `workers_dev:false`, `preview_urls:false` et aucune route. Le staging privé, son Access et le sandbox SIWE ne sont pas modifiés.

Après choix, acquisition/contrôle du domaine et activation d'une zone Cloudflare, le manifeste de publication pourra lier une route Wrangler `routes: [{ "pattern": "<HÔTE APPROUVÉ>", "custom_domain": true }]`, sur **ce seul Worker**, au contenu statique vérifié. Cloudflare exige une zone active pour un Custom Domain et crée alors les enregistrements DNS/certificats correspondants ; cette étape constitue une mutation externe à autoriser séparément. Le domaine exact, l'identifiant de zone, les textes légaux validés, le SHA du paquet final et la procédure de retour arrière devront figurer dans le manifeste avant calcul de son hash. [Documentation Cloudflare](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Retour arrière prévu : retirer uniquement la route publique du Worker `pit-v2-free-public` ou restaurer sa version publique précédente, vérifier la réponse du domaine et laisser le staging privé intact. L'absence de zone, de textes publiables et de vérification de marque empêche pour l'instant un manifeste `GO PIT FREE PUBLIC` sincère.
