# Cine Mongolia Full Stack Streaming PWA

Энэ хувилбар нь олон файлтай streaming platform demo юм. Киноны нэр, тайлбар, poster, embed холбоосуудыг тухайн бүтээлтэй нь тааруулж шинэчилсэн.

## Гол засвар

- Website нэрийг бүх хэсэгт **Cine Mongolia** болгосон.
- Database нэрийг `cine_mongolia_fullstack_db` болгож хуучин demo өгөгдөлтэй холилдохоос сэргийлсэн.
- `DB_VERSION = 5` болгосон.
- Seed logic-ийг засаж, киноны ID байсан ч нэр/тайлбар/poster/embed мэдээллийг дахин overwrite хийдэг болгосон.
- Худал нэртэй demo кинонуудыг үндсэн seed-ээс хасаж, хууль ёсны open movie / public domain эхтэй кинонууд үлдээсэн.

## Файлын бүтэц

```text
cine_mongolia_fullstack_pwa/
  index.html
  styles.css
  app.js
  database.js
  api.js
  auth.js
  player.js
  sw.js
  manifest.webmanifest
  icons/
```

## Ажиллуулах

```bash
cd cine_mongolia_fullstack_pwa
python -m http.server 5500
```

Browser дээр:

```text
http://localhost:5500
```

## Demo login

```text
Admin: admin@cinemongolia.mn / admin123
User:  user@cinemongolia.mn  / user123
```

Хэрвээ browser хуучин cache харуулаад байвал:

```text
Application → Storage → Clear site data → Refresh
```
