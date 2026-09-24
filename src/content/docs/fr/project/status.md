---
title: État du projet
h1_emoji: '📌'
description: Ce que la version courante prend en charge, ce qu'elle refuse par conception, les limites et défauts connus, et ce qui change dans la prochaine version.
---

Cette page répond à une question à se poser avant de déployer : la version
courante fait-elle ce dont vous avez besoin, et où s'arrête-t-elle ? Elle décrit
**v0.2.0-rc.3**, la dernière version publiée.

## 📌 La version courante est une release candidate

La version courante est **v0.2.0-rc.3**. Ses
[notes de version](https://github.com/dorianverlaine/pingclair/releases/tag/v0.2.0-rc.3)
listent ce qui a changé et les défauts connus au moment du tag.

La branche `v0.1.x` n'est plus maintenue. Elle ne reçoit ni correctifs, ni
rétroportages, ni avis de sécurité. Quittez-la : `v0.1.x` analysait le champ
`api_key` de l'API d'administration sans jamais le lire, si bien que son API
d'administration n'authentifiait personne.

## ✅ Ce que la version prend en charge

| Domaine | Prise en charge |
| --- | --- |
| Protocoles | HTTP/1.1 et HTTP/2 sur TCP, et HTTP/3 sur QUIC, à partir d'une seule configuration. |
| TLS | Certificats publics automatiques via ACME, autorité de certification interne persistante, et fichiers de certificat que vous fournissez. |
| Fichiers statiques | Service de fichiers avec compression `zstd` et `gzip`, requêtes partielles et requêtes conditionnelles. |
| Reverse proxy | Plusieurs upstreams, plusieurs politiques de répartition de charge, contrôles de santé actifs et upstreams de secours. |
| FastCGI | `php_fastcgi` sur HTTP/1.1, HTTP/2 et HTTP/3. |
| Limitation de débit | Limitation de débit locale et exacte par matcher. |
| Observabilité | Journal d'accès avec rotation, et métriques Prometheus. |
| Administration | API d'administration pour inspecter l'état et recharger la configuration. |

## 🛡️ Les noms que le serveur refuse par conception

Le format Caddyfile définit plus de noms que Pingclair n'en implémente. Un nom
que le serveur ne peut pas honorer est refusé au chargement du fichier, avec un
message qui nomme la fonctionnalité manquante. Une configuration qui en contient
un ne démarre pas. Les noms sur lesquels les lecteurs s'interrogent le plus
souvent :

- les directives `map`, `invoke` et `tracing` ;
- l'option `storage`, car les certificats et l'état ne vivent que sur le disque
  local ;
- les options `on_demand_tls` et `ocsp_stapling` ;
- `handle_errors` ; les pages d'erreur personnalisées passent plutôt par
  `error_page` ;
- `encode br`, faute d'encodeur Brotli en flux.

Les listes complètes figurent dans le README du dépôt du serveur. Un test y
échoue quand l'analyseur refuse un nom que le README ne mentionne pas ; la liste
ne peut donc pas prendre de retard sur le code.

## ⚠️ Limites connues

- **Le stockage des certificats est local.** Plusieurs instances ne peuvent pas
  partager un même magasin de certificats, car le magasin est un répertoire sur
  le disque.
- **DNS-01 n'aboutit pas dans cette version.** `tls { dns cloudflare <token> }`
  et l'option globale `acme_dns` sont acceptés pour Cloudflare, et tout autre
  fournisseur est refusé par son nom. Dans v0.2.0-rc.3, cependant, chaque
  commande DNS-01 se termine `Invalid`, car l'enregistrement TXT porte une
  valeur erronée. Le correctif est sur `main`
  ([HTTPS](/fr/start/https/#-dns-01-et-noms-génériques)).
- **Aucun protocole ne transmet les trailers, et aucun n'ouvre de tunnel.** Les trailers de requête déclarés sont
  refusés sur tous les protocoles, et HTTP/3 réinitialise `CONNECT`
  ([Architecture](/fr/concepts/architecture/#-où-les-protocoles-diffèrent)).
- **Les upgrades WebSocket échouent par intermittence sous charge**, environ
  10 à 15 % sur une machine chargée. La cause est une situation de concurrence
  dans la crate amont `pingora-proxy`
  ([cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946)),
  et une machine au repos la reproduit rarement.

## 🔁 Ce qui change dans la prochaine version

Les changements ci-dessous se trouvent sur `main` et ne figurent pas dans
v0.2.0-rc.3. Plusieurs modifient le comportement lors de la mise à jour ; le
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
les liste tous sous Unreleased, avec des notes de mise à jour.

- **L'ordre des routes suit Caddy.** C'est l'ordre des directives, et non le
  chemin le plus spécifique, qui décide de la route qui répond
  ([Modèle de configuration](/fr/concepts/configuration/#-quelle-route-répond-à-une-requête)).
- **La compression n'a lieu que là où `encode` la demande.** Un site sans
  `encode` sert ses fichiers sans compression.
- **Plus de limite par défaut sur le corps de requête.** La limite de 1 Mio par
  défaut disparaît ; définissez `request_body { max_size … }` si vous comptiez
  dessus.
- **`remote_ip` et `client_ip` divergent.** `remote_ip` compare le pair de la
  connexion, et `client_ip` le client après application de `trusted_proxies`.
  Pour bloquer des clients dans un Pingclairfile, ciblez `client_ip` et
  utilisez `abort` ; `blocked_ips` n'existe que dans la configuration JSON.
- **`CONNECT` et `TRACE` reçoivent `405`**, avec un en-tête `Allow`, sur tous
  les protocoles.
- **HSTS suit la connexion.** `Strict-Transport-Security` n'est envoyé que sur
  les réponses chiffrées, et un Pingclairfile l'active avec
  `header Strict-Transport-Security "max-age=…"`.
- **Un arrêt se fait en douceur.** `SIGTERM` laisse les requêtes en cours se
  terminer dans la limite de `grace_period` (30 secondes par défaut).
- **Un port d'administration ou HTTP/3 déjà pris arrête le démarrage**, au lieu
  d'être simplement journalisé.
- **Les erreurs de passerelle disent qui les a écrites.** Un `502` ou un `504`
  généré par Pingclair porte un en-tête `Proxy-Status`.
- **DNS-01 fonctionne**, et un site générique commande un seul certificat
  générique.
- **`storage file_system <path>` et `ocsp_stapling off` sont acceptés.**
- **L'autorité interne change d'emplacement** pour adopter l'organisation de
  Caddy. L'ancienne n'est pas migrée : une nouvelle racine est créée, et les
  clients doivent de nouveau lui faire confiance.

## 🐛 Signaler un défaut

Signalez les défauts et les erreurs de documentation sur le
[gestionnaire d'issues](https://github.com/dorianverlaine/pingclair/issues).
Aucune politique de sécurité avec canal de signalement privé n'a encore été
publiée.

## 📚 Pages liées

- [CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md) :
  ce qui a changé d'une version à l'autre.
- [Benchmarks](/fr/project/benchmarks/) : conditions de mesure et résultats.
- [Architecture](/fr/concepts/architecture/) : composants et chemin des
  requêtes.
