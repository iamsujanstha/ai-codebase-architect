# Stage 1: build the React application.
# We use a full Node.js image here because compiling TypeScript and bundling assets needs build tooling.
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests first for better layer caching.
COPY package.json ./

# npm install is used instead of npm ci because this teaching repo may be extended without a lockfile.
RUN npm install

# Copy the rest of the source only after dependencies are installed.
COPY . .

# Build a production bundle that Nginx can serve as static assets.
RUN npm run build

# Stage 2: serve the compiled assets with Nginx.
# This mirrors a common production pattern where the frontend is just static files behind a web server.
FROM nginx:1.27-alpine

# Replace the default site config so Nginx can both serve the SPA and proxy API requests to the backend service.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled frontend bundle from the build stage.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Nginx stays in the foreground so the container remains alive.
CMD ["nginx", "-g", "daemon off;"]

