---
title: HTTPS
h1_emoji: '🔐'
sidebar:
  order: 3
description: Obtenir un certificat pour un nom public, publier un certificat interne ou fournir le vôtre, et vérifier ce que le serveur sert réellement.
---

Un bloc de site dont l'adresse est un nom public obtient HTTPS sans directive
`tls` : Pingclair demande un certificat à Let's Encrypt via ACME, répond au défi
HTTP-01 sur le port 80, conserve le résultat et le renouvelle en arrière-plan.
Les trois autres façons d'obtenir un certificat (DNS-01, une autorité locale et
des fichiers que vous fournissez) sont décrites plus bas, avec ce que chacune
exige.

## 🧾 Avant de commencer

- Un nom qui pointe vers cet hôte. Vérifiez-le avant d'incriminer le serveur :
  `dig +short A example.com`.
- Les ports 80 et 443 joignables depuis Internet. Le défi HTTP-01 est servi sur
  le port 80, et le certificat est utilisé sur le 443.
- Une adresse e-mail pour le compte ACME. Ce doit être une vraie boîte aux
  lettres : Let's Encrypt refuse les domaines d'exemple réservés, et l'émission
  échoue avec `contact email has forbidden domain "example.com"`.

La configuration ci-dessous remplace `/etc/Pingclair/Pingclairfile`, que le
service exécute. Validez avant de recharger ; le
[Démarrage rapide](/fr/start/quickstart/) montre cette boucle et
[Exécution comme service](/fr/start/service/) explique le rechargement.

## 🌐 Certificats Let's Encrypt

```caddyfile
{
    email bonjour@pingclair.com
}

example.com {
    file_server /var/lib/pingclair/html
}
```

Il n'y a rien d'autre à configurer. Au démarrage, le serveur autorise le nom
d'hôte, lance le flux ACME et sert le défi :

```text
🌐 Automatic public certificates authorised for 1 hostname(s)
🚀 Eager issuance for 1 hostname(s)
🔐 Starting ACME flow for domains: ["example.com"]
🔐 Serving ACME challenge for token: Ix9X74-tENLdJY0F6f7kUe3TXkoXOxOyTb8iHcnv9Z4
✅ Certificate stored successfully: example.com
🎉 Certificate issuance complete for example.com
```

Dans le journal d'accès, la requête du défi vient de l'autorité de
certification, pas d'un navigateur :

```text
📝 Access ... path="/.well-known/acme-challenge/Ix9X74-..." status=200 user_agent="Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)"
```

Vérifiez depuis une autre machine ce qui est réellement servi :

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

Le matériel de certificat est conservé dans le répertoire de données de
l'utilisateur du service, `/var/lib/pingclair/.local/share/pingclair` : c'est le
chemin que le binaire déduit du répertoire personnel de ce compte, et aussi
celui que désigne `PINGCLAIR_TLS_STORE` quand une commande s'exécute sous un
autre utilisateur.

## 📡 DNS-01 et noms génériques

DNS-01 prouve le contrôle d'un nom en publiant un enregistrement TXT au lieu de
répondre sur le port 80. Un certificat générique l'exige, tout comme un hôte
dont le port 80 est fermé.

