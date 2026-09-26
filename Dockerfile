FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	&& python3 -m venv /opt/venv

COPY requirements.txt ./requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir \
	--index-url https://download.pytorch.org/whl/cpu \
	--extra-index-url https://pypi.org/simple \
	-r requirements.txt

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.js ./
COPY src ./src
COPY llm/tiny_transformer.py ./llm/tiny_transformer.py
COPY llm/tiny_transformer.pt ./llm/tiny_transformer.pt

ENV NODE_ENV=production
ENV TINY_LLM_PYTHON=/opt/venv/bin/python

USER node

CMD ["node", "index.js"]
