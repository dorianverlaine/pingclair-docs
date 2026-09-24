---
title: Benchmarks
h1_emoji: '📊'
description: Comment Pingclair se compare à nginx et Caddy sur une charge contrôlée, les conditions de cette mesure, et ce que les chiffres ne montrent pas.
---

Un chiffre de débit n'a de sens qu'à côté des conditions qui l'ont produit.
Cette page donne la comparaison la plus récente et, juste à côté, chacune des
conditions qui limitent ce qu'elle montre.

## 🧭 Comment la comparaison a été menée

- **Versions.** Pingclair `v0.2.0-rc.3` (le binaire publié), nginx 1.31.6 et
  Caddy 2.11.4.
- **Machine.** Un seul portable Apple M2 sous OrbStack.
- **Limites.** Chaque serveur tourne dans un conteneur limité à deux CPU, avec
  le même nombre de workers et la même charge utile de 1 Kio.
- **Topologie.** Le backend du reverse proxy tourne dans son propre conteneur,
  sur le même réseau Docker.
- **Générateur de charge.** HTTP/1.1, HTTPS/1.1 et HTTP/2 utilisent un `h2load`
  natif. HTTP/3 utilise un `h2load` compilé avec ngtcp2, dans le même réseau
  Docker.

## 📊 Résultats

Chaque valeur est un nombre de requêtes par seconde : la médiane de trois passes
entrelacées de 50 000 requêtes. Une ligne ne compte que si toutes les requêtes
ont réussi.

| Scénario | Pingclair | nginx 1.31.6 | Caddy 2.11.4 |
| --- | ---: | ---: | ---: |
| HTTP/1.1 statique | 46 125 | 39 478 | 18 266 |
| HTTPS/1.1 statique | 40 721 | 31 508 | 19 978 |
| HTTP/2 statique | 92 369 | 41 972 | 17 424 |
| HTTP/3 statique | 56 180 | 55 638 | 22 912 |
| Reverse proxy HTTP/1.1 | 20 856 | 22 584 | 17 117 |
| Reverse proxy HTTPS/1.1 | 20 297 | 21 944 | 16 660 |
| Reverse proxy HTTP/2 | 23 181 | 20 396 | non terminé |
| Reverse proxy HTTP/3 | 28 078 | 22 213 | non terminé |

Face à nginx, Pingclair est devant sur les lignes statiques HTTP/1.1, HTTPS/1.1
et HTTP/2 (respectivement 1,2×, 1,3× et 2,2×), tandis que HTTP/3 statique est
pratiquement à égalité. Sur la charge de reverse proxy, il est devant de 14 %
en HTTP/2 et de 26 % en HTTP/3, tandis que HTTP/1.1 et HTTPS/1.1 restent environ
8 % derrière nginx.

## 📐 Conditions qui limitent ces chiffres

- **La machine est un portable.** Le débit absolu n'est pas une affirmation de
  capacité, et les rapports ne décrivent les performances relatives que sous
  cette charge contrôlée.
- **Comparez à l'intérieur d'une ligne.** Le générateur de charge HTTP/3 tourne
  dans un autre environnement que les autres ; le débit absolu ne doit donc pas
  se comparer d'un protocole à l'autre, seulement entre serveurs sur une même
  ligne.
- **Les lignes incomplètes ne sont pas des comparaisons.** Sur cette machine et
  avec ce banc de test, Caddy n'a pas terminé les lignes HTTP/2 et HTTP/3 en
  reverse proxy : le renouvellement des connexions vers l'upstream a épuisé les
  ports éphémères disponibles du conteneur à la concurrence testée. Ces cases
  sont signalées comme incomplètes plutôt que mesurées sous une autre charge.
- **Les résultats dépendent de la machine.** La position relative des serveurs
  change avec l'architecture du processeur, le noyau, le nombre de workers et
  l'implémentation TLS.

## 🧾 Source

Le tableau est celui que publie le README du dépôt du serveur. La méthodologie,
les règles qu'une exécution doit respecter avant qu'un chiffre ne compte, et le
banc de test se trouvent également dans le dépôt du serveur :

- [Méthodologie des benchmarks](https://github.com/dorianverlaine/pingclair/blob/main/benchmarks/README.md)
- [Comparaison publiée](https://github.com/dorianverlaine/pingclair#-benchmarks)

Les données brutes de chaque exécution ne sont pas publiées.
