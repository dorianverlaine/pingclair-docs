---
title: Benchmarks
h1_emoji: '📊'
description: Ce qui est mesuré, dans quelles conditions, et d'où viennent les chiffres.
---

Pingclair est mesuré face à nginx et Caddy sur la même machine, chaque candidat
s'exécutant dans un conteneur limité à deux cœurs, avec le même nombre de
workers et la même charge utile de 1 Kio. Le backend du reverse proxy tourne
dans son propre conteneur sur le même réseau Docker, et le générateur de charge
s'exécute nativement.

## 📊 Résultats

Chaque valeur est la médiane de trois séries entrelacées de 50 000 requêtes, et
une ligne ne compte que si toutes les requêtes ont abouti.

| Scénario | Pingclair | nginx 1.31.6 | Caddy 2.11.4 |
| --- | ---: | ---: | ---: |
| HTTP/1.1 statique | 46 125 | 39 478 | 18 266 |
| HTTPS/1.1 statique | 40 721 | 31 508 | 19 978 |
| HTTP/2 statique | 92 369 | 41 972 | 17 424 |
| HTTP/3 statique | 56 180 | 55 638 | 22 912 |
| Reverse proxy HTTP/1.1 | 20 856 | 22 584 | 17 117 |
| Reverse proxy HTTPS/1.1 | 20 297 | 21 944 | 16 660 |
| Reverse proxy HTTP/2 | 23 181 | 20 396 | non terminé |
| Reverse proxy HTTP/3 | 28 078 | 22 213 | non terminé |

Les chiffres sont des requêtes par seconde. Face à nginx, Pingclair est en
avance sur les lignes statiques HTTP/1.1, HTTPS/1.1 et HTTP/2 (1,2x, 1,3x et
2,2x respectivement), tandis que HTTP/3 statique est pratiquement à égalité.
Sur la charge de reverse proxy, il est 14 % devant en HTTP/2 et 26 % devant en
HTTP/3, alors que HTTP/1.1 et HTTPS/1.1 restent environ 8 % derrière nginx.

## 📐 Conditions qui limitent ces chiffres

- **La machine est un ordinateur portable.** Les mesures ont été prises sur un
  Apple M2 avec OrbStack. Le débit absolu n'est pas une affirmation de
  capacité, et les ratios ne décrivent la performance relative que sous cette
  charge contrôlée.
- **Les lignes se comparent à l'intérieur d'un protocole.** HTTP/3 utilise un
  générateur de charge différent des autres lignes : le débit absolu ne se
  compare donc pas d'un protocole à l'autre, seulement entre serveurs d'une
  même ligne.
- **Les lignes incomplètes ne sont pas des comparaisons.** Sur cette machine et
  ce banc d'essai, Caddy n'a pas terminé les lignes proxifiées HTTP/2 et
  HTTP/3 : la rotation des connexions amont a épuisé les ports éphémères
  disponibles du conteneur à la concurrence testée. Ces cellules sont
  signalées comme incomplètes plutôt que mesurées sous une autre charge.
- **Les résultats dépendent de la machine.** La position relative des serveurs
  change avec l'architecture du processeur, le noyau, le nombre de workers et
  l'implémentation TLS.

## 🧾 Source

La méthode, les fichiers de configuration, le banc d'essai et les tableaux de
résultats complets se trouvent dans le dépôt du serveur :

- [Méthode de benchmark](https://github.com/dorianverlaine/pingclair/blob/main/benchmarks/README.md)
- [Section des résultats courants](https://github.com/dorianverlaine/pingclair#-benchmarks)

Les preuves brutes d'exécution sont conservées localement par le mainteneur et
ne sont volontairement pas publiées.
