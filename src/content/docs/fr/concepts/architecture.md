---
title: Architecture
h1_emoji: '🏗️'
description: Les composants du serveur et le chemin d'une requête à travers eux.
---

## 🧱 Composants

Pingclair est un workspace Cargo. Le serveur en service est le binaire
`pingclair`, qui lie les crates ci-dessous.

| Crate | Responsabilité |
| --- | --- |
| `pingclair` | Point d'entrée en ligne de commande : analyse des arguments, journalisation, démarrage et enveloppe de service. |
| `pingclair-config` | Compilateur de configuration : analyse lexicale, analyse syntaxique et contrôles sémantiques du Pingclairfile. |
| `pingclair-proxy` | Proxy HTTP/1.1 et HTTP/2 sur Pingora, écouteur HTTP/3 sur quiche, répartition de charge et couche de politique partagée. |
| `pingclair-static` | Service de fichiers statiques : lectures, types MIME, requêtes partielles et diffusion en flux. |
| `pingclair-tls` | Gestion des certificats : certificats manuels, autorité interne persistante et émission ACME automatique. |
| `pingclair-api` | Admin API pour inspecter l'état et recharger la configuration. |
| `pingclair-core` | Structures de données et cycle de vie du serveur partagés par les crates ci-dessus. |

## 🚦 Le chemin d'une requête

```text
client
  |
  |  TLS avec ALPN, ou QUIC
  v
listener             HTTP/1.1 et HTTP/2 sur TCP, HTTP/3 sur UDP
  |
  v
transport adapter    Pingora ProxyHttp pour TCP, tokio-quiche pour QUIC
  |
  v
policy layer         routage, matchers, en-têtes, limites de débit, journal d'accès
  |
  v
handler              file server | reverse proxy | FastCGI | réponse statique
  |
  v
amont ou disque
```

Les deux transports convergent vers la même couche de politique : le routage,
la gestion des en-têtes, la limitation de débit et le journal d'accès se
comportent de la même façon en HTTP/1.1, HTTP/2 et HTTP/3. Les transports ne
diffèrent que là où le protocole l'impose, et ces différences sont listées
ci-dessous.

## 🌊 Propriétés du traitement des requêtes

- **Les corps sont diffusés en flux.** Les corps de requête et de réponse
  traversent le proxy par blocs bornés. La compression, les intergiciels et la
  proxification ne mettent pas en tampon un corps complet : un envoi volumineux
  ou un lecteur lent ne consomme donc pas une mémoire proportionnelle à la
  taille du corps.
- **Les connexions amont sont mutualisées.** Les connexions keepalive vers les
  backends sont réutilisées. Les amonts désignés par un nom d'hôte sont
  résolus à nouveau à l'intervalle défini par `dns_refresh` : un conteneur qui
  redémarre sur une nouvelle adresse est suivi sans intervention.
- **L'état d'exécution est immuable au moment de la requête.** Les requêtes
  lisent un instantané publié. Un rechargement publie un nouvel instantané au
  lieu de modifier celui qui est en service.

## 🌐 Comportement propre à chaque protocole

Certains comportements diffèrent selon le protocole, par conception. Ils sont
listés ici plutôt que découverts plus tard :

| Domaine | Comportement |
| --- | --- |
| Trailers | Les trailers de requête déclarés ne sont pas transmis. Le serveur répond `501` avant l'engagement de la réponse, réinitialise un flux HTTP/3 déjà engagé, et répond `502` lorsqu'un amont annonce des trailers de réponse. |
| CONNECT | `CONNECT` et `CONNECT` étendu renvoient `501` en HTTP/3 jusqu'à ce que la prise en charge des tunnels soit implémentée. |
| FastCGI | `php_fastcgi` fonctionne en HTTP/1.1 et HTTP/2. Les routes qui exigent FastCGI renvoient `501` en HTTP/3 jusqu'à ce que ce chemin dispose de son propre client FastCGI. |

## ⚠️ Défaut connu

Les mises à niveau WebSocket échouent par intermittence sous charge : environ
10 à 15 % des mises à niveau sur une machine occupée. La cause est une course
dans la crate amont `pingora-proxy`, et non dans la gestion des mises à niveau
de Pingclair ; elle est invisible sur une machine de développement au repos,
d'où cette documentation. Ticket amont :
[cloudflare/pingora#946](https://github.com/cloudflare/pingora/issues/946).