⚠️ **DNS-01 n'aboutit pas dans v0.2.0-rc.3.** Cette version publie une valeur
erronée dans l'enregistrement TXT, si bien que chaque commande se termine
`Invalid`. Le correctif, ainsi que le certificat générique unique décrit
ci-dessous, se trouvent sur `main` et ne sont pas encore publiés. Pour utiliser
DNS-01 aujourd'hui, installez `main` avec l'option `--main` de l'installateur
([Installation](/fr/start/install/#-installer-depuis-un-binaire-publié)). Les
sorties de cette section montrent le comportement de ce build.

La configuration a besoin du bloc du fournisseur :

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

Deux détails passent facilement inaperçus. D'abord, c'est la ligne `auto` du
bloc qui inscrit le nom sur la liste d'émission ; sans elle, le serveur
journalise `authorised for 0 hostname(s)` et ne demande jamais de certificat, si
bien que chaque négociation échoue avec `NO_CERTIFICATE_SET`. Ensuite, le jeton
est un jeton d'API Cloudflare doté de `Zone:DNS:Edit` sur la zone qui contient
le nom.

🃏 **Un seul certificat couvre le site.** Un site `*.example.com` commande
`*.example.com` lui-même : un certificat, obtenu au démarrage, servi à tous les
noms situés en dessous. Un nom générique couvre exactement un niveau, donc
l'apex a besoin de sa propre entrée : écrivez `*.example.com, example.com` si le
site répond aussi sur `example.com`, et chaque sujet est commandé tel qu'il est
écrit. Les sous-domaines servis ainsi n'apparaissent pas dans les journaux
Certificate Transparency, ce qui est précisément l'argument de confidentialité
en faveur d'un certificat générique.

Tout nom sous le site est servi par ce certificat unique. Depuis une autre
machine :

```bash
curl -I https://anything.example.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
server: Pingclair
```

```bash
echo | openssl s_client -connect example.com:443 -servername anything.example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -ext subjectAltName
```

```text
subject=CN=*.example.com
issuer=C=US, O=Let's Encrypt, CN=YE1
X509v3 Subject Alternative Name:
    DNS:*.example.com
```

## 🏛️ Certificats de l'autorité interne

Pour les origines privées (un tunnel, un nom d'hôte interne, une machine de
laboratoire), Pingclair peut être sa propre autorité :

```caddyfile
https://internal.test {
    tls internal
    file_server /var/lib/pingclair/html
}
```

Le site répond avec un certificat émis par `CN=Pingclair Local Authority` pour
dix ans, et la racine est publiée dans le magasin :

```bash
sudo ls -l /var/lib/pingclair/.local/share/pingclair/internal/
```

```text
-rw------- 1 pingclair pingclair 652 Sep 22 03:40 root.crt
```

Les clients ne lui font pas encore confiance, donc une requête sans `-k` échoue.
Installez la racine dans le magasin de confiance du système :

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

```text
✅ Internal CA root installed into the system trust store
```

Le préfixe `PINGCLAIR_TLS_STORE` compte : `pingclair trust` cherche dans le
magasin de l'utilisateur qui l'exécute, soit `/root/.local/share/pingclair` pour
root, alors que le service utilise `/var/lib/pingclair/.local/share/pingclair`.
Sans le préfixe, la commande répond `No internal CA root at
/root/.local/share/pingclair/internal/root.crt`.

Une fois la racine approuvée, la même requête réussit sans `-k` :

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal.test/
```

```text
200
```

`pingclair untrust` la retire, avec le même préfixe de magasin.

📌 **Prochaine version.** La prochaine version range l'autorité interne comme le
fait Caddy, sous `pki/authorities/local/` dans le magasin, avec un certificat
intermédiaire qui signe les certificats finaux. L'ancien répertoire `internal/`
n'est pas migré : après la mise à jour, le serveur crée une nouvelle racine, et
chaque client doit de nouveau lui faire confiance avec `pingclair trust`.

## 📜 Certificats que vous fournissez

Quand un autre système émet vos certificats, pointez `tls` vers les fichiers :

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
service s'exécute sous cet utilisateur. `validate` refuse un chemin inexistant
plutôt que d'échouer à la première négociation :

```text
❌ TLS certificate file does not exist: /etc/pingclair/certs/missing.crt
```

## ⚠️ Quand HTTPS ne se met pas en place

- **`contact email has forbidden domain "example.com"`.** Let's Encrypt refuse
  les domaines d'exemple réservés comme contacts de compte. Indiquez une vraie
  boîte aux lettres dans l'option `email`.
- **`NO_CERTIFICATE_SET` dans le journal.** La négociation a présenté un nom
  pour lequel le serveur n'a aucun certificat. Lisez le journal qui précède : un
  bloc `tls` sans `auto` ne lance jamais l'émission, et DNS-01 n'aboutit pas
  dans cette version.
- **Le défi n'est jamais servi.** Le port 80 est bloqué par un pare-feu, ou un
  autre processus l'occupe. L'autorité doit pouvoir joindre
  `http://your-name/.well-known/acme-challenge/` depuis Internet.
- **Le nom ne pointe pas vers cet hôte.** `dig +short A your-name` montre à quoi
  l'autorité va se connecter, ce qui n'est pas toujours ce que vous attendez
  après une modification récente.
- **Échecs répétés.** Let's Encrypt limite le nombre de validations échouées par
  nom d'hôte. Corrigez la cause avant de réessayer, sinon ce sont les tentatives
  elles-mêmes qui deviennent l'erreur.

## 🧭 Étapes suivantes

- [Exécution comme service](/fr/start/service/) : l'unité, la sémantique de ses
  rechargements et ses journaux.
- [`tls`](/fr/reference/directives/#tls) : tous les modes et options de la
  directive.
- [Pingclairfile](/fr/reference/pingclairfile/) : les adresses, les matchers et
  ce que le compilateur accepte.
