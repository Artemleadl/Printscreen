# Snapshot Studio

[English](#english) | [Русский](#русский)

---

## English

A macOS menu-bar screenshot app with an annotation editor, gradient backgrounds, and cloud upload.

![macOS](https://img.shields.io/badge/macOS-12%2B-blue) ![Electron](https://img.shields.io/badge/Electron-36-blue) ![License](https://img.shields.io/badge/license-MIT-green)

### Features

- **Capture** — region selection or full-screen via global hotkeys
- **Annotation editor** — arrows, rectangles, ellipses, freehand pen, highlighter, text, step numbers, and blur
- **Adjustable blur** — slider from 2 to 40 px per blur region
- **Beautiful frames** — padding, corner radius, and 10 gradient backgrounds (Midnight, Sunset, Ocean, Violet, Mint, Aurora, Peach, Forest, Carbon, Pearl)
- **Persistent settings** — last-used frame, colors, stroke width, and blur level are remembered between sessions
- **Export** — copy to clipboard (`⌘C`), save as PNG, or upload to a custom HTTP endpoint / Supabase with a shareable link copied automatically
- **Menu-bar app** — lives in the menu bar, never in the Dock

### Requirements

- macOS 12 Monterey or later (Apple Silicon and Intel)
- Node.js 18+ and npm

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/workout-tg-app.git
cd workout-tg-app/screenshot-app

# 2. Install dependencies
npm install

# 3. Run in development mode
env -u ELECTRON_RUN_AS_NODE npm run dev
```

On the first launch macOS will ask for **Screen Recording** permission.  
Go to **System Settings → Privacy & Security → Screen Recording**, find **Electron** / **Snapshot Studio**, enable it, then restart the app.

### Build a distributable `.dmg`

```bash
npm run dist:mac
# Output: dist/Snapshot Studio-0.1.0.dmg
```

### Usage

| Action | How |
|---|---|
| Capture region | `⌘⇧1` or menu-bar → Capture Region |
| Capture full screen | `⌘⇧2` or menu-bar → Capture Fullscreen |
| Copy result | `⌘C` |
| Save as PNG | `⌘S` or click **Save** |
| Upload & copy link | Click **Upload** (configure provider in Settings first) |
| Undo / Redo | `⌘Z` / `⌘⇧Z` |
| Delete annotation | Select with `V`, then `Backspace` |
| Close editor | `Esc` |

### Annotation tools

| Key | Tool |
|---|---|
| `V` | Select / Move |
| `A` | Arrow |
| `R` | Rectangle |
| `O` | Ellipse |
| `L` | Line |
| `P` | Freehand pen |
| `H` | Highlighter |
| `T` | Text |
| `B` | Blur (radius controlled by the slider) |
| `S` | Step number |

### Upload providers

Configure in **Settings → Upload**:

- **Custom HTTP** — POST `multipart/form-data` to any endpoint; supports a bearer token and a configurable JSON path for the returned URL.
- **Supabase Storage** — provide your project URL, anon key, and bucket name.

### Project structure

```
screenshot-app/
├── src/
│   ├── main/          # Electron main process (capture, IPC, tray)
│   ├── preload/       # Context bridge
│   ├── renderer/
│   │   ├── editor/    # Annotation editor (React)
│   │   ├── overlay/   # Region-selection overlay
│   │   └── settings/  # Settings window
│   └── shared/        # Types shared across processes
├── build/             # macOS entitlements
└── electron-builder.yml
```

### Development notes

- Built with **Electron 36**, **electron-vite**, **React 18**, **TypeScript**.
- State is persisted via **electron-store**.
- If launched from inside another Electron-based tool (VS Code, Claude), `ELECTRON_RUN_AS_NODE=1` may be set in the environment. Always launch with `env -u ELECTRON_RUN_AS_NODE npm run dev`.

---

## Русский

Приложение для скриншотов в строке меню macOS с редактором аннотаций, градиентными фонами и загрузкой в облако.

![macOS](https://img.shields.io/badge/macOS-12%2B-blue) ![Electron](https://img.shields.io/badge/Electron-36-blue) ![License](https://img.shields.io/badge/license-MIT-green)

### Возможности

- **Захват экрана** — выделение области или полный экран через глобальные горячие клавиши
- **Редактор аннотаций** — стрелки, прямоугольники, эллипсы, перо, маркер, текст, нумерованные шаги и размытие
- **Настраиваемое размытие** — ползунок от 2 до 40 px для каждой области размытия
- **Красивые рамки** — отступы, радиус скругления и 10 градиентных фонов (Midnight, Sunset, Ocean, Violet, Mint, Aurora, Peach, Forest, Carbon, Pearl)
- **Сохранение настроек** — последний использованный фон, цвет, толщина линии и уровень размытия запоминаются между сессиями
- **Экспорт** — копирование в буфер (`⌘C`), сохранение в PNG или загрузка на Custom HTTP / Supabase со ссылкой в буфере
- **Приложение в строке меню** — живёт в menu bar, не появляется в Dock

### Требования

- macOS 12 Monterey или новее (Apple Silicon и Intel)
- Node.js 18+ и npm

### Установка

```bash
# 1. Клонировать репозиторий
git clone https://github.com/<your-username>/workout-tg-app.git
cd workout-tg-app/screenshot-app

# 2. Установить зависимости
npm install

# 3. Запустить в режиме разработки
env -u ELECTRON_RUN_AS_NODE npm run dev
```

При первом запуске macOS попросит разрешение на **Запись экрана**.  
Откройте **Системные настройки → Конфиденциальность и безопасность → Запись экрана**, найдите **Electron** / **Snapshot Studio**, включите и перезапустите приложение.

### Сборка `.dmg`

```bash
npm run dist:mac
# Результат: dist/Snapshot Studio-0.1.0.dmg
```

### Использование

| Действие | Как |
|---|---|
| Захват области | `⌘⇧1` или строка меню → Capture Region |
| Захват полного экрана | `⌘⇧2` или строка меню → Capture Fullscreen |
| Копировать результат | `⌘C` |
| Сохранить PNG | `⌘S` или кнопка **Save** |
| Загрузить и скопировать ссылку | Кнопка **Upload** (настройте провайдер в Settings) |
| Отмена / Повтор | `⌘Z` / `⌘⇧Z` |
| Удалить аннотацию | Выделить через `V`, затем `Backspace` |
| Закрыть редактор | `Esc` |

### Инструменты аннотаций

| Клавиша | Инструмент |
|---|---|
| `V` | Выбор / Перемещение |
| `A` | Стрелка |
| `R` | Прямоугольник |
| `O` | Эллипс |
| `L` | Линия |
| `P` | Перо |
| `H` | Маркер |
| `T` | Текст |
| `B` | Размытие (радиус — ползунок) |
| `S` | Нумерованный шаг |

### Провайдеры загрузки

Настраиваются в **Settings → Upload**:

- **Custom HTTP** — POST `multipart/form-data` на любой эндпоинт; поддерживает bearer-токен и настраиваемый JSON-путь к URL в ответе.
- **Supabase Storage** — укажите URL проекта, anon key и название bucket.

### Структура проекта

```
screenshot-app/
├── src/
│   ├── main/          # Главный процесс Electron (захват, IPC, tray)
│   ├── preload/       # Context bridge
│   ├── renderer/
│   │   ├── editor/    # Редактор аннотаций (React)
│   │   ├── overlay/   # Оверлей выделения области
│   │   └── settings/  # Окно настроек
│   └── shared/        # Типы, общие для всех процессов
├── build/             # macOS entitlements
└── electron-builder.yml
```

### Заметки для разработчиков

- Стек: **Electron 36**, **electron-vite**, **React 18**, **TypeScript**.
- Настройки хранятся через **electron-store** (JSON в папке данных приложения).
- При запуске из другого Electron-приложения (VS Code, Claude) в окружении может быть установлена переменная `ELECTRON_RUN_AS_NODE=1`. Всегда запускайте через `env -u ELECTRON_RUN_AS_NODE npm run dev`.

---

MIT License
