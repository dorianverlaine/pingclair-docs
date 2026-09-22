---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: Obtenir un certificat pour un nom public, publier un certificat interne ou fournir le vôtre, et vérifier ce que le serveur sert réellement.
---

Un bloc de site dont l'adresse est un nom public obtient HTTPS sans directive
`tls` : Pingclair demande un certificat à Let's Encrypt via ACME, répond au défi
HTTP-01 sur le port 80, conserve le résultat et le renouvelle en arrière-plan.
Les trois autres façons d'obtenir un certificat — DNS-01, une autorité locale et
des fichiers que vous fournissez — sont décrites ci-dessous avec ce que chacune
exige et ce qu'elle fait réellement en v0.2.0-rc.3.

## 🧾 Avant de commencer

- Un nom qui résout vers cet hôte. Vérifiez-le avant d'accuser le serveur :
  `dig +short A example.com`.
- Les ports 80 et 443 joignables depuis Internet. Le défi HTTP-01 est servi sur
  le port 80 et le certificat sert sur le 443.
- Une adresse e-mail pour le compte ACME. Ce doit être une vraie boîte : Let's
  Encrypt refuse les domaines d'exemple réservés, et l'émission échoue avec
  `contact email has forbidden domain "example.com"`.

La configuration ci-dessous remplace `/etc/Pingclair/Pingclairfile`, que le
service exécute. Validez avant de recharger ; [Démarrage rapide](/fr/start/quickstart/)
montre cette boucle et [Exécution comme service](/fr/start/service/) explique le
rechargement.

## 🌐 Certificats Let's Encrypt

```caddyfile
{
    email bonjour@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

Il n'y a rien d'autre à configurer. Au démarrage, le serveur autorise le nom,
lance le flux ACME et sert le défi :

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

La requête de défi dans le journal d'accès vient de l'autorité de certification,
pas d'un navigateur :

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

Vérifiez ce qui est réellement servi, depuis une autre machine :

```bash
curl -I https://example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
etag: "493b-6ab1f452"
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

```text
subject=CN=example.com
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Sep 22 02:35:03 2026 GMT
notAfter=Dec 21 02:35:02 2026 GMT
```

Le matériel du certificat est conservé dans le répertoire de données du
compte de service, `/var/lib/pingclair/.local/share/pingclair` — le chemin que le binaire
résout depuis le répertoire personnel de ce compte, et celui que
`PINGCLAIR_TLS_STORE` nomme quand une commande tourne sous un autre
utilisateur.

## 📡 DNS-01 et noms génériques

DNS-01 prouve la maîtrise d'un nom en publiant un enregistrement TXT au lieu de
répondre sur le port 80, ce qu'exige un certificat générique. La configuration a
besoin du bloc de fournisseur :

```caddyfile
{
    email bonjour@pingclair.com
}

*.example.com {
    tls {
        auto
        dns cloudflare <token>
        resolvers 1.1.1.1
        propagation_delay 10s
    }
    file_server /var/lib/pingclair/html
}
```

Deux détails sont faciles à manquer. La ligne `auto` dans le bloc est ce qui
inscrit le nom sur la liste d'émission ; sans elle, le serveur journalise
`authorised for 0 hostname(s)` et ne demande jamais de certificat, laissant
chaque poignée de main échouer avec `NO_CERTIFICATE_SET`. Et le jeton est un
jeton d'API Cloudflare avec `Zone:DNS:Edit` sur la zone qui contient le nom.

⚠️ **L'émission DNS-01 ne va pas au bout en v0.2.0-rc.3.** Le défi lui-même se
déroule : l'enregistrement est publié, la propagation est confirmée auprès du
résolveur nommé dans la configuration, et l'autorité est priée de valider. La
commande revient ensuite invalide en moins d'une seconde, sur chaque nom essayé,
et le certificat n'est jamais conservé :

```text
📡 Published the DNS-01 record for _acme-challenge.example.com via cloudflare
👍 DNS-01 record for _acme-challenge.example.com is visible
🚀 Verification triggered for example.com
⏳ Polling order status...
⚠️ Eager issuance failed for example.com: Order ended in state: Invalid
```

Tant que ce n'est pas corrigé, utilisez HTTP-01 pour les noms publics. Un nom
générique ne peut donc pas encore être servi avec un certificat ; l'alternative
est un nom par certificat, ou un certificat émis ailleurs et fourni sous forme de
fichiers.

## 🏛️ Certificats de l'autorité interne

Pour des origines privées — un tunnel, un nom interne, une machine de
laboratoire — Pingclair peut être sa propre autorité :

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

Le site répond avec un certificat émis par `CN=Pingclair Local Authority` pour
dix ans, et la racine est publiée dans le magasin :

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

Les clients ne lui font pas encore confiance : une requête sans `-k` échoue.
Installez la racine dans le magasin de confiance du système :

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

Le préfixe `PINGCLAIR_TLS_STORE` compte : `pingclair trust` regarde le magasin de
l'utilisateur qui l'exécute, soit `/root/.local/share/pingclair` pour root, alors
que le service utilise `/var/lib/pingclair/.local/share/pingclair`. Sans le préfixe, la commande
répond `No internal CA root at /root/.local/share/pingclair/internal/root.crt`.

Après avoir fait confiance à la racine, la même requête réussit sans `-k` :

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust` la retire de nouveau, avec le même préfixe de magasin.

## 📜 Certificats que vous fournissez

Quand un autre système émet vos certificats, pointez `tls` vers les fichiers :

```caddyfile
https://byo.test {
    tls {
        cert /etc/pingclair/certs/byo.crt
        key /etc/pingclair/certs/byo.key
    }
    file_server /var/lib/pingclair/html
}
```

Les fichiers doivent être lisibles par l'utilisateur `pingclair`, puisque le
service tourne sous ce compte. `validate` refuse un chemin inexistant plutôt que
d'échouer à la première poignée de main :

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ Quand HTTPS ne se met pas en place

- **`contact email has forbidden domain "example.com"`.** Let's Encrypt refuse
  les domaines d'exemple réservés comme contacts de compte. Mettez une vraie
  boîte dans l'option `email`.
- **`NO_CERTIFICATE_SET` dans le journal.** La poignée de main a présenté un nom
  pour lequel le serveur n'a pas de certificat. Lisez le journal juste au-dessus :
  un bloc `tls` sans `auto` ne lance jamais d'émission, et DNS-01 ne va pas au
  bout dans cette version.
- **Le défi n'est jamais servi.** Le port 80 est bloqué par un pare-feu, ou un
  autre programme le tient. L'autorité doit pouvoir atteindre
  `http://your-name/.well-known/acme-challenge/` depuis Internet.
- **Le nom ne résout pas vers cet hôte.** `dig +short A your-name` montre ce à
  quoi l'autorité se connectera, ce qui n'est pas toujours ce que l'on croit
  après un changement récent.
- **Échecs répétés.** Let's Encrypt limite le nombre de validations échouées par
  nom. Corrigez la cause avant de réessayer, sinon les tentatives deviennent
  elles-mêmes l'erreur.

## 🧭 Étapes suivantes

- [Exécution comme service](/fr/start/service/) : l'unité, sa sémantique de
  rechargement et ses journaux.
- [`tls`](/fr/reference/directives/#tls) : tous les modes et options de la
  directive.
- [Pingclairfile](/fr/reference/pingclairfile/) : adresses, matchers et ce que le
  compilateur accepte.
