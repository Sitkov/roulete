# Roulette Video Chat (Frontend + Backend)

Полностью рабочий видеочат-рулетка с анонимными пользователями, WebRTC (SimplePeer), сигналингом на Node.js (WebSocket), текстовым чатом, фильтрами, VIP-заготовками, админкой (мониторинг, баны, жалобы, реклама), современным UI на Next.js + Tailwind и PWA-настройками.

## Стек
- Frontend: Next.js 14, Tailwind CSS, next-pwa, SimplePeer
- Backend: Node.js, Express, ws, SQLite (better-sqlite3)
- PWA-ready, адаптивный дизайн

## Быстрый старт

1) Установить зависимости:
```bash
npm install
```

2) Запустить dev-серверы (frontend: 3000, backend: 4000):
```bash
npm run dev
```

3) Открыть `http://localhost:3000`
   - Админ-панель: `http://localhost:3000/admin`

## Переменные окружения (backend)
Создайте `.env` в `backend/` (или используйте дефолты):
```
PORT=4000
JWT_SECRET=change_me_strong_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
FRONTEND_ORIGIN=http://localhost:3000
DATABASE_FILE=./storage/app.sqlite
```

## Возможности
- Анонимный вход с уникальным `userId`, онлайн-счетчик.
- Видеочат 1-на-1, кнопки Next/Stop, WebRTC через SimplePeer.
- Текстовый чат (data channel, с fallback на WS).
- Фильтры по полу; VIP-заготовки (отключение рекламы и расширенные фильтры).
- Админ-панель: авторизация, мониторинг комнат (невидимка), баны, жалобы, статистика, управление рекламой.
- Жалобы пользователей с сервера видны админам.
- PWA-манифест и сервис-воркер.

## Mobile-ready
- UI адаптирован под мобильные браузеры, добавление на главный экран (PWA).
- Готово к упаковке в мобильные приложения через Capacitor/Expo. Для React Native используйте `react-native-webrtc` вместо браузерного.

## Примечания
- STUN-сервера: Google/Twilio STUN по умолчанию. Для продакшна рекомендуется свой TURN.
- Админ-мониторинг работает как отдельные WebRTC-пиры от каждого участника к администратору с передачей их локального потока (аудио+видео). Пользователи не уведомляются.
- БД: SQLite. Таблицы создаются автоматически.

## Скрипты
- `npm run dev` — запускает backend и frontend.
- `npm run build` — сборка проекта.
- `npm start` — запуск в прод-режиме.


