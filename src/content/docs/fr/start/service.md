---
title: Exécution comme service
h1_emoji: '🔁'
sidebar:
  order: 4
description: Ce que fait l'unité systemd installée, comment la démarrer, l'arrêter et la recharger, où vont les journaux, et à quoi ressemble une configuration en échec vue de l'extérieur.
---

L'installateur laisse une unité `systemd` activée et démarrée. Cette page lit
cette unité ligne par ligne, montre comment la piloter, et décrit les deux formes
d'échec telles qu'on les voit de l'extérieur : un serveur qui ne démarre pas et
une configuration que le serveur en cours refuse.

## 🧾 Ce que fait l'unité

```bash
systemctl cat pingclair
```

Les clés qui comptent sont celles-ci :

```text
[Service]
Type=notify
NotifyAccess=main
User=pingclair
Group=pingclair
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Environment="RUST_LOG=info"
Environment="PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs"
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -USR1 $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=on-failure
RestartPreventExitStatus=1
RestartSec=5s
LimitNOFILE=1048576
LimitNPROC=512
ProtectSystem=full
PrivateTmp=true
NoNewPrivileges=true
```

Lisez-les dans l'ordre :

- `Type=notify` et `NotifyAccess=main` : le serveur prévient `systemd` quand ses
  écouteurs sont liés, donc `systemctl start` bloque jusqu'à ce que le proxy
  puisse répondre, et non jusqu'à ce que le processus existe.
- `User=pingclair` avec `AmbientCapabilities=CAP_NET_BIND_SERVICE` : le serveur
  tourne sans privilèges et peut tout de même se lier aux ports 80 et 443.
- `PINGCLAIR_TLS_STORE` : les certificats vivent dans
  `/var/lib/pingclair/certs`. Le compte de service n'a pas de répertoire
  personnel ; laisser la valeur par défaut du binaire enverrait le magasin vers
  un `$HOME` inexistant.
- Il n'y a délibérément aucun `ExecStartPre` qui lancerait `validate`. Cela
  ressemble à l'endroit sûr pour ce contrôle, et c'est le piège : `systemd`
  applique `RestartPreventExitStatus=` au processus principal, pas à une
  pré-commande qui échoue, donc une configuration que le compilateur refuse
  était retentée toutes les cinq secondes au lieu de laisser l'unité en échec.
  Le serveur compile le fichier lui-même avant de lier quoi que ce soit et sort
  avec le code 1 quand il le refuse, ce qui est exactement le code pour lequel
  la politique de redémarrage ci-dessus a été écrite — `pingclair run` existe
  pour être ce processus.
