# PIT Crypto Free — marque et domaine (6 novembre 2026)

**Décision produit :** PIT est la marque ombrelle ; PIT Crypto désigne l'application Web3 actuelle ; PIT Tools reste une extension possible, sans produit ni domaine lancé. Le wordmark PIT et les URL d'outils ne changent pas. Aucun domaine n'a été acheté, aucune zone DNS créée et aucun site public déployé.

## Quatre noms demandés

| Domaine | Registre RDAP | Recherche registrar Vercel | Prix indicatif OVHcloud | Décision |
| --- | --- | --- | --- | --- |
| `pitcrypto.fr` | Afnic 404 : aucun enregistrement trouvé | Ancien contrôle : disponible ; nouvelle API de recherche : indisponible | `.fr` : 5,99 € TTC la première année ; 9,35 € TTC/an au renouvellement | **Priorité conditionnelle** ; vérifier l'enregistrabilité et le panier chez un bureau `.fr` avant achat. |
| `pitcrypto.com` | Verisign 200 : enregistré depuis le 22 décembre 2020, échéance affichée le 22 décembre 2026 | Ancien contrôle : indisponible ; nouvelle API : offre premium ou marché secondaire | Tarif `.com` standard : 10,19 € TTC puis 17,15 € TTC/an, **non applicable à ce nom déjà enregistré** | Ne pas traiter comme enregistrable au tarif standard. |
| `pitweb3.fr` | Afnic 404 : aucun enregistrement trouvé | Ancien contrôle : disponible ; nouvelle API : indisponible | `.fr` : 5,99 € TTC puis 9,35 € TTC/an, sous réserve du panier | Secours possible, distinct de l'identité produit PIT Crypto. |
| `pit-tools.fr` | Afnic 404 : aucun enregistrement trouvé | Ancien contrôle : disponible ; nouvelle API : indisponible | `.fr` : 5,99 € TTC puis 9,35 € TTC/an, sous réserve du panier | À réserver à une éventuelle famille PIT Tools ; pas l'URL de lancement Crypto. |

Ces résultats ont été lus le 6 novembre 2026. L'absence d'enregistrement RDAP n'est pas un résultat EPP `domain:check` et ne garantit pas qu'un nom puisse être commandé. Les deux endpoints Vercel se contredisent sur les quatre noms ; le nouveau résultat ne justifie pas non plus de déclarer `pitcrypto.com` libre puisque le registre montre une inscription active. Le prix premium renvoyé par Vercel pour `.com` n'est pas un devis vérifié et ne doit pas être confondu avec le tarif standard. **La disponibilité réelle et le montant final restent à vérifier dans le panier du registrar choisi.**

Sources : [API de recherche registrar Vercel](https://vercel.com/changelog/search-domains-without-authentication), [RDAP Afnic](https://rdap.nic.fr/domain/pitcrypto.fr), [RDAP Verisign](https://rdap.verisign.com/com/v1/domain/pitcrypto.com), [prix `.fr` OVHcloud](https://www.ovhcloud.com/fr/domains/tld/fr/), [prix `.com` OVHcloud](https://www.ovhcloud.com/fr/domains/tld/com/).

## Antériorités ciblées

[`pit.fr`](https://pit.fr/) est exploité par une ESN française sous le signe **Pit**, avec des services de développement logiciel. Il existe donc un recoupement d'activité avec la plateforme PIT Crypto. L'ajout de « Crypto » peut réduire la proximité descriptive, mais ne prouve pas l'absence de confusion ou de droit opposable. Une recherche professionnelle ciblée doit couvrir PIT, PIT Crypto et leurs variantes dans les marques, dénominations et noms de domaine pertinents pour logiciels et services Web3. L'[INPI distingue la recherche à l'identique et celle par similarité](https://www.inpi.fr/disponibilite-dune-marque-dun-logo-dun-nom-de-societe-dun-nom-de-domaine). Aucune conclusion de liberté d'exploitation n'est formulée ici.

## Route publique préparée, inactive

Le candidat utilise le Worker distinct `pit-v2-free-public`, avec `workers_dev:false`, `preview_urls:false`, aucun routeur public et aucune adresse canonique tant qu'un domaine n'est pas contrôlé. La configuration finale liera exclusivement l'hôte approuvé dans une zone Cloudflare active. [Cloudflare exige une zone active pour un Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). Le Worker `pit-v2-private-staging`, son Access, le Worker SIWE et les contrats restent hors périmètre.

Le paquet statique est préparé localement ; l'hébergement des assets n'ajoute pas de coût fixe selon la [grille Cloudflare](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) si le compte reste sur Workers Free. La lecture de l'abonnement du compte PIT renvoie 403 avec le jeton disponible : revalider l'éligibilité Free avant toute publication. Le coût du domaine est distinct.

**Blocage restant :** domaine réellement enregistrable puis contrôlé, avis sur les droits antérieurs, coordonnées professionnelles publiables et textes légaux validés. Aucun manifeste de publication final ni autorisation `GO` ne peut être calculé à ce stade.
