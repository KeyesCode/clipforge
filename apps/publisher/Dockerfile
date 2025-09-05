# syntax=docker/dockerfile:1.6

########## 1) Deps: install ALL deps (incl. dev) ##########
FROM node:20-alpine AS deps
WORKDIR /app

# copy manifests (lockfile optional)
COPY package*.json ./

# small runtime compat often needed by sharp/ffmpeg-static on Alpine
RUN apk add --no-cache libc6-compat

# Use lockfile if present; otherwise fall back to npm install
# (BuildKit cache flag must be immediately after RUN)
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi


########## 2) Build: compile TS using deps' node_modules ##########
FROM node:20-alpine AS build
WORKDIR /app

# bring in node_modules from deps
COPY --from=deps /app/node_modules ./node_modules

# bring in source
COPY . .

# devDeps (typescript, etc.) are available from node_modules
RUN npm run build


########## 3) Runtime: only production deps + built artifacts ##########
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# same compat pkg as above (safe, tiny)
RUN apk add --no-cache libc6-compat

# copy manifests (lockfile optional)
COPY package*.json ./

# prod deps only; lockfile if present, otherwise install
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# copy compiled output
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
