## Цель

Сделать так, чтобы NoorPay можно было добавить на главный экран iPhone (и Android) одной иконкой и пользоваться им как настоящим приложением: полноэкранный режим без адресной строки, нативные жесты, плавные slide-переходы между экранами, безопасные зоны под «чёлку».

Без service worker и офлайн-режима — это даёт стабильность, отсутствие проблем с залипанием кеша и корректное обновление после публикации.

## Что будет сделано

### 1. Иконка приложения NoorPay
- Сгенерировать иконку в стиле проекта (тёмно-зелёная палитра, символика, читаемая в маленьком размере).
- Три размера: `icon-192.png`, `icon-512.png` (maskable), `apple-touch-icon-180.png`.
- Сохранить в `public/` чтобы пути были стабильными.

### 2. Web App Manifest
- Создать `public/manifest.webmanifest` с полями: `name`, `short_name: "NoorPay"`, `start_url: "/app"` (чтобы открывалось сразу в личном кабинете), `scope: "/"`, `display: "standalone"`, `orientation: "portrait"`, `theme_color`, `background_color`, массив иконок.

### 3. Мета-теги для iOS и Android
В `src/routes/__root.tsx` в `head().meta` и `head().links` добавить:
- `viewport` с `viewport-fit=cover` (под safe-area).
- `apple-mobile-web-app-capable: yes`, `apple-mobile-web-app-status-bar-style: black-translucent`, `apple-mobile-web-app-title: NoorPay`.
- `theme-color` (для адресной строки Android Chrome).
- `<link rel="manifest">`, `<link rel="apple-touch-icon">`, `<link rel="icon">`.

### 4. Safe-area под iPhone (чёлка / Dynamic Island)
- В `src/styles.css` добавить утилиты `pt-safe`, `pb-safe`, `px-safe` через `env(safe-area-inset-*)`.
- Применить к шапке (`AuthTopBar`) и нижним фиксированным элементам.

### 5. Slide-переходы между экранами
- Использовать уже установленный framer-motion (он используется в проекте). Если нет — добавить `bun add framer-motion`.
- В layout `src/routes/_authenticated/app.tsx` обернуть `<Outlet />` в `AnimatePresence` с `motion.div`, который делает slide по X (вперёд/назад) и fade.
- Длительность 250мс, easing `[0.32, 0.72, 0, 1]` (iOS-like).
- Учитывать `prefers-reduced-motion` — отключать анимацию при включённой настройке.

### 6. Мобильная полировка (без смены навигации)
- Все `<input>` получают `font-size: 16px` минимум, чтобы iOS Safari не зумился при фокусе.
- `-webkit-tap-highlight-color: transparent` на интерактивных элементах.
- `touch-action: manipulation` на кнопках (убирает 300мс задержку и double-tap zoom).
- `overscroll-behavior-y: contain` на скроллящихся контейнерах (отключает «bounce» страницы за пределы контента).
- Минимальный тач-таргет 44×44px на иконках и иконочных кнопках.

### 7. Проверка
- Открыть превью на iPhone-вьюпорте (375×812), убедиться, что safe-area работает.
- Проверить slide-анимацию переходов между `/app`, `/app/installments`, `/app/profile`.
- На опубликованном сайте: Safari → Поделиться → На экран «Домой» → запустить иконку → убедиться, что открывается без адресной строки и сразу в `/app`.

## Технические детали (для разработчика)

**Файлы, которые будут затронуты:**
- Новые: `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
- Изменены: `src/routes/__root.tsx` (мета и links), `src/routes/_authenticated/app.tsx` (AnimatePresence), `src/styles.css` (safe-area утилиты, тач-полировка), `src/components/AuthTopBar.tsx` (pt-safe)

**Направление slide** определяется через сравнение текущего и предыдущего pathname (хранится в `useRef`): вглубь — slide справа, назад — слева.

**start_url = `/app`** означает, что иконка с домашнего экрана сразу ведёт в личный кабинет. Если сессия истекла, сработает уже существующий редирект на `/login` из `_authenticated.tsx`.

**Что НЕ делаем:**
- Не добавляем `vite-plugin-pwa` и service worker — это ломает превью Lovable и кеширует устаревший баланс/платежи.
- Не трогаем backend и server-функции — изменения чисто фронтенд/презентационные.
- Не меняем существующую навигацию и хедер.

## Ограничения, о которых стоит знать
- Push-уведомления на iOS работают только если PWA установлена на главный экран (iOS 16.4+) и требуют отдельной реализации — в этот план не входят.
- При первом запуске после установки iOS показывает белый сплеш-экран по `background_color` из манифеста — это нормально, длится <1сек.
- Анимации переходов и установка работают одинаково в Safari и Chrome на iOS (на iOS все браузеры используют WebKit).
