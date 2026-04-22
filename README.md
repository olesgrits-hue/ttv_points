# ttv_points

> Портативный оверлей для OBS: зрители активируют Channel Points — на стриме появляются видео, мемы и музыка из Яндекс Музыки.

[![Release](https://github.com/olesgrits-hue/ttv_points/actions/workflows/release.yml/badge.svg)](https://github.com/olesgrits-hue/ttv_points/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/olesgrits-hue/ttv_points)](https://github.com/olesgrits-hue/ttv_points/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://github.com/olesgrits-hue/ttv_points/releases/latest)

---

## Что это

Приложение для стримеров на Twitch. Зритель тратит Channel Points — на стриме в OBS воспроизводится медиафайл, случайный мем или трек из Яндекс Музыки с анимацией.

Работает как portable `.exe` — ничего устанавливать не нужно.

---

## Возможности

| Тип слота | Что происходит |
|-----------|----------------|
| **Медиафайл** | Воспроизводит выбранное видео или GIF поверх стрима |
| **Мем** | Берёт случайный файл из указанной папки |
| **Яндекс Музыка** | Зритель пишет название трека или ссылку — музыка играет с анимацией виниловой пластинки |

Дополнительно:
- **Группы оверлеев** — разные Browser Source для разных типов контента
- **Очередь** — события обрабатываются по одному, без наложений
- **Лог событий** — все активации с результатом в реальном времени

---

## Установка

1. Скачай `twitch-helper.exe` со страницы [Releases](https://github.com/olesgrits-hue/ttv_points/releases/latest)
2. Положи файл в любую папку
3. Запусти — установка не нужна

---

## Быстрый старт

### 1. Авторизация в Twitch
При первом запуске нажми **"Войти через Twitch"** — откроется браузер, войди в аккаунт стримера.

### 2. OBS Browser Source
Добавь новый источник **Browser Source** с адресом:
```
http://127.0.0.1:7891/overlay/default
```
Рекомендуемые настройки: **1920 × 1080**, отключи "Shutdown source when not visible".

### 3. Создай слот
В приложении перейди на вкладку **СЛОТЫ** → **"+ добавить слот"**:
- выбери тип (медиафайл / мем / музыка)
- привяжи существующий Channel Points reward или создай новый прямо из приложения

### 4. Яндекс Музыка (опционально)
Вкладка **НАСТРОЙКИ** → **"Войти через Яндекс"** — откроется браузер с кодом, введи его на `ya.ru/device`.

---

## Использование групп

Если нужно несколько независимых оверлеев (например, отдельный для музыки):

1. Создай группу в разделе **СЛОТЫ**
2. Назначь слоты в эту группу
3. Добавь второй Browser Source с адресом `http://127.0.0.1:7891/overlay/{название-группы}`

---

## Требования

- Windows 10/11 x64
- Активный Twitch-аккаунт с правами на Channel Points
- OBS Studio (или любой браузерный источник)

---

## Разработка

```bash
git clone https://github.com/olesgrits-hue/ttv_points.git
cd ttv_points
npm install
npm run dev
```

Сборка portable `.exe`:
```bash
npm run build
# → release/twitch-helper.exe
```

---

## Поддержка

Нашёл баг? Вкладка **ЛОГИ** → **"Открыть GitHub Issues"** — автоматически создаст репорт с логами.

Или вручную: [github.com/olesgrits-hue/ttv_points/issues](https://github.com/olesgrits-hue/ttv_points/issues)

---

Сделано для [twitch.tv/scler0ze](https://twitch.tv/scler0ze) · [Поддержать стримера](https://dalink.to/scler0se)