- `ExecReload` envoie `SIGUSR1`, le signal que le serveur traite comme « relis le
  fichier ». `SIGHUP` est ignoré délibérément, et une unité qui l'envoyait
  annonçait un succès pendant que l'ancienne configuration continuait de servir
  ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)). Comme
  `systemd` ne peut observer que la sortie de `kill`, le serveur publie ce qu'il a
  fait du fichier sur la ligne d'état de l'unité — `Serving (reloaded 1
  listener(s) in 323.341µs)`, ou `Reload rejected: …` — que `systemctl status`
  affiche. La [section sur le rechargement](#-ce-que-signifie-un-rechargement)
  plus bas est la version longue.
- `Restart=on-failure` avec `RestartPreventExitStatus=1` et `RestartSec=5s` : le
  code de sortie 1 signifie que la configuration ou le magasin de certificats
  était inutilisable, donc l'unité reste `failed` pour qu'un opérateur regarde,
  au lieu d'être retentée toutes les cinq secondes. Toute autre défaillance est
  redémarrée.
- `ProtectSystem=full`, `PrivateTmp`, `NoNewPrivileges`, `LimitNPROC` et
  `LimitNOFILE` : le serveur obtient la vue du système de fichiers et les limites
  de processus dont il a besoin, et rien de plus.

Les deux chemins d'installation écrivent ce même fichier. La commande en une ligne
embarque une copie octet pour octet de `scripts/pingclair.service` — `just
repo-lint` échoue si les deux divergent — donc une installation neuve par
`curl | bash` et une installation depuis un dépôt produisent la même unité, et
`systemd-analyze verify /etc/systemd/system/pingclair.service` ne dit rien de
cette unité, sur l'un comme sur l'autre chemin.

## 🎛️ Piloter le service

`pc service` enveloppe `systemctl` pour cette unité : les deux sont
interchangeables.

| Tâche | Avec `pc` | Avec `systemctl` |
| --- | --- | --- |
| Démarrer | `sudo pc service start` | `sudo systemctl start pingclair` |
| Arrêter | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| Recharger la configuration | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| Redémarrer, après un changement d'écouteur ou de politique globale | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| État | `pc service status` | `systemctl status pingclair` |
| Suivre le journal | — | `journalctl -u pingclair -f` |

`pc service status` affiche la vue de l'unité, y compris la ligne de disponibilité
envoyée par le serveur :

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
       Docs: https://github.com/dorianverlaine/pingclair
   Main PID: 1808 (pingclair)
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

## 🔁 Ce que signifie un rechargement

Une configuration modifiée dans `/etc/Pingclair/Pingclairfile` atteint le serveur
en cours d'exécution par un signal, et deux commandes l'envoient.

`SIGUSR1` est le signal de rechargement, et il n'exige aucune configuration :

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload` — ou `sudo systemctl reload pingclair`, qui est le même appel
— envoie ce signal à votre place. L'`ExecReload` de l'unité est
`/bin/kill -USR1 $MAINPID` : la commande évidente est désormais celle qui
fonctionne. Une unité qui envoyait `SIGHUP` annonçait un succès et n'appliquait
rien, ce que l'[issue #66](https://github.com/dorianverlaine/pingclair/issues/66)
a enregistré.

`pingclair reload` atteint le même code par l'Admin API et rapporte ce que le
serveur a pensé du fichier, ce qui exige l'option `admin` du bloc des options
globales :

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload` ne peut rapporter qu'une chose : que `kill` a délivré le
signal. Le serveur lit le fichier ensuite, donc son verdict part sur la ligne
d'état de l'unité et dans le journal. `pc service reload` le dit, au lieu
d'affirmer que la configuration a été appliquée :

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

Quand le serveur en cours ne peut pas appliquer ce que le fichier demande,
l'ancienne configuration continue de servir et la ligne d'état dit quel
changement a été refusé. Déplacer le site de `:80` vers `:8080` est le cas
courant, parce que la topologie des écouteurs est reconstruite avec les sockets
au démarrage :

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

Quelle que soit la voie choisie, une configuration qui ne compile pas laisse la
précédente en service. Validez d'abord :

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

La politique valable pour tout le processus fait exception. Les options établies
au démarrage, comme `trusted_proxies`, ne prennent effet qu'après un redémarrage :
`sudo pc service restart`. Une configuration qui ajoute ou déplace un écouteur est
refusée de la même façon — la ligne d'état nomme les adresses ajoutées et
retirées — parce que le rechargement applique la politique, pas un nouveau socket
d'écoute.

## 📜 Journaux

L'unité fixe `RUST_LOG=info` et envoie tout au journal :

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

Le démarrage, les rechargements, le travail sur les certificats et une ligne
d'accès par requête y apparaissent :

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 📋 Step 1/3: Validating configuration...
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

Un rechargement que le serveur refuse est journalisé de la même façon, avec la
raison et la mention que rien n'a changé :

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

Pour un journal à part, avec rotation, configurez une destination `log` et
écrivez-la sous `/var/log/pingclair`, que l'installateur crée et attribue à
l'utilisateur de service.

## ⚠️ Quand le service ne démarre pas

- **`is-active` affiche `activating` et `NRestarts` ne cesse d'augmenter.** C'est
  le comportement retiré d'une unité plus ancienne, et il avait deux causes :
  elle portait `Restart=always` sans `RestartPreventExitStatus`, et elle lançait
  `validate` comme commande `ExecStartPre`, ce que `RestartPreventExitStatus` ne
  couvre pas — donc une configuration que le compilateur refuse était retentée
  toutes les cinq secondes et ressemblait à une unité qui ne se stabilise jamais
  plutôt qu'à une unité en échec. L'unité installée porte
  `Restart=on-failure` + `RestartPreventExitStatus=1` et aucune pré-commande, et
  un démarrage refusé laisse `is-active` à `failed` avec `NRestarts` à zéro. Sur
  une installation plus ancienne, arrêtez la boucle avant de déboguer :
  `sudo systemctl stop pingclair`, corrigez le fichier, puis
  `sudo systemctl reset-failed pingclair`.
- **`Job for pingclair.service failed because the control process exited with
  error code`.** Le serveur a refusé la configuration avant de lier quoi que ce
  soit, et la raison du compilateur est dans le journal, par exemple
  ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``.
- **`TLS store /var/lib/pingclair/certs is not writable: Permission denied`.** Le
  magasin appartient au compte de service. Vérifiez
  `sudo ls -ld /var/lib/pingclair/certs` : il doit appartenir à `pingclair`.
- **`systemd-analyze verify` signale `Missing '=', ignoring line` pour l'unité
  installée.** Une installation en une ligne plus ancienne écrivait une unité
  dont les commentaires avaient été développés par le shell — 25 lignes de sortie
  de `--help`, que `systemd` ignore. Réinstaller avec l'installateur actuel écrit
  l'unité telle quelle et le signalement disparaît.
- **Rien ne répond alors que l'unité tourne.** Les écouteurs sont liés et les
  requêtes n'arrivent pas. Vérifiez le pare-feu du fournisseur puis celui de
  l'hôte, comme sur la [page d'installation](/fr/start/install/).

## 🧭 Étapes suivantes

- [Mise à jour et désinstallation](/fr/start/upgrade/) : ce qu'une réexécution
  conserve, et comment tout retirer.
- [HTTPS](/fr/start/https/) : les certificats, où vit le magasin, et pourquoi
  `pingclair trust` a besoin de `PINGCLAIR_TLS_STORE`.
- [`log`](/fr/reference/directives/#log) : la destination de journal d'accès que
  cette page lit depuis le journal système.
