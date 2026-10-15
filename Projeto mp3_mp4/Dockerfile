FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/media
ENV PATH="/opt/media/bin:${PATH}"
# EJS acompanha a distribuição default, necessário para os desafios atuais do YouTube.
RUN pip install --no-cache-dir 'yt-dlp[default]'
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node backend/ ./
RUN mkdir -p downloads && chown node:node downloads
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
CMD ["node", "server.js"]
