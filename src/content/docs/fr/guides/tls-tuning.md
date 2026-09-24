---
title: 'TLS : ce qui se règle'
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Les réglages TLS et de protocole que Pingclair respecte, ceux qu'il refuse par leur nom, et comment exiger des certificats clients ou déplacer un magasin de certificats d'un hôte à l'autre.
---

Pingclair a peu de réglages TLS, et c'est voulu : un nom obtient
automatiquement un certificat, et les réglages de cette page décident comment.
Tout autre réglage TLS que Caddy accepte est refusé par son nom au lieu d'être
ignoré ; une configuration ne fait donc jamais discrètement moins que ce
qu'elle annonce. Chaque résultat ci-dessous a été mesuré sur un hôte réel.

📌 Cette page décrit **v0.2.0-rc.3**, la dernière version publiée. Les
changements qui n'existent que sur la branche `main` du serveur sont signalés
par **Prochaine version**.

## 🧾 Avant de commencer

- Pingclair installé et en cours d'exécution ([Installation](/fr/start/install/)).
- Pour les parties qui concernent l'autorité de certification, un nom qui pointe
  vers l'hôte, ou l'autorité interne pour une machine de laboratoire
  ([HTTPS](/fr/start/https/)).

## 🌐 Quels protocoles sont servis

L'ensemble des protocoles se déclare dans le bloc global `servers` :

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

Mesuré avec `sudo ss -lun | grep ':443 '` :

| Configuration | Écouteur UDP 443 |
| --- | --- |
| `protocols h1 h2` | 0 — pas de HTTP/3 |
| `protocols h1 h2 h3` | 1 — HTTP/3 activé |

⚠️ La liste décide de **HTTP/3**, et seulement de HTTP/3. Lister `h1` seul ne
désactive pas HTTP/2 : avec `protocols h1`, un client qui proposait `h2` a
tout de même négocié HTTP/2. La seule chose que le serveur lit dans la liste est
la présence de `h3` ; aucun réglage ne désactive donc HTTP/2. Sans ligne
`protocols`, HTTP/3 est activé.

Par site, `http3 off` est censé retirer un nom de HTTP/3 pendant que l'écouteur
QUIC continue de servir les autres :

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

⚠️ Dans v0.2.0-rc.3, cette option est acceptée et reste sans effet.
**Prochaine version :** elle prend effet, et le site cesse d'annoncer HTTP/3
dans `Alt-Svc`.

## 🏛️ Sources de certificats

Trois sources, toutes montrées sur la [page HTTPS](/fr/start/https/) :

| Source | Configuration | Usage |
| --- | --- | --- |
| Let's Encrypt | un nom public seul | Noms publics, renouvelés en arrière-plan. |
| Autorité interne | `tls internal` | Noms de laboratoire, origines privées, tunnels. |
| Vos propres fichiers | `tls { cert … key … }` | Certificats émis ailleurs. |

Le renouvellement tourne en arrière-plan. L'option globale
`renewal_window_ratio` fixe à quel moment il commence, en fraction de la durée
de vie de chaque certificat.

## 🔐 Certificats clients

`client_auth` fait demander au serveur un certificat au client. Créez une petite
autorité et un certificat client avec `openssl`, puis faites pointer le site
vers le **fichier** du certificat de l'autorité :

```caddyfile
https://internal.test {
    tls {
        internal
        client_auth {
            mode require_and_verify
            trusted_ca_cert_file /etc/pingclair/client-ca.crt
        }
    }
    file_server /srv/site
}
```

Mesuré : une requête sans certificat client échoue à la négociation, et la même
requête avec `--cert client.crt --key client.key` répond `200`.

Les modes sont `request`, `require`, `verify_if_given` et `require_and_verify`.
Un mode mal orthographié est refusé avec la liste complète
`(expected request, require, verify_if_given or require_and_verify)`.

⚠️ `trusted_ca_cert` prend le certificat lui-même, encodé en base64 sur une
ligne, et `trusted_ca_cert_file` prend un chemin. Donner un chemin au premier
compile, puis échoue au démarrage avec
`trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45` :
le symbole 45 est le `-` de `-----BEGIN`. Le fichier doit aussi être lisible par
l'utilisateur `pingclair`.

