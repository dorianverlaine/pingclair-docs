---
title: Architecture
h1_emoji: '🏗️'
description: Les crates qui composent le serveur, le chemin qu'une requête y parcourt, et les points où HTTP/1.1, HTTP/2 et HTTP/3 se comportent différemment.
---

Un serveur web qui parle trois versions d'HTTP peut se tromper de deux façons :
chaque protocole finit par avoir sa propre copie des règles, ou l'un d'eux
oublie discrètement une règle que les autres appliquent. Pingclair évite les
deux en ne confiant à chaque transport que le déplacement des octets, et en
faisant passer chaque requête par une seule couche de politique partagée. Cette
page décrit les composants, le chemin d'une requête et les rares endroits où les
protocoles diffèrent encore. Elle décrit **v0.2.0-rc.3**.

## 🧱 Le serveur est un binaire construit à partir de quelques crates

Pingclair est un workspace Cargo. Le binaire `pingclair` lie les crates
ci-dessous, et chacune porte une seule responsabilité.

| Crate | Responsabilité |
| --- | --- |
| `pingclair` | Point d'entrée en ligne de commande : analyse des arguments, journalisation, démarrage, arrêt et rechargement. |
| `pingclair-config` | Compilateur de configuration : lit le Pingclairfile, le vérifie et produit la configuration que le serveur exécute. |
| `pingclair-proxy` | HTTP/1.1 et HTTP/2 sur Pingora, HTTP/3 sur quiche, répartition de charge et couche de politique partagée des requêtes. |
| `pingclair-static` | Service de fichiers statiques : lecture des fichiers, types MIME, requêtes partielles et conditionnelles, streaming. |
| `pingclair-fastcgi` | Le client FastCGI qu'utilise `php_fastcgi` pour joindre PHP-FPM. |
| `pingclair-tls` | Gestion des certificats : fichiers de certificats, autorité de certification interne et émission ACME. |
| `pingclair-api` | API d'administration pour inspecter l'état et recharger la configuration. |
| `pingclair-core` | Structures de données et cycle de vie partagés par les crates ci-dessus. |

## 🚦 Chaque requête traverse la même couche de politique

```text
client
  |
  |  TLS with ALPN, or QUIC
  v
listener             HTTP/1.1 and HTTP/2 on TCP, HTTP/3 on UDP
  |
  v
transport adapter    Pingora ProxyHttp for TCP, tokio-quiche for QUIC
  |
  v
policy layer         routing, matchers, headers, rate limits, access log
  |
  v
handler              file server | reverse proxy | FastCGI | static response
  |
  v
upstream or disk
```

L'adaptateur de transport transforme les trames du protocole en requête et la
transmet. Le routage, les règles d'en-têtes, la limitation de débit et le
journal d'accès n'existent qu'une fois, dans la couche de politique : ils se
comportent donc de la même façon sur HTTP/1.1, HTTP/2 et HTTP/3. Les deux
transports joignent aussi les upstreams par le même connecteur, si bien que le
pool de connexions, le TLS vers l'upstream et les délais sont également
partagés.

## 🌊 Ce qui vaut pour chaque requête

- **Les corps sont transmis en flux.** Les corps de requête et de réponse
  traversent le serveur par morceaux de taille bornée. La compression et le
  proxy ne rassemblent pas d'abord un corps complet ; un gros envoi ou un
  lecteur lent ne coûte donc pas une mémoire proportionnelle à la taille du
  corps.
- **Les connexions vers l'upstream sont réutilisées.** Les connexions
  keepalive vers les backends sont mises en pool. Un upstream désigné par un nom
  d'hôte est résolu de nouveau à l'intervalle fixé par `dns_refresh`, si bien
  qu'un conteneur backend qui redémarre sur une nouvelle adresse est suivi sans
  intervention.
- **La configuration est lue, jamais modifiée, pendant le traitement des
  requêtes.** Chaque requête lit un instantané publié de la configuration
  compilée. Un rechargement construit un nouvel instantané et le met en place ;
  les requêtes déjà en cours se terminent sur l'ancien.

## 🌐 Où les protocoles diffèrent

Quelques comportements dépendent du protocole. Ils sont listés ici pour que
personne n'ait à les découvrir en production.

| Domaine | Comportement dans v0.2.0-rc.3 |
| --- | --- |
| Trailers | Les trailers de requête ne sont transmis sur aucun protocole. Une requête qui en déclare reçoit `501` avant le début de la réponse ; un flux HTTP/3 dont la réponse a déjà commencé est réinitialisé à la place. Une réponse d'upstream qui annonce des trailers reçoit `502`. |
| `CONNECT` | Pingclair n'ouvre aucun tunnel. HTTP/1.1 et HTTP/2 répondent `405`. HTTP/3 réinitialise une requête `CONNECT` standard comme malformée, et répond `501` à une requête qui porte aussi `:scheme` et `:path`. |
| FastCGI | `php_fastcgi` fonctionne sur tous les protocoles, HTTP/3 compris. |

📌 **Prochaine version.** Sur `main`, `CONNECT` reçoit `405` avec un en-tête
`Allow` sur tous les protocoles, et `TRACE` reçoit la même réponse. Ces
changements ne figurent pas dans v0.2.0-rc.3 ; le
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
les consigne sous Unreleased.

## ⚠️ Les upgrades WebSocket échouent par intermittence sous charge

Pingclair relaie WebSocket, mais environ 10 à 15 % des upgrades échouent quand
la machine est chargée. Vu de l'extérieur, un upgrade raté est une connexion
fermée juste après la réponse `101 Switching Protocols`. La cause est une
situation de concurrence dans la crate amont `pingora-proxy`, et non dans la
gestion des upgrades par Pingclair ; aucune configuration ne l'évite. Une
machine de développement au repos la reproduit rarement, d'où cette mention.
Issue amont :
[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946).

## 🧭 Pages liées

- [Modèle de configuration](/fr/concepts/configuration/) : comment un
  Pingclairfile devient l'instantané décrit ci-dessus.
- [État du projet](/fr/project/status/) : ce que la version prend en charge et
  ce qu'elle refuse.
