---
title: 'TLS : ce qui se règle'
h1_emoji: '🛡️'
sidebar:
  order: 3
description: Quels réglages TLS et de protocole Pingclair honore, lesquels il refuse par leur nom, et comment exiger un certificat client ou déplacer un magasin de certificats.
---

La surface TLS de Pingclair est volontairement petite : un nom obtient un
certificat automatiquement, et les réglages qui décident comment sont ceux
documentés ici. Tout le reste que Caddy accepte est refusé par son nom plutôt
qu'ignoré, donc une configuration ne fait jamais silencieusement moins que ce
qu'elle annonce. Cette page rassemble ce qui fonctionne réellement, mesuré sur une
vraie machine, et ce qui ne fonctionne pas.

## 🧾 Avant de commencer

- Pingclair installé et en service ([Installation](/fr/start/install/)).
- Pour les parties liées à l'autorité de certification, un nom qui résout vers
  l'hôte, ou l'autorité interne pour une machine de laboratoire
  ([HTTPS](/fr/start/https/)).

## 🌐 Quels protocoles sont servis

L'ensemble des protocoles vit dans le bloc global `servers` :

```caddyfile
{
    servers {
        protocols h1 h2 h3
    }
}
```

Mesuré avec `sudo ss -lun | grep ':443 '` :

| Configuration | Écouteur UDP 443 |
| --- | --- |
| `protocols h1 h2` | 0 — pas de HTTP/3 |
| `protocols h1 h2 h3` | 1 — HTTP/3 activé |

⚠️ Cette liste décide **HTTP/3**, et rien d'autre. Lister `h1` seul ne retire pas
HTTP/2 : avec `protocols h1`, un client qui proposait `h2` en ALPN négociait
encore HTTP/2. Le compilateur reporte cette liste sur l'interrupteur HTTP/3
(`config.global.http3 = protocols.contains(H3)`), donc aucun réglage ne désactive
HTTP/2 pour un nom.

Par site, `http3 off` sort ce nom de HTTP/3 sans arrêter l'écouteur QUIC :

```caddyfile
https://internal.test {
    tls {
        internal
        http3 off
    }
    file_server /srv/site
}
```

## 🏛️ Sources de certificats

Trois sources, toutes montrées sur la [page HTTPS](/fr/start/https/) :

| Source | Configuration | Usage |
| --- | --- | --- |
| Let's Encrypt | un nom public nu | Noms publics, renouvelés en arrière-plan. |
| Autorité interne | `tls internal` | Noms de laboratoire, origines privées, tunnels. |
| Vos fichiers | `tls { cert … key … }` | Certificats émis ailleurs. |

Le renouvellement tourne tout seul ; `renewal_window_ratio`, dans les options
globales, change à quel point il commence tôt, en fraction de la durée de vie de
chaque certificat.

## 🔐 Certificats clients

`client_auth` exige un certificat du client. Générez une petite autorité et un
certificat client avec `openssl`, puis pointez le site vers le **fichier** de
l'autorité :

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

Mesuré : une requête sans certificat client échoue à la poignée de main, et la
même requête avec `--cert client.crt --key client.key` répond `200`.

Les modes sont `request`, `require`, `verify_if_given` et `require_and_verify`,
et il n'y a pas de repli : un mode mal orthographié est refusé avec la liste
entière `(expected request, require, verify_if_given or require_and_verify)`.

⚠️ `trusted_ca_cert` prend le certificat **en ligne**, et `trusted_ca_cert_file`
prend un chemin. Utiliser le premier avec un chemin compile, puis échoue au
démarrage avec
`trusted_ca_cert is not a certificate: not valid base64: Invalid symbol 45` — le
`-` de `-----BEGIN`. Le fichier doit aussi être lisible par l'utilisateur
`pingclair`.

## 📦 Déplacer le magasin de certificats

Le magasin contient les certificats émis, le compte ACME et l'autorité
interne, et il vit dans `/var/lib/pingclair/.local/share/pingclair` — le répertoire de données du
compte de service. `PINGCLAIR_TLS_STORE` le nomme quand une commande tourne
sous un autre utilisateur, d'où le préfixe des exemples ci-dessous : la valeur
par défaut de root serait `/root/.local/share/pingclair`. `storage-export` et `storage-import` le déplacent :

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

Trois détails issus de l'exécution. L'archive est un **tar simple**, quel que
soit son nom, et elle est écrite en mode `600` : la relire demande root. L'import
restaure la propriété enregistrée dans l'archive. Et le magasin contient
`autosave.json`, la configuration que l'Admin API a appliquée en dernier, donc un
import la restaure aussi.

Si le service refuse ensuite de démarrer avec
`Internal CA I/O error: Permission denied`, les fichiers du magasin ne sont pas
inscriptibles par le compte de service :
`sudo chown -R pingclair:pingclair /var/lib/pingclair/.local/share/pingclair` corrige, et le site
répond de nouveau.

## 🚫 Ce qui ne se règle pas

Voici des réglages Caddy que Pingclair reconnaît et refuse, pour que le fichier ne
tourne jamais avec le réglage silencieusement abandonné :

```text
Caddy-compatible directive 'tls ciphers' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls curves' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls alpn' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
Caddy-compatible directive 'tls on_demand' is not supported by Pingclair yet: Pingclair does not implement this TLS option yet
```

Concrètement : les suites de chiffrement, les courbes, la liste ALPN et l'émission
à la demande relèvent du binaire, pas de la configuration ; l'agrafage OCSP et
`preferred_chains` ne sont pas implémentés non plus. Si l'un compte pour vous,
c'est une demande de fonctionnalité, pas une erreur de configuration.

## ⚠️ Quand cela ne marche pas

- **`client_auth` refuse de démarrer avec `not valid base64`.** Un chemin a été
  donné à `trusted_ca_cert` ; l'orthographe fichier est `trusted_ca_cert_file`.
- **Un client avec un certificat valide est rejeté.** Vérifiez que l'autorité qui
  l'a signé est celle de `trusted_ca_cert_file`, et que le certificat n'a pas
  expiré.
- **`tls ciphers` / `tls curves` / `tls alpn` / `tls on_demand` refusent le
  fichier.** Ils ne sont pas implémentés ; voir la section ci-dessus.
- **HTTP/3 tourne encore après `protocols h1 h2`.** Ce ne devrait pas être le
  cas : c'est cette liste qui le commande. Si UDP 443 écoute encore, le fichier en
  service n'est pas celui que vous avez édité
  ([ce que signifie un rechargement](/fr/start/service/#-ce-que-signifie-un-rechargement)).
- **Le service ne démarre plus après un déplacement de magasin.** La propriété,
  comme ci-dessus.

## 🧭 Étapes suivantes

- [HTTPS](/fr/start/https/) : les quatre façons d'obtenir un certificat, avec
  leurs lignes de journal exactes.
- [HTTP/3](/fr/guides/http3/) : l'activer et prouver qu'un client l'a utilisé.
- [`tls`](/fr/reference/directives/#tls) : la référence de la directive.
