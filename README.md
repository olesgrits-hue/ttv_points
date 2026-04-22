<div align="center">

# ttv_points

**Портативный оверлей для OBS: зрители тратят Channel Points — на стриме появляются видео, мемы и музыка из Яндекс Музыки.**

[![CI](https://github.com/olesgrits-hue/ttv_points/actions/workflows/release.yml/badge.svg)](https://github.com/olesgrits-hue/ttv_points/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/olesgrits-hue/ttv_points?label=последний%20релиз)](https://github.com/olesgrits-hue/ttv_points/releases/latest)
[![Platform](https://img.shields.io/badge/платформа-Windows%2010%2F11-blue)](https://github.com/olesgrits-hue/ttv_points/releases/latest)

<br/>

[**⬇ Скачать ttweaks.exe**](https://github.com/olesgrits-hue/ttv_points/releases/latest)

</div>

---

## Что это

Приложение для стримеров на Twitch. Зритель тратит Channel Points → на стриме в OBS воспроизводится медиафайл, случайный мем или трек из Яндекс Музыки с анимацией виниловой пластинки.

Работает как portable `.exe` — ничего устанавливать не нужно.

---

## Возможности

| Тип слота | Что происходит |
|-----------|----------------|
| **Медиафайл** | Воспроизводит выбранное видео или GIF поверх стрима |
| **Мем** | Берёт случайный файл из указанной папки |
| **Яндекс Музыка** | Зритель пишет название — музыка играет с анимацией пластинки |

- **Группы оверлеев** — несколько независимых Browser Source для разных типов контента
- **Очередь** — события обрабатываются по одному, без наложений
- **Лог событий** — все активации с результатом в реальном времени
- **Баг-репорт** — одна кнопка открывает GitHub Issues с предзаполненными логами

---

## Быстрый старт

### 1. Скачай и запусти

Скачай `ttweaks.exe` со страницы [Releases](https://github.com/olesgrits-hue/ttv_points/releases/latest), положи в любую папку, запусти.

### 2. Авторизуйся в Twitch

При первом запуске нажми **"Войти через Twitch"** — откроется браузер. Войди в аккаунт стримера.

### 3. Добавь Browser Source в OBS

```
http://127.0.0.1:7891/overlay/default
```

Рекомендуемые настройки: **1920 × 1080**, отключи "Shutdown source when not visible".

### 4. Создай слот

Вкладка **СЛОТЫ** → **"+ добавить слот"** → выбери тип → привяжи Channel Points reward.

### 5. Яндекс Музыка (опционально)

Вкладка **НАСТРОЙКИ** → **"Войти через Яндекс"** → введи код на `ya.ru/device`.

---

## Несколько оверлеев (группы)

Если нужны отдельные Browser Source для разных типов контента:

1. Создай группу в разделе **СЛОТЫ**
2. Назначь слоты в эту группу
3. Добавь второй источник: `http://127.0.0.1:7891/overlay/{название-группы}`

---

## Требования

- Windows 10/11 x64
- Twitch-аккаунт с правами на Channel Points
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
# → release/ttweaks.exe
```

---

## Поддержка

Нашёл баг? Вкладка **ЛОГИ** → **"Отправить баг-репорт"** — автоматически создаст issue с логами.

Или вручную: [Issues](https://github.com/olesgrits-hue/ttv_points/issues)

---

<div align="center">

Сделано для [twitch.tv/scler0ze](https://twitch.tv/scler0ze) &nbsp;·&nbsp; [Поддержать стримера](https://dalink.to/scler0se)

</div>
