---
title: État du projet
h1_emoji: '📌'
description: Ce que la version courante prend en charge, ce qu'elle refuse, et les défauts connus.
---

## 📌 Version

La version courante est **v0.2.0-rc.3**, une release candidate. Ses
[notes de version](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)
listent ce qui a changé et les défauts connus au moment du tag.

La branche `v0.1.x` n'est plus maintenue. Elle ne reçoit ni correctifs, ni
rétroportages, ni avis de sécurité ; `v0.1.x` analysait en outre le champ
`api_key` de l'Admin API sans le lire, si bien que ce champ ne protégeait rien.

## ✅ Pris en charge

| Domaine | État |
| --- | --- |
| Protocoles | HTTP/1.1 et HTTP/2 sur TCP, HTTP/3 sur QUIC, à partir d'une seule configuration. |
| TLS | Certificats publics automatiques via ACME, autorité de certification interne persistante, et fichiers de certificat et de clé manuels. |
| Fichiers statiques | Service de fichiers avec compression `zstd` et `gzip`, requêtes partielles et requêtes conditionnelles. |
| Reverse proxy | Amonts multiples, plusieurs politiques de répartition de charge, contrôles de santé actifs et amonts de secours. |
| FastCGI | `php_fastcgi` en HTTP/1.1 et HTTP/2. |
| Limitation de débit | Limitation locale exacte par matcher. |
| Observabilité | Journal d'accès avec rotation, et métriques Prometheus. |
| Administration | Admin API pour inspecter l'état et recharger la configuration. |

## 🛡️ Refusé par conception

Le format de configuration définit plus de noms que le serveur n'en implémente.
Un nom que le serveur ne peut pas honorer est refusé au chargement, par son nom,
avec un message indiquant que la fonctionnalité manque. Exemples les plus
souvent cités par les lecteurs :

- les directives `map`, `invoke` et `tracing` ;
- l'option `storage`, car les certificats et l'état ne sont stockés que sur le
  disque local ;
- `on_demand_tls` et les options d'agrafage OCSP ;
- `handle_errors`, dont le type de configuration existe mais n'effectue aucun
  travail ;
- `encode br`, faute d'encodeur Brotli en flux.

Les listes complètes sont maintenues dans le README du dépôt du serveur, et un
test échoue lorsque l'analyseur refuse un nom que la liste ne mentionne pas.

## ⚠️ Limites connues

- **Le stockage des certificats est local.** Plusieurs instances ne peuvent pas
  partager un même magasin de certificats, car ce magasin est un répertoire sur
  disque.
- **DNS-01 n'a qu'un fournisseur.** `tls { dns cloudflare <token> }` et l'option
  globale `acme_dns` sont implémentés pour Cloudflare. Tout autre nom de
  fournisseur est refusé au démarrage plutôt qu'accepté et ignoré.
- **Trailers et tunnels HTTP/3.** Les trailers de requête déclarés ne sont pas
  transmis (`501` avant l'engagement de la réponse, réinitialisation du flux
  ensuite), les trailers d'amont produisent `502`, et `CONNECT` renvoie `501`.
- **FastCGI en HTTP/3 renvoie `501`** jusqu'à ce que ce chemin dispose de son
  propre client FastCGI.
- **Les mises à niveau WebSocket échouent par intermittence sous charge**,
  environ 10 à 15 % sur une machine occupée. La cause est une course dans la
  crate amont `pingora-proxy`
  ([cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)),
  et non dans la gestion propre à Pingclair ; une machine au repos ne la
  reproduit pas.

## 🐛 Signalement

Les défauts et les erreurs de documentation se signalent via le
[suivi de tickets](https://github.com/dorianverlaine/pingclair/issues). Une
politique de sécurité désignant un canal de signalement privé n'est pas encore
publiée.

## 📚 Documents liés

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) :
  ce qui a changé entre les versions.
- [Benchmarks](/fr/project/benchmarks/) : conditions de mesure et résultats.
- [Architecture](/fr/concepts/architecture/) : composants et chemin d'une
  requête.
