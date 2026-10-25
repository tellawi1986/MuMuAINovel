# MuMuAINovel 📚✨

<div align="center">

<img src="frontend/public/logo.svg" alt="MuMuAINovel logo" width="120" />

![Version](https://img.shields.io/badge/version-1.5.7-blue.svg)
![Python](https://img.shields.io/badge/python-3.12-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109.0-green.svg)
![React](https://img.shields.io/badge/react-18.3.1-blue.svg)
![License](https://img.shields.io/badge/license-GPL%20v3-blue.svg)

**AI-powered novel writing assistant**

[Features](#-features) • [Quick start](#-quick-start) • [Configuration](#-configuration) • [Project structure](#-project-structure)

</div>

---

## ✨ Features

- 🤖 **Multiple AI models** - support for OpenAI, Gemini, Claude, and other major providers
- 📝 **Smart writing guide** - AI-generated outlines, characters, and worldbuilding
- 👥 **Character management** - visual management of relationships and organizations
- 📖 **Chapter editing** - create, edit, regenerate, and polish chapters
- 🌐 **Worldbuilding** - build immersive story settings and lore
- 🔐 **Multiple login methods** - LinuxDO OAuth or local account login
- 💾 **PostgreSQL support** - production-ready database with multi-user separation
- 🐳 **Docker deployment** - quick startup and easy setup

## 📸 Screenshots

<details>

<summary>Image-heavy preview</summary>

<div align="center">

### Login UI
![Login UI](images/1.png)

![Login UI](images/1-1.png)

### Main dashboard
![Main dashboard](images/2.png)

![Main dashboard (dark mode)](images/2-1.png)

### Project management
![Project management](images/3.png)

![Project management](images/3-1.png)

### Support the project 💖
![Support the project](images/4.png)

![Support the project](images/4-1.png)

</div>

</details>

## ✅ Completed features

- [x] **Inspiration mode** - generate creative ideas and writing prompts
- [x] **Custom writing style** - define custom AI writing styles
- [x] **Data import/export** - import and export project data
- [x] **Prompt editor** - visual editing of prompt templates
- [x] **Chapter word limits** - users can configure target output length
- [x] **Thought-chain and chapter relationship mapping** - visualize story logic
- [x] **One-click rewrite based on analysis** - regenerate content from analysis feedback
- [x] **Linux DO auto-account creation** - OAuth login creates accounts automatically
- [x] **Career progression system** - custom job and rank systems for cultivation, magic tiers, and other settings
- [x] **Character/organization card import/export** - export and share cards across projects
- [x] **Foreshadowing management** - track story clues and unresolved plot threads
- [x] **Prompt workshop** - community-driven prompt sharing with one-click import
- [x] **Book splitting feature** - one-click restructuring to provide a satisfying ending

## 💻 Hardware requirements

### Minimum configuration

| Component | Requirement |
|----------|------------|
| **CPU** | 2 cores |
| **Memory** | 2 GB RAM |
| **Storage** | 10 GB free space |
| **Network** | Stable internet access for AI API calls |

### Recommended configuration

| Component | Requirement |
|----------|------------|
| **CPU** | 4 cores |
| **Memory** | 8 GB RAM |
| **Storage** | 20 GB SSD |
| **Network** | Stable internet access |

### High-concurrency configuration

| Component | Requirement |
|----------|------------|
| **CPU** | 8 cores |
| **Memory** | 16 GB RAM |
| **Storage** | 50 GB+ SSD |
| **Network** | High-bandwidth connection |

> **Note**
> - **Embedding model**: approximately 400 MB of disk space, loaded into memory at runtime
> - **PostgreSQL**: default configuration uses 256 MB shared_buffers and 1 GB effective_cache_size
> - **Docker deployment**: allocate an extra 1–2 GB of memory for the runtime
> - This project relies on external AI APIs (OpenAI/Claude/Gemini) rather than local GPU processing

## 🚀 Quick start

### Prerequisites

- Docker and Docker Compose
- At least one AI provider API key (OpenAI/Gemini/Claude)

### Docker Compose deployment

```bash
# 1. Clone the project
git clone https://github.com/xiamuceer-j/MuMuAINovel.git
cd MuMuAINovel

# 2. Configure environment variables (required)
cp backend/.env.example .env
# Edit .env and add the required configuration (API key, database password, etc.)

# 3. Ensure required files are present
# ⚠️ Important: verify the following files exist
# - .env (required runtime config mounted into the container)
# - backend/scripts/init_postgres.sql (database initialization script)

# 4. Start the services
docker-compose up -d

# 5. Open the app
# Visit http://localhost:8000 in your browser
```

> **Important notes**
>
> 1. **`.env` mounting**: `docker-compose.yml` automatically mounts `.env` into the container, so ensure the file exists.
> 2. **Database initialization**: `init_postgres.sql` runs on first startup to install required PostgreSQL extensions.
> 3. **Custom build**: if you build from source, download the embedding model files first ([join the community](frontend/public/qq.jpg)).

### Using the Docker Hub image

```bash
docker pull mumujie/mumuainovel:latest
```

## 🧩 Project structure

```text
MuMuAINovel/
├── backend/      # FastAPI backend and AI orchestration services
├── frontend/     # React + TypeScript + Vite client app
├── images/       # Screenshots and marketing visuals
├── docker-compose.yml
├── Dockerfile
├── README.md
└── LICENSE
```

## 🤝 Community and support

- Open an issue for bugs or feature requests
- Submit a pull request if you want to contribute
- Support the project and ongoing development with sponsorship and feedback


<details>
<summary>📄 Expand the complete docker-compose.yml configuration</summary>

```yaml
services:
  postgres:
    image: postgres:18-alpine
    container_name: mumuainovel-postgres
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-mumuai_novel}
      POSTGRES_USER: ${POSTGRES_USER:-mumuai}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-123456}
      POSTGRES_INITDB_ARGS: "--encoding=UTF8 --locale=C"
      TZ: ${TZ:-Asia/Shanghai}
    volumes:
      - postgres_data:/var/lib/postgresql
      - ./backend/scripts/init_postgres.sql:/docker-entrypoint-initdb.d/init.sql:ro
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-mumuai} -d ${POSTGRES_DB:-mumuai_novel}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - ai-story-network
    command:
      - postgres
      - -c
      - max_connections=${POSTGRES_MAX_CONNECTIONS:-200}
      - -c
      - shared_buffers=${POSTGRES_SHARED_BUFFERS:-256MB}
      - -c
      - effective_cache_size=${POSTGRES_EFFECTIVE_CACHE_SIZE:-1GB}
      - -c
      - maintenance_work_mem=${POSTGRES_MAINTENANCE_WORK_MEM:-64MB}
      - -c
      - checkpoint_completion_target=${POSTGRES_CHECKPOINT_COMPLETION_TARGET:-0.9}
      - -c
      - wal_buffers=${POSTGRES_WAL_BUFFERS:-16MB}
      - -c
      - default_statistics_target=${POSTGRES_DEFAULT_STATISTICS_TARGET:-100}
      - -c
      - random_page_cost=${POSTGRES_RANDOM_PAGE_COST:-1.1}
      - -c
      - effective_io_concurrency=${POSTGRES_EFFECTIVE_IO_CONCURRENCY:-200}
      - -c
      - work_mem=${POSTGRES_WORK_MEM:-4MB}
      - -c
      - min_wal_size=${POSTGRES_MIN_WAL_SIZE:-1GB}
      - -c
      - max_wal_size=${POSTGRES_MAX_WAL_SIZE:-4GB}

  mumuainovel:
    image: mumujie/mumuainovel:latest
    container_name: mumuainovel
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "${APP_PORT:-8000}:8000"
    volumes:
      - ./logs:/app/logs
      - ./.env:/app/.env:ro
      - ./storage/generated_covers:/app/backend/storage/generated_covers
    environment:
      # Application configuration
      - APP_NAME=${APP_NAME:-MuMuAINovel}
      - APP_VERSION=${APP_VERSION:-1.5.7}
      - APP_HOST=${APP_HOST:-0.0.0.0}
      - APP_PORT=8000
      - DEBUG=${DEBUG:-false}
      # Database configuration
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-mumuai}:${POSTGRES_PASSWORD:-123456}@postgres:5432/${POSTGRES_DB:-mumuai_novel}
      - DB_HOST=postgres
      - DB_PORT=5432
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-123456}
      # PostgreSQL connection pool configuration
      - DATABASE_POOL_SIZE=${DATABASE_POOL_SIZE:-30}
      - DATABASE_MAX_OVERFLOW=${DATABASE_MAX_OVERFLOW:-20}
      - DATABASE_POOL_TIMEOUT=${DATABASE_POOL_TIMEOUT:-60}
      - DATABASE_POOL_RECYCLE=${DATABASE_POOL_RECYCLE:-1800}
      - DATABASE_POOL_PRE_PING=${DATABASE_POOL_PRE_PING:-True}
      - DATABASE_POOL_USE_LIFO=${DATABASE_POOL_USE_LIFO:-True}
      # Global proxy settings (optional)
      - HTTP_PROXY=${HTTP_PROXY:-}
      - HTTPS_PROXY=${HTTPS_PROXY:-}
      - NO_PROXY=${NO_PROXY:-localhost,127.0.0.1}
      # AI service settings
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - OPENAI_BASE_URL=${OPENAI_BASE_URL:-https://api.openai.com/v1}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - GEMINI_BASE_URL=${GEMINI_BASE_URL:-}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-}
      - DEFAULT_AI_PROVIDER=${DEFAULT_AI_PROVIDER:-openai}
      - DEFAULT_MODEL=${DEFAULT_MODEL:-gpt-4o-mini}
      - DEFAULT_TEMPERATURE=${DEFAULT_TEMPERATURE:-0.7}
      - DEFAULT_MAX_TOKENS=${DEFAULT_MAX_TOKENS:-32000}
      - ALLOW_PRIVATE_AI_ENDPOINTS=${ALLOW_PRIVATE_AI_ENDPOINTS:-false}
      - ALLOWED_AI_HOSTS=${ALLOWED_AI_HOSTS:-}
      # LinuxDO OAuth settings
      - LINUXDO_CLIENT_ID=${LINUXDO_CLIENT_ID:-11111}
      - LINUXDO_CLIENT_SECRET=${LINUXDO_CLIENT_SECRET:-11111}
      - LINUXDO_REDIRECT_URI=${LINUXDO_REDIRECT_URI:-http://localhost:8000/api/auth/linuxdo/callback}
      - LINUXDO_PROXY_URL=${LINUXDO_PROXY_URL:-}
      - FRONTEND_URL=${FRONTEND_URL:-http://localhost:8000}
      # Local account login settings
      - LOCAL_AUTH_ENABLED=${LOCAL_AUTH_ENABLED:-true}
      - LOCAL_AUTH_USERNAME=${LOCAL_AUTH_USERNAME:-admin}
      - LOCAL_AUTH_PASSWORD=${LOCAL_AUTH_PASSWORD:-admin123}
      - LOCAL_AUTH_DISPLAY_NAME=${LOCAL_AUTH_DISPLAY_NAME:-Local Admin}
      # Session settings
      - SESSION_EXPIRE_MINUTES=${SESSION_EXPIRE_MINUTES:-120}
      - SESSION_REFRESH_THRESHOLD_MINUTES=${SESSION_REFRESH_THRESHOLD_MINUTES:-30}
      - SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE:-true}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - ai-story-network

volumes:
  postgres_data:
    driver: local

networks:
  ai-story-network:
    driver: bridge
```

</details>

```bash
# 3. Start the services
docker-compose up -d

# 4. View logs
docker-compose logs -f

# 5. Update to the latest version
docker-compose pull
docker-compose up -d
```

> **💡 提示**: Docker Hub 镜像已包含所有依赖和模型文件，无需额外下载

### 本地开发 / 从源码构建

#### 前置准备

```bash
# ⚠️ 重要：如果从源码构建，需要先下载 embedding 模型文件
# 模型文件较大（约 400MB），需放置到以下目录：
# backend/embedding/models--sentence-transformers--paraphrase-multilingual-MiniLM-L12-v2/
#
# 📥 获取方式：
# - 加入项目 QQ 群或 Linux DO 讨论区获取下载链接
# - 群号：见项目主页
# - Linux DO：https://linux.do/t/topic/1100112
```

#### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 配置 .env 文件
cp .env.example .env
# 编辑 .env 填入必要配置

# 启动 PostgreSQL（可使用 Docker）
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=mumuai_novel \
  -p 5432:5432 \
  postgres:18-alpine

# 启动后端
python -m uvicorn app.main:app --host localhost --port 8000 --reload
```

#### 前端

```bash
cd frontend
npm install
npm run dev  # 开发模式
npm run build  # 生产构建
```

## ⚙️ 配置说明

### 必需配置

创建 `.env` 文件：

```bash
# PostgreSQL 数据库（必需）
DATABASE_URL=postgresql+asyncpg://mumuai:your_password@postgres:5432/mumuai_novel
POSTGRES_PASSWORD=your_secure_password

# AI 服务
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://api.openai.com/v1
DEFAULT_AI_PROVIDER=openai
DEFAULT_MODEL=gpt-4o-mini

# 本地账户登录
LOCAL_AUTH_ENABLED=true
LOCAL_AUTH_USERNAME=admin
LOCAL_AUTH_PASSWORD=your_password
```

### 可选配置

```bash
# LinuxDO OAuth
LINUXDO_CLIENT_ID=your_client_id
LINUXDO_CLIENT_SECRET=your_client_secret
LINUXDO_REDIRECT_URI=http://localhost:8000/api/auth/callback
# LinuxDO 登录专用代理（可选，仅影响 OAuth token 与用户信息请求）
LINUXDO_PROXY_URL=http://127.0.0.1:7890

# PostgreSQL 连接池（高并发优化）
DATABASE_POOL_SIZE=30
DATABASE_MAX_OVERFLOW=20

# 会话 Cookie Secure 标记
# 默认 true，适合 HTTPS 部署；如果使用 HTTP 访问并且浏览器不保存登录 Cookie，可设为 false
SESSION_COOKIE_SECURE=true

# 本地 / Docker 内网 LLM（默认关闭，保持 SSRF 防护）
# ALLOW_PRIVATE_AI_ENDPOINTS=true
# ALLOWED_AI_HOSTS=host.docker.internal,127.0.0.1
```

> **🔐 Cookie Secure 说明**
>
> - HTTPS 部署：建议保持 `SESSION_COOKIE_SECURE=true`，浏览器只会通过 HTTPS 发送登录 Cookie。
> - HTTP 部署：如果登录后浏览器没有保存 Cookie，请在 `.env` 中设置 `SESSION_COOKIE_SECURE=false`，然后重启后端或 Docker 容器。
> - Docker Compose 示例默认使用 `SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE:-true}`，如需关闭必须在 `.env` 中显式配置。
>
> **🌐 LinuxDO 专用代理说明**
>
> - 如果只有 LinuxDO 授权登录在当前网络不可达，优先配置 `LINUXDO_PROXY_URL`，不要配置全局 `HTTP_PROXY` / `HTTPS_PROXY`。
> - `LINUXDO_PROXY_URL` 只会用于 LinuxDO OAuth 的 token 交换和用户信息请求，不影响 AI 服务、SMTP、数据库等其他网络调用。
> - 常见示例：`LINUXDO_PROXY_URL=http://127.0.0.1:7890`；Docker 容器内访问宿主机代理时通常需要使用宿主机在 Docker 网络中的地址，而不是容器内的 `127.0.0.1`。
> - 当前示例按 HTTP 代理配置；如果需要 SOCKS 代理，请先确保运行环境安装了 httpx 的 SOCKS 支持依赖。
>
> **🖥️ 本地 / Docker 内网 LLM 说明**
>
> - 默认会拒绝 `localhost`、`127.0.0.1`、私网 IP 以及解析到内网的主机名（例如 `host.docker.internal`），用于降低 SSRF 风险。
> - 如果 AI 服务跑在本机 Ollama / llama.cpp，或 Docker 容器需要访问宿主机上的模型，请在 `.env` 中设置 `ALLOW_PRIVATE_AI_ENDPOINTS=true`，或把允许的主机名写入 `ALLOWED_AI_HOSTS`。
> - 即使开启本地放行，链路本地地址（如云厂商元数据 `169.254.169.254`）仍然会被拒绝。
> - MCP 插件 URL 不受该开关影响，继续走严格的公网校验。

### 中转 API 配置

支持所有 OpenAI 兼容格式的中转服务：

```bash
# New API 示例
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_BASE_URL=https://api.new-api.com/v1

# 其他中转服务
OPENAI_BASE_URL=https://your-proxy-service.com/v1
```

## 🐳 Docker deployment details

### Service architecture

- **postgres**: PostgreSQL 18 database
  - Port: 5432
  - Persistence: `postgres_data` volume
  - Initialization script: `backend/scripts/init_postgres.sql` (auto-mounted)
  - Optimized config: supports 80–150 concurrent users

- **mumuainovel**: main application service
  - Port: 8000
  - Log directory: `./logs`
  - Config mount: `.env` file
  - Waits for database readiness automatically
  - Health checks run every 30 seconds

### Important files

| File | Description | Required |
|------|-------------|----------|
| `.env` | Environment configuration (API keys, database password, etc.) | ✅ Required |
| `docker-compose.yml` | Service orchestration config | ✅ Required |
| `backend/scripts/init_postgres.sql` | PostgreSQL extension setup script | ✅ Auto-mounted |
| `backend/embedding/models--*/` | Embedding model files | ⚠️ Required for source builds |

> **Note**: When using the Docker Hub image, the model files are already included in the image, so no extra download is needed.

### Common commands

```bash
# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Check resource usage
docker stats
```

### Data persistence

- `./postgres_data` - PostgreSQL database files
- `./logs` - application log files

### Port configuration

Change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "8800:8000"  # host:container
```

## 📁 Project structure

```text
MuMuAINovel/
├── backend/                 # Backend services
│   ├── app/
│   │   ├── api/            # API routes
│   │   ├── models/         # Data models
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Middleware
│   │   ├── database.py     # Database connection
│   │   └── main.py         # Application entry point
│   ├── scripts/            # Utility scripts
│   └── requirements.txt    # Python dependencies
├── frontend/               # Frontend app
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── services/      # API service layer
│   │   └── store/         # State management
│   └── package.json
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile              # Docker image build
└── README.md
```

## 🛠️ Tech stack

**Backend**: FastAPI • PostgreSQL • SQLAlchemy • OpenAI/Claude/Gemini SDK

**Frontend**: React 18 • TypeScript • Ant Design • Zustand • Vite

## 📖 Usage guide

1. **Login system** - use either a local account or a LinuxDO account
2. **Create a project** - choose "Create using the wizard"
3. **AI generation** - enter the basics and let the AI generate the outline and characters
4. **Refine and edit** - manage character relationships, generate chapters, and polish the story

### API docs

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## 🤝 Contributing

We welcome issues and pull requests!

1. Fork this project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a pull request

### Contributors

Thanks to everyone who has contributed to this project!

<a href="https://github.com/xiamuceer-j/MuMuAINovel/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=xiamuceer-j/MuMuAINovel" />
</a>

## 📝 License

This project is distributed under the [GNU General Public License v3.0](LICENSE).

**GPL v3 means:**
- ✅ You can use, modify, and distribute it freely
- ✅ Commercial use is allowed
- 📝 Modified versions must remain open source
- 📝 You must keep the original copyright notice
- 📝 Derivative works must use the GPL v3 license

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) - Python web framework
- [React](https://react.dev/) - Frontend framework
- [Ant Design](https://ant.design/) - UI component library
- [PostgreSQL](https://www.postgresql.org/) - Database

## 📧 Contact

- Submit an [Issue](https://github.com/xiamuceer-j/MuMuAINovel/issues)
- Linux DO [discussion](https://linux.do/t/topic/1106333)
- Join the QQ group [QQ group](frontend/public/qq.jpg)
- Join the WeChat group [WeChat group](frontend/public/WX.png)

---

<div align="center">

**If this project has been helpful, please give it a ⭐️ Star!**

Made with ❤️

</div>

## Star History

<a href="https://star-history.dera.page/#xiamuceer-j/MuMuAINovel&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=xiamuceer-j/MuMuAINovel&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=xiamuceer-j/MuMuAINovel&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=xiamuceer-j/MuMuAINovel&type=date&legend=top-left" />
 </picture>
</a>

## History

![Alt](https://repobeats.axiom.co/api/embed/ee7141a5f269c64759302e067abe23b46796bafe.svg "Repobeats analytics image")