## 📦 Déplacer le magasin de certificats

Le magasin contient les certificats émis, le compte ACME et l'autorité interne.
Pour une installation par paquet, il se trouve dans
`/var/lib/pingclair/.local/share/pingclair`, le répertoire de données sous le
répertoire personnel du compte de service. Une commande exécutée sous un autre
utilisateur cherche dans le répertoire de données de cet utilisateur ; les
exemples définissent donc `PINGCLAIR_TLS_STORE`, sans quoi root utiliserait
`/root/.local/share/pingclair`. `storage-export` et `storage-import` déplacent
le magasin :

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-export -o /tmp/store.tar
sudo systemctl stop pingclair
sudo rm -rf /var/lib/pingclair/.local/share/pingclair
sudo mkdir -p /var/lib/pingclair/.local/share/pingclair && sudo chown pingclair:pingclair /var/lib/pingclair/.local/share/pingclair
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair storage-import -i /tmp/store.tar
sudo systemctl start pingclair
```

```text
✅ Store exported to /tmp/store.tar
✅ Store imported into /var/lib/pingclair/.local/share/pingclair
```

Trois détails ressortent de l'exécution. L'archive est un **tar simple**, quel
que soit son nom, écrit avec le mode `600` ; la relire exige donc root.
L'import restaure les propriétaires enregistrés dans l'archive. Et le magasin
contient `autosave.json`, la dernière configuration appliquée par l'API
d'administration ; un import la restaure donc aussi.

**Prochaine version :** l'autorité interne est rangée comme le fait Caddy, sous
`pki/authorities/local/`. L'ancien répertoire `internal/` n'est pas migré : le
serveur crée une nouvelle autorité, et chaque client doit de nouveau faire
confiance à la nouvelle racine (`pingclair trust`). Une option globale
`storage file_system <path>` permet aussi de désigner le magasin dans la
configuration.

Si le service refuse ensuite de démarrer avec
`Internal CA I/O error: Permission denied`, les fichiers du magasin ne sont pas
accessibles en écriture au compte de service ;
`sudo chown -R pingclair:pingclair /var/lib/pingclair/.local/share/pingclair`
corrige le problème, et le site répond de nouveau.

## 🚫 Ce qui ne se règle pas

Pingclair reconnaît ces réglages de Caddy et les refuse, si bien qu'un fichier
ne s'exécute jamais en ayant perdu l'un d'eux en silence :

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

Les suites de chiffrement, les courbes, la liste ALPN et l'émission à la demande
sont donc fixées par le build, et non par la configuration. L'agrafage OCSP
n'est pas effectué non plus. Si l'un de ces points compte pour vous, c'est une
demande de fonctionnalité, pas une erreur de configuration.

## ⚠️ Quand cela ne marche pas

- **`client_auth` refuse de démarrer avec `not valid base64`.** Un chemin a été
  donné à `trusted_ca_cert` ; l'écriture qui prend un fichier est
  `trusted_ca_cert_file`.
- **Un client muni d'un certificat valide est rejeté.** Vérifiez que l'autorité
  qui l'a signé est bien celle de `trusted_ca_cert_file`, et que le certificat
  n'a pas expiré.
- **`tls ciphers` / `tls curves` / `tls alpn` / `tls on_demand` font refuser le
  fichier.** Ils ne sont pas implémentés ; voir la section ci-dessus.
- **HTTP/3 tourne encore après `protocols h1 h2`.** Cela ne devrait pas arriver,
  puisque cette liste le commande. Si UDP 443 écoute toujours, le fichier en
  service n'est pas celui que vous avez modifié
  ([ce que signifie un rechargement](/fr/start/service/#-ce-que-signifie-un-rechargement)).
- **Le service ne démarre plus après le déplacement d'un magasin.** Une
  question de propriétaire, comme ci-dessus.

## 🧭 Étapes suivantes

- [HTTPS](/fr/start/https/) : les quatre façons d'obtenir un certificat, avec
  leurs lignes de journal exactes.
- [HTTP/3](/fr/guides/http3/) : l'activer et prouver qu'un client l'a utilisé.
- [`tls`](/fr/reference/directives/#tls) : la référence de la directive.
