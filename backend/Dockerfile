# Stage 1: compile the NestJS application.
# We keep build and runtime stages separate because production images should be smaller and cleaner.
FROM node:20-alpine AS build

WORKDIR /app

# Copy manifests first to maximize Docker layer caching.
COPY package*.json ./

# Install all dependencies with retry for network stability.
RUN npm install || (sleep 5 && npm install) || (sleep 10 && npm install)

# Copy the source after dependencies to avoid invalidating the cache too early.
COPY . .

# Compile TypeScript into distributable JavaScript.
RUN npm run build

# Stage 2: create the production runtime image.
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Install only runtime dependencies in the final image.
COPY package*.json ./
# Install only runtime dependencies with retry.
RUN npm install --omit=dev || (sleep 5 && npm install --omit=dev) || (sleep 10 && npm install --omit=dev)

# Copy the compiled application from the build stage.
COPY --from=build /app/dist ./dist

EXPOSE 3000

# Run the compiled NestJS gateway in production mode.
CMD ["node", "dist/main.js"]
