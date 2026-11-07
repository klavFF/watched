# Смотрел

Личная полка фильмов и сериалов. Оценки и записи хранятся в Firestore.

## Локально

Нужен Node 20+.

```bash
npm install
npm run dev
```

Скопируй `.env.example` в `.env.local` и вставь конфиг нового Firebase-приложения.

## База

1. Создай новый проект в [Firebase Console](https://console.firebase.google.com/).
2. Добавь веб-приложение и скопируй его конфиг в `.env.local`.
3. Включи Cloud Firestore.
4. В **Rules** вставь `firestore.rules` и нажми **Publish**.

Коллекция `entries` появится сама, когда поставишь первую запись на полку.
